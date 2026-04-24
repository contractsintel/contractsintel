#!/usr/bin/env node
/**
 * DSBS / SBS proof-of-concept scraper.
 *
 * What this is
 * ------------
 * A minimal, self-contained script to validate the approach proposed in
 * docs/architecture/dsbs-scraper-plan.md: use the existing Patchright
 * install to paginate https://search.certifications.sba.gov/ with a
 * HUBZone cert filter applied, extract ~100 firms from the results table
 * (name, contact person, email, certs, address), and — if --write is
 * passed — upsert them into `leads` with source='dsbs_poc'.
 *
 * What this is NOT
 * ----------------
 * - Not wired into any cron.
 * - Not exposed as an HTTP endpoint in server.js.
 * - Not deployed to Railway as part of this PR.
 * - Not the full-universe scraper — that's the follow-up PR.
 *
 * The source tag is 'dsbs_poc' (not 'dsbs') precisely so any rows this
 * script writes are trivially filterable and deletable without touching
 * the production 'dsbs' rows the full scraper will eventually write.
 *
 * Usage
 * -----
 *   cd puppeteer-server
 *   npm install @supabase/supabase-js   # if not already installed
 *   node scripts/dsbs-poc.js                  # dry-run (default): print only
 *   node scripts/dsbs-poc.js --write          # upsert to leads, source='dsbs_poc'
 *   node scripts/dsbs-poc.js --pages=3        # override default 5 pages
 *   node scripts/dsbs-poc.js --cert=HUBZone   # override default HUBZone
 *
 * Env (for --write mode)
 * ----------------------
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Selectors
 * ---------
 * This is an SPA we have not yet reverse-engineered. The selector
 * constants in EXPECTED_SELECTORS are best-guesses based on typical
 * React table structure; the script will log what it actually sees
 * and exit cleanly on mismatch so we can tune without a crash.
 */

"use strict";

const { chromium } = require("patchright");

const ARGS = process.argv.slice(2);
const flag = (name) => ARGS.some((a) => a === `--${name}` || a.startsWith(`--${name}=`));
const optVal = (name, def) => {
  const match = ARGS.find((a) => a.startsWith(`--${name}=`));
  return match ? match.split("=")[1] : def;
};

const DRY_RUN = !flag("write");
const PAGES = parseInt(optVal("pages", "5"), 10);
const CERT = optVal("cert", "HUBZone");
const SEARCH_URL = "https://search.certifications.sba.gov/";
const INTER_PAGE_MS = 2500;
const NAV_TIMEOUT = 45000;

// Best-guess selectors — tune against live DOM on first run.
const EXPECTED_SELECTORS = {
  searchInput: 'input[type="search"], input[placeholder*="Search" i]',
  certFilterButton: 'button:has-text("Certifications"), button:has-text("Filter")',
  certOption: (label) => `label:has-text("${label}"), input[value="${label}" i]`,
  resultsRow: 'table tbody tr, [role="row"]:not([role="columnheader"])',
  nextButton: 'button[aria-label*="next" i], button:has-text("Next")',
};

const STEALTH_UAS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:133.0) Gecko/20100101 Firefox/133.0",
];
const pickUA = () => STEALTH_UAS[Math.floor(Math.random() * STEALTH_UAS.length)];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = (ms) => ms + Math.floor((Math.random() - 0.5) * 1000);

function normEmail(s) {
  return (s || "").toLowerCase().trim();
}

function splitName(fullName) {
  const parts = (fullName || "").trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return { first_name: null, last_name: null };
  if (parts.length === 1) return { first_name: parts[0], last_name: null };
  return { first_name: parts[0], last_name: parts.slice(1).join(" ") };
}

function certToPrimary(cert) {
  const c = (cert || "").toLowerCase();
  if (c.includes("hubzone")) return "hubzone";
  if (c.includes("sdvosb") || c.includes("service-disabled")) return "sdvosb";
  if (c.includes("8(a)") || c.includes("8a")) return "8a";
  if (c.includes("edwosb")) return "edwosb";
  if (c.includes("wosb")) return "wosb";
  return null;
}

/**
 * Extract all rows from the current results-table page.
 * Returns an array of flat row objects with best-effort field mapping.
 *
 * Because the live DOM has not been confirmed yet, this function tries
 * two extraction strategies in order:
 *   1. Structured table: <table><tbody><tr><td>...</td>...</tr></tbody></table>
 *   2. Role-based rows: [role="row"] containing [role="cell"]
 * and logs a warning if neither yields rows, so we can iterate selectors.
 */
