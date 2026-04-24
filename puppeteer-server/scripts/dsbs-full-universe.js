#!/usr/bin/env node
/**
 * DSBS / SBS full-universe scraper (direct API).
 *
 * Sweeps all 5 target certs via POST https://search.certifications.sba.gov/_api/v2/search,
 * unions rows on UEI into a single record per firm, resolves primary_cert by
 * product-locked priority, and upserts to public.leads with source='dsbs'.
 *
 * ---------------------------------------------------------------------------
 * What this script does
 * ---------------------------------------------------------------------------
 * 1. For each of { 8a, HUBZone, WOSB, EDWOSB, SDVOSB }, POSTs the SPA's
 *    nested search body with that cert's activeCerts value. Each call
 *    returns the COMPLETE matching universe in a single response (no
 *    pagination; we confirmed with a 34,057-row SDVOSB body).
 * 2. Sleeps 2.5s between calls — courtesy only; the endpoint is fine.
 * 3. Merges results keyed by UEI (falls back to lowercase email when UEI
 *    is absent, which is rare — 100% UEI coverage in the HUBZone sample).
 *    cert_types[] is the union of every cert the firm actually holds,
 *    derived from the row's active_*_boolean flags (NOT from which sweep
 *    returned it — a HUBZone firm that's also SDVOSB will surface in both
 *    sweeps, but we only write one row).
 * 4. Resolves primary_cert via priority: hubzone > sdvosb > 8a > wosb > edwosb.
 * 5. Maps each merged row to the `leads` table schema and upserts with
 *    onConflict:"dedup_key", source='dsbs'. Idempotent.
 * 6. Writes one scraper_runs row per cert sweep + one summary row.
 *    cron_alerts (severity='error', source='dsbs-scraper') on API failure.
 *
 * ---------------------------------------------------------------------------
 * SDVOSB cert-code correction (2026-04-24)
 * ---------------------------------------------------------------------------
 * The earlier POC doc said VOSB="9,10" and implied SDVOSB needed a separate
 * self-cert path. Re-grepping the SPA bundle (`tc=[{label,value}...]`) shows
 * the real mapping: **SDVOSB="9,10"** (the codes are service-disabled by
 * definition — the "Veteran-Owned Small Business (VOSB)" entry is codes
 * "7,8"). A live probe with activeCerts=[{label:"SDVOSB",value:"9,10"}]
 * returned 34,057 rows with meili_filter "active_sdvosb_boolean = true",
 * confirming SDVOSB is a first-class cert filter. No self-cert fallback
 * needed.
 *
 * ---------------------------------------------------------------------------
 * Schema note
 * ---------------------------------------------------------------------------
 * We map to the POC-validated subset of `leads` columns (everything in the
 * 20260417_leads_cold_outbound_routing migration). The DSBS response carries
 * additional fields — capabilities_narrative, year_established, annual_revenue,
 * business_size, county, keywords[], per-cert booleans — that are captured
 * into the script's `full` record and surfaced in dry-run output for review,
 * but NOT written to `leads` because the table has no columns for them yet.
 * Follow-up migration to add `raw_data jsonb` + a few first-class columns
 * is proposed in the PR description; wiring lands in a separate PR so this
 * one stays schema-safe.
 *
 * ---------------------------------------------------------------------------
 * Usage
 * ---------------------------------------------------------------------------
 *   node puppeteer-server/scripts/dsbs-full-universe.js              # dry-run
 *   node puppeteer-server/scripts/dsbs-full-universe.js --write      # upsert to leads
 *   node puppeteer-server/scripts/dsbs-full-universe.js --limit=500  # per-cert cap (dev only)
 *   node puppeteer-server/scripts/dsbs-full-universe.js --cert=HUBZone,SDVOSB
 *
 * Env for --write:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

"use strict";

const ARGS = process.argv.slice(2);
const flag = (n) => ARGS.some((a) => a === `--${n}` || a.startsWith(`--${n}=`));
const optVal = (n, d) => {
  const m = ARGS.find((a) => a.startsWith(`--${n}=`));
  return m ? m.split("=")[1] : d;
};

const DRY_RUN = !flag("write");
const PER_CERT_LIMIT = parseInt(optVal("limit", "0"), 10) || 0; // 0 = no cap
const CERTS_ARG = optVal("cert", "");
const UPSERT_BATCH = 500;
const PAUSE_BETWEEN_CERTS_MS = 2_500;

const API_URL = "https://search.certifications.sba.gov/_api/v2/search";

// Cert codes (recovered from SPA bundle `tc=[{label,value}...]`, verified live).
const CERT_CODES = {
  "8a": { value: "1,4", label: "8(a) or 8(a) Joint Venture", slug: "8a" },
  HUBZone: { value: "3", label: "HUBZone", slug: "hubzone" },
  WOSB: {
    value: "5",
    label: "Women-Owned Small Business (WOSB)",
    slug: "wosb",
  },
  EDWOSB: {
    value: "6",
    label: "Economically-Disadvantaged Women-Owned Small Business (EDWOSB)",
    slug: "edwosb",
  },
  SDVOSB: {
    value: "9,10",
    label: "Service-Disabled Veteran-Owned Small Business (SDVOSB)",
    slug: "sdvosb",
  },
};

const CERT_FLAG_TO_NAME = {
  active_hz_boolean: "hubzone",
  active_8a_boolean: "8a",
  active_8a_jv_boolean: "8a",
  active_wosb_boolean: "wosb",
  active_edwosb_boolean: "edwosb",
  active_sdvosb_boolean: "sdvosb",
  active_sdvosb_jv_boolean: "sdvosb",
  // VOSB is tracked for completeness but we don't route to a VOSB campaign
  // and VOSB alone is not one of our 5 targets.
  active_vosb_boolean: "vosb",
  active_vosb_jv_boolean: "vosb",
};

// Product-locked priority, 2026-04-24.
const CERT_PRIORITY = ["hubzone", "sdvosb", "8a", "wosb", "edwosb"];

function buildBody(certCode) {
  return {
    searchProfiles: { searchTerm: "" },
    location: { states: [], zipCodes: [], counties: [], districts: [], msas: [] },
    sbaCertifications: {
      activeCerts: [certCode], // { label, value }
      isPreviousCert: false,
      operatorType: "Or",
    },
    naics: { codes: [], isPrimary: false, operatorType: "Or" },
    selfCertifications: { certifications: [], operatorType: "Or" },
    keywords: { list: [], operatorType: "Or" },
    lastUpdated: { date: { label: "Anytime", value: "anytime" } },
    samStatus: { isActiveSAM: false },
    qualityAssuranceStandards: { qas: [] },
    bondingLevels: {
      constructionIndividual: "",
      constructionAggregate: "",
      serviceIndividual: "",
      serviceAggregate: "",
    },
    businessSize: { relationOperator: "at-least", numberOfEmployees: "" },
    annualRevenue: { relationOperator: "at-least", annualGrossRevenue: "" },
    entityDetailId: "",
  };
}

async function fetchCertUniverse(certName) {
  const code = CERT_CODES[certName];
  if (!code) throw new Error(`unknown cert: ${certName}`);
  const t0 = Date.now();
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://search.certifications.sba.gov",
      Referer: "https://search.certifications.sba.gov/advanced?page=0",
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    },
    body: JSON.stringify(buildBody(code)),
  });
  const ms = Date.now() - t0;
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`_api/v2/search HTTP ${res.status} (${certName}): ${body.slice(0, 300)}`);
  }
  const json = await res.json();
  return {
    results: json.results || [],
    filter: json.meili_filter || null,
    ms,
  };
}

function splitName(full) {
  const parts = (full || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { first_name: null, last_name: null };
  if (parts.length === 1) return { first_name: parts[0], last_name: null };
  return { first_name: parts[0], last_name: parts.slice(1).join(" ") };
}

function deriveCerts(row) {
  const set = new Set();
  for (const [fl, name] of Object.entries(CERT_FLAG_TO_NAME)) {
    if (row[fl]) set.add(name);
  }
  return set;
}

function primaryCert(certSet) {
  for (const c of CERT_PRIORITY) if (certSet.has(c)) return c;
  // Fallback: if a firm only holds VOSB (not one of our 5 targets), leave null —
  // the leads check constraint rejects non-target values and we don't route
  // VOSB-only firms to any campaign.
  return null;
}

function keyFor(row) {
  const uei = (row.uei || "").trim();
  const email = (row.email || "").trim().toLowerCase();
  const k = uei || email;
  return k ? k.toLowerCase() : null;
}

/**
 * Merge a single API row into `seen`. If the key is new, create a full record.
 * If seen before, union cert flags — the row we keep is whichever one we
 * encountered first (they're the same firm, shouldn't differ meaningfully).
 */