async function extractPageRows(page) {
  // Wait for either a table row or a role-based row to appear.
  await page
    .waitForSelector(EXPECTED_SELECTORS.resultsRow, { timeout: 15000 })
    .catch(() => {});

  const rows = await page.evaluate(() => {
    function textOf(el) {
      return (el && el.textContent ? el.textContent : "").replace(/\s+/g, " ").trim();
    }
    function firstEmail(text) {
      const m = (text || "").match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
      return m ? m[0] : null;
    }
    const out = [];

    // Strategy 1: classic <table>
    const trs = Array.from(document.querySelectorAll("table tbody tr"));
    if (trs.length) {
      for (const tr of trs) {
        const tds = Array.from(tr.querySelectorAll("td"));
        const cellText = tds.map(textOf);
        const joined = cellText.join(" | ");
        out.push({
          strategy: "table",
          cells: cellText,
          joined,
          email: firstEmail(joined),
          html: tr.outerHTML.slice(0, 400),
        });
      }
      return out;
    }

    // Strategy 2: role-based
    const roleRows = Array.from(
      document.querySelectorAll('[role="row"]:not([role="columnheader"])'),
    );
    for (const r of roleRows) {
      const cells = Array.from(r.querySelectorAll('[role="cell"], [role="gridcell"]'));
      const cellText = cells.map(textOf);
      const joined = cellText.join(" | ");
      out.push({
        strategy: "role",
        cells: cellText,
        joined,
        email: firstEmail(joined),
        html: r.outerHTML.slice(0, 400),
      });
    }
    return out;
  });

  return rows;
}

/**
 * Heuristically map an extracted row to a `leads` row shape.
 *
 * Column order in the results table (per Raphael's manual observation
 * 2026-04-24): name, capabilities narrative, active SBA certifications,
 * contact person + email, address. This maps to that order but tolerates
 * shifts by treating emails, certs, and long prose as content-detected
 * rather than strictly positional.
 */
function rowToLead(row) {
  const cells = row.cells || [];
  const email = normEmail(row.email);
  if (!email) return null;

  // Content-based detection so we're robust to column reordering.
  const isCertBlob = (t) =>
    /hubzone|wosb|edwosb|sdvosb|8\(a\)|women-owned|veteran/i.test(t || "");
  const isLongProse = (t) => (t || "").length > 120;

  const nameCell = cells[0] || "";
  const certCell = cells.find(isCertBlob) || "";
  const proseCell = cells.find(isLongProse) || "";
  const contactCell = cells.find((t) => (t || "").includes(email)) || "";
  const addressCell = cells.slice().reverse().find((t) => /\b[A-Z]{2}\s+\d{5}(-\d{4})?\b/.test(t || "")) || "";

  // Contact person = text of the contact cell minus the email portion.
  const contactName = contactCell
    .replace(new RegExp(email, "i"), "")
    .replace(/[|,;]/g, " ")
    .trim();
  const { first_name, last_name } = splitName(contactName);

  // Cert list.
  const cert_types = [];
  for (const m of certCell.matchAll(/HUBZone|WOSB|EDWOSB|SDVOSB|8\(a\)/gi)) {
    const v = m[0].toLowerCase().replace("(", "").replace(")", "");
    const norm = v === "8a" ? "8a" : v;
    if (!cert_types.includes(norm)) cert_types.push(norm);
  }
  const primary_cert = certToPrimary(CERT) || cert_types[0] || null;

  // Address — crude best-effort split.
  const addressMatch = addressCell.match(/^(.*?),\s*([A-Z\s]+?),?\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)\s*$/);
  let address = null, city = null, state = null, zip = null;
  if (addressMatch) {
    address = addressMatch[1].trim();
    city = addressMatch[2].trim();
    state = addressMatch[3];
    zip = addressMatch[4];
  } else {
    address = addressCell || null;
  }

  return {
    email,
    first_name,
    last_name,
    company: nameCell || null,
    address,
    city,
    state,
    zip,
    cert_types,
    primary_cert,
    capabilities: proseCell || null, // not a leads column — see writer; used for spot-check only
    source: "dsbs_poc",
    source_url: SEARCH_URL,
    dedup_key: email, // no UEI in results table; fall back to email per migration comment
  };
}

async function applyCertFilter(page, cert) {
  // Best-effort: look for a filter trigger, click it, then click the option.
  // If selectors don't match, log and continue — caller sees raw page content.
  try {
    const trigger = await page.$(EXPECTED_SELECTORS.certFilterButton);
    if (trigger) {
      await trigger.click();
      await sleep(600);
    }
    const option = await page.$(EXPECTED_SELECTORS.certOption(cert));
    if (option) {
      await option.click();
      await sleep(1200);
      return true;
    }
  } catch (e) {
    console.warn(`[cert-filter] selector miss: ${e.message}`);
  }
  console.warn(
    `[cert-filter] could not apply ${cert} programmatically — POC will scrape the default view.`,
  );
  return false;
}

async function goNextPage(page) {
  const nextBtn = await page.$(EXPECTED_SELECTORS.nextButton);
  if (!nextBtn) return false;
  const disabled = await nextBtn.isDisabled().catch(() => false);
  if (disabled) return false;
  await nextBtn.click();
  await sleep(jitter(INTER_PAGE_MS));
  return true;
}

async function writeBatch(rows) {
  if (DRY_RUN) {
    console.log(`[dry-run] would upsert ${rows.length} rows to leads (source='dsbs_poc')`);
    return { inserted: 0, skipped: rows.length };
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required for --write");
  }
  const { createClient } = require("@supabase/supabase-js");
  const supabase = createClient(url, key);

  // `capabilities` is not a leads column — strip it before the upsert.
  const payload = rows.map(({ capabilities: _drop, ...keep }) => keep);

  const { data, error } = await supabase
    .from("leads")
    .upsert(payload, { onConflict: "dedup_key", ignoreDuplicates: false })
    .select("id");
  if (error) {
    console.error(`[upsert] error: ${error.message}`);
    return { inserted: 0, skipped: rows.length };
  }
  return { inserted: data?.length || 0, skipped: 0 };
}

async function main() {
  console.log(
    `[dsbs-poc] start mode=${DRY_RUN ? "dry-run" : "WRITE"} pages=${PAGES} cert=${CERT}`,
  );
  const browser = await chromium.launch({ headless: true });
  const ua = pickUA();
  const context = await browser.newContext({
    userAgent: ua,
    viewport: { width: 1440, height: 900 },
    locale: "en-US",
    timezoneId: "America/New_York",
  });
  const page = await context.newPage();

  let totalSeen = 0;
  let totalKept = 0;
  const allLeads = [];

  try {
    await page.goto(SEARCH_URL, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT });
    await sleep(jitter(2000));

    await applyCertFilter(page, CERT);

    for (let i = 0; i < PAGES; i++) {
      const rows = await extractPageRows(page);
      totalSeen += rows.length;
      console.log(`[page ${i + 1}] saw ${rows.length} rows (strategy=${rows[0]?.strategy || "none"})`);

      for (const row of rows) {
        const lead = rowToLead(row);
        if (lead) {
          allLeads.push(lead);
          totalKept++;
        }
      }

      if (rows.length === 0) {
        console.warn(
          "[page] 0 rows — likely selector mismatch. Dumping current page URL + title for tuning:",
        );
        console.warn(`  url=${page.url()} title=${await page.title()}`);
        break;
      }

      if (i < PAGES - 1) {
        const advanced = await goNextPage(page);
        if (!advanced) {
          console.log("[pagination] no more pages (next button missing or disabled).");
          break;
        }
      }
    }
  } catch (err) {
    console.error(`[fatal] ${err.message}`);
  } finally {
    await browser.close().catch(() => {});
  }

  console.log(`\n=== summary ===`);
  console.log(`rows seen:   ${totalSeen}`);
  console.log(`rows kept:   ${totalKept}  (email visible, mappable)`);
  if (allLeads.length) {
    const sample = allLeads.slice(0, 3).map((r) => ({
      company: r.company,
      contact: [r.first_name, r.last_name].filter(Boolean).join(" "),
      email: r.email,
      cert_types: r.cert_types,
      city_state: [r.city, r.state].filter(Boolean).join(", "),
    }));
    console.log("first 3 mapped rows:");
    console.log(JSON.stringify(sample, null, 2));

    const { inserted, skipped } = await writeBatch(allLeads);
    console.log(`\nwrite: inserted=${inserted} skipped=${skipped}`);
  }
  console.log(`mode was: ${DRY_RUN ? "dry-run (no DB writes)" : "WRITE"}`);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