function mergeInto(seen, row) {
  const key = keyFor(row);
  if (!key) return { merged: false, newKey: false };
  const certs = deriveCerts(row);
  const existing = seen.get(key);
  if (existing) {
    for (const c of certs) existing.certSet.add(c);
    return { merged: true, newKey: false };
  }
  seen.set(key, { row, certSet: certs });
  return { merged: true, newKey: true };
}

function recordToLead(record) {
  const { row, certSet } = record;
  const email = (row.email || "").toLowerCase().trim() || null;
  const uei = row.uei || null;
  if (!uei && !email) return null;

  const { first_name, last_name } = splitName(row.contact_person);
  const certs = [...certSet];
  const pc = primaryCert(certSet);
  const dedup_key = (uei || email).toLowerCase();

  return {
    email,
    first_name,
    last_name,
    title: null,
    phone: row.phone || null,
    company: row.legal_business_name || row.dba_name || null,
    address: [row.address_1, row.address_2].filter(Boolean).join(" ") || null,
    city: row.city || null,
    state: row.state || null,
    zip: row.zipcode || null,
    uei,
    cage_code: row.cage_code || null,
    entity_url: row.website || row.additional_website || null,
    cert_types: certs,
    primary_cert: pc,
    naics_codes: row.naics_all_codes || (row.naics_primary ? [row.naics_primary] : []),
    source: "dsbs",
    source_url: uei ? `https://dsbs.sba.gov/search/dsp_profile.cfm?SAM_UEI=${uei}` : null,
    dedup_key,
  };
}

function supabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required for --write");
  }
  const { createClient } = require("@supabase/supabase-js");
  return createClient(url, key);
}

async function upsertBatch(supabase, rows) {
  if (!rows.length) return { inserted: 0, errors: 0 };
  let inserted = 0;
  let errors = 0;
  for (let i = 0; i < rows.length; i += UPSERT_BATCH) {
    const batch = rows.slice(i, i + UPSERT_BATCH);
    const { data, error } = await supabase
      .from("leads")
      .upsert(batch, { onConflict: "dedup_key", ignoreDuplicates: false })
      .select("id");
    if (error) {
      console.error(`  upsert error @${i}: ${error.message}`);
      errors += batch.length;
    } else {
      inserted += data?.length || 0;
    }
  }
  return { inserted, errors };
}

async function logScraperRun(supabase, payload) {
  if (!supabase) return;
  const { error } = await supabase.from("scraper_runs").insert({
    source: payload.source,
    status: payload.status,
    opportunities_found: payload.opportunities_found,
    matches_created: payload.matches_created,
    error_message: payload.error_message || null,
    started_at: payload.started_at,
    completed_at: payload.completed_at,
  });
  if (error) console.error(`  scraper_runs log error: ${error.message}`);
}

async function raiseAlert(supabase, severity, message, context) {
  if (!supabase) {
    console.error(`[alert:${severity}] ${message}`, context || "");
    return;
  }
  const { error } = await supabase.from("cron_alerts").insert({
    severity,
    source: "dsbs-scraper",
    message,
    context: context || null,
  });
  if (error) console.error(`  cron_alerts log error: ${error.message}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const CERTS = CERTS_ARG
    ? CERTS_ARG.split(",").map((s) => s.trim()).filter(Boolean)
    : Object.keys(CERT_CODES);

  for (const c of CERTS) {
    if (!CERT_CODES[c]) {
      throw new Error(`unknown cert '${c}'. valid: ${Object.keys(CERT_CODES).join(",")}`);
    }
  }

  console.log(
    `[dsbs-full-universe] mode=${DRY_RUN ? "DRY-RUN" : "WRITE"} certs=${CERTS.join(",")} ` +
      `limit-per-cert=${PER_CERT_LIMIT || "none"}`
  );

  let supabase = null;
  if (!DRY_RUN) supabase = supabaseClient();

  // Per-cert stats + global merge.
  const seen = new Map();
  const perCert = [];
  let totalFetched = 0;
  let totalOptOut = 0;
  const overallStart = new Date().toISOString();
  const overallT0 = Date.now();

  for (let i = 0; i < CERTS.length; i++) {
    const certName = CERTS[i];
    const startedAt = new Date().toISOString();
    try {
      const { results, filter, ms } = await fetchCertUniverse(certName);
      const slice = PER_CERT_LIMIT > 0 ? results.slice(0, PER_CERT_LIMIT) : results;

      let newKeys = 0;
      let dupMerges = 0;
      let optOutThisCert = 0;
      for (const r of slice) {
        if (!r.email) optOutThisCert++; // proxy: email hidden => opted out
        const { newKey } = mergeInto(seen, r);
        if (newKey) newKeys++;
        else dupMerges++;
      }

      const withEmail = slice.filter((r) => r.email).length;
      perCert.push({
        cert: certName,
        filter,
        api_ms: ms,
        rows_fetched: slice.length,
        with_email: withEmail,
        opt_out: optOutThisCert,
        new_unique_firms: newKeys,
        merged_into_existing: dupMerges,
        started_at: startedAt,
      });

      totalFetched += slice.length;
      totalOptOut += optOutThisCert;

      console.log(
        `  [${certName.padEnd(7)}] ${slice.length.toString().padStart(6)} rows in ${ms}ms — ` +
          `${withEmail} with email, ${newKeys} new, ${dupMerges} already seen`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[FATAL] ${certName}: ${msg}`);
      await raiseAlert(supabase, "error", `DSBS sweep failed: ${certName}`, { error: msg });
      // Log failed cert run and exit cleanly.
      await logScraperRun(supabase, {
        source: `dsbs_${CERT_CODES[certName].slug}`,
        status: "error",
        opportunities_found: 0,
        matches_created: 0,
        error_message: msg,
        started_at: startedAt,
        completed_at: new Date().toISOString(),
      });
      process.exit(2);
    }

    if (i < CERTS.length - 1) {
      await new Promise((r) => setTimeout(r, PAUSE_BETWEEN_CERTS_MS));
    }
  }

  // Map merged records -> leads rows.
  const leads = [];
  for (const rec of seen.values()) {
    const lead = recordToLead(rec);
    if (lead) leads.push(lead);
  }

  // Quality roll-ups.
  const uniqueFirms = leads.length;
  const withEmail = leads.filter((l) => l.email).length;
  const multiCert = leads.filter((l) => (l.cert_types || []).length > 1).length;
  const certBreakdown = {};
  for (const l of leads) {
    for (const c of l.cert_types) certBreakdown[c] = (certBreakdown[c] || 0) + 1;
  }
  const primaryBreakdown = {};
  for (const l of leads) {
    const p = l.primary_cert || "<none>";
    primaryBreakdown[p] = (primaryBreakdown[p] || 0) + 1;
  }

  // Duplicates == rows fetched minus unique firms on the write side (email-keyed
  // rows with no UEI may also merge on lowercase email).
  const expectedDuplicates = totalFetched - uniqueFirms;

  console.log("\n========== SWEEP COMPLETE ==========");
  console.log(`total rows fetched across sweeps: ${totalFetched}`);
  console.log(`unique firms (post-merge by UEI):  ${uniqueFirms}`);
  console.log(`expected duplicate rows (sum-fetched − unique): ${expectedDuplicates}`);
  console.log(
    `opt-out proxy (rows with no email, across all sweeps incl. dupes): ${totalOptOut} / ${totalFetched} ` +
      `(${((100 * totalOptOut) / Math.max(1, totalFetched)).toFixed(1)}%)`
  );
  console.log(
    `email coverage on unique firms: ${withEmail}/${uniqueFirms} ` +
      `(${((100 * withEmail) / Math.max(1, uniqueFirms)).toFixed(1)}%)`
  );
  console.log(
    `multi-cert on unique firms: ${multiCert}/${uniqueFirms} ` +
      `(${((100 * multiCert) / Math.max(1, uniqueFirms)).toFixed(1)}%)`
  );

  console.log("\nper cert:");
  for (const p of perCert) {
    console.log(
      `  ${p.cert.padEnd(7)} fetched=${p.rows_fetched.toString().padStart(6)} ` +
        `email=${p.with_email.toString().padStart(6)} ` +
        `opt_out=${p.opt_out.toString().padStart(4)} ` +
        `new_unique=${p.new_unique_firms.toString().padStart(6)} ` +
        `dup_merged=${p.merged_into_existing.toString().padStart(6)}`
    );
  }

  console.log("\ncert_types breakdown (unique firms):");
  for (const [c, n] of Object.entries(certBreakdown).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${c.padEnd(10)} ${n}`);
  }
  console.log("\nprimary_cert breakdown (unique firms):");
  for (const [c, n] of Object.entries(primaryBreakdown).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${c.padEnd(10)} ${n}`);
  }

  // Sample rows for review.
  console.log("\nsample (5 firms):");
  const sample = leads.slice(0, 5).map((l) => ({
    company: l.company,
    contact: [l.first_name, l.last_name].filter(Boolean).join(" ") || null,
    email: l.email,
    city_state: [l.city, l.state].filter(Boolean).join(", "),
    cert_types: l.cert_types,
    primary_cert: l.primary_cert,
    uei: l.uei,
  }));
  console.log(JSON.stringify(sample, null, 2));

  // Writes.
  if (DRY_RUN) {
    console.log(`\n[dry-run] would upsert ${leads.length} rows to leads (source='dsbs')`);
  } else {
    console.log(`\n[write] upserting ${leads.length} rows to leads...`);
    const wT0 = Date.now();
    const { inserted, errors } = await upsertBatch(supabase, leads);
    const wMs = Date.now() - wT0;
    console.log(`[write] inserted/updated=${inserted} errors=${errors} in ${wMs}ms`);

    // Per-cert scraper_runs (proportional matches_created attribution by
    // new_unique_firms — rough but captures cert-level signal).
    const totalNewUnique = perCert.reduce((s, p) => s + p.new_unique_firms, 0) || 1;
    for (const p of perCert) {
      const attributedMatches = Math.round((inserted * p.new_unique_firms) / totalNewUnique);
      await logScraperRun(supabase, {
        source: `dsbs_${CERT_CODES[p.cert].slug}`,
        status: "success",
        opportunities_found: p.rows_fetched,
        matches_created: attributedMatches,
        started_at: p.started_at,
        completed_at: new Date().toISOString(),
      });
    }

    // Summary row.
    await logScraperRun(supabase, {
      source: "dsbs",
      status: errors > 0 ? "partial" : "success",
      opportunities_found: totalFetched,
      matches_created: inserted,
      error_message: errors > 0 ? `${errors} upsert errors` : null,
      started_at: overallStart,
      completed_at: new Date().toISOString(),
    });
  }

  console.log(`\ntotal wall-clock: ${((Date.now() - overallT0) / 1000).toFixed(1)}s`);
  console.log(`mode was: ${DRY_RUN ? "DRY-RUN (no DB writes)" : "WRITE"}`);
}

main().catch((e) => {
  console.error("FATAL:", e.message || e);
  process.exit(1);
});
