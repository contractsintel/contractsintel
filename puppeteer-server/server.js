const express = require("express");
const { chromium } = require("patchright");
const crypto = require("crypto");

const app = express();
app.use(express.json({ limit: "10mb" }));

const PORT = parseInt(process.env.PORT) || 3001;
const AUTH_TOKEN = process.env.RENDER_AUTH_TOKEN || "ci-puppeteer-2026";
const SUPABASE_URL = process.env.SUPABASE_URL || "https://qpyskwvhgclrlychhxjk.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const CAPSOLVER_KEY = process.env.CAPSOLVER_API_KEY || "";

// ============================================================
// BROWSER FINGERPRINT RANDOMIZATION
// ============================================================

const FINGERPRINTS = [
  { viewport: { width: 1920, height: 1080 }, locale: "en-US", timezoneId: "America/New_York" },
  { viewport: { width: 1366, height: 768 }, locale: "en-US", timezoneId: "America/Chicago" },
  { viewport: { width: 1440, height: 900 }, locale: "en-US", timezoneId: "America/Los_Angeles" },
  { viewport: { width: 1536, height: 864 }, locale: "en-US", timezoneId: "America/Denver" },
  { viewport: { width: 1280, height: 720 }, locale: "en-US", timezoneId: "America/Phoenix" },
];

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
];

function randomFingerprint() {
  const fp = FINGERPRINTS[Math.floor(Math.random() * FINGERPRINTS.length)];
  const ua = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
  return { ...fp, userAgent: ua };
}

// ============================================================
// PATCHRIGHT BROWSER MANAGEMENT
// ============================================================

let browser = null;

async function getBrowser() {
  if (!browser || !browser.isConnected()) {
    browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });
  }
  return browser;
}

async function getPage() {
  const b = await getBrowser();
  const fp = randomFingerprint();
  const context = await b.newContext({
    userAgent: fp.userAgent,
    viewport: fp.viewport,
    locale: fp.locale,
    timezoneId: fp.timezoneId,
  });
  const page = await context.newPage();
  return { page, context };
}

// ============================================================
// CAPSOLVER CAPTCHA SOLVING
// ============================================================

async function solveCapsolverTask(taskPayload) {
  if (!CAPSOLVER_KEY) return null;
  try {
    const createRes = await fetch("https://api.capsolver.com/createTask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientKey: CAPSOLVER_KEY, task: taskPayload }),
    });
    const createData = await createRes.json();
    if (createData.errorId !== 0) {
      console.log(`[capsolver] Create error: ${createData.errorDescription}`);
      return null;
    }
    const taskId = createData.taskId;

    // Poll for result (max 120 seconds)
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const resultRes = await fetch("https://api.capsolver.com/getTaskResult", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientKey: CAPSOLVER_KEY, taskId }),
      });
      const resultData = await resultRes.json();
      if (resultData.status === "ready") return resultData.solution;
      if (resultData.status === "failed") {
        console.log(`[capsolver] Task failed: ${resultData.errorDescription}`);
        return null;
      }
    }
    console.log("[capsolver] Task timed out after 120s");
    return null;
  } catch (e) {
    console.log(`[capsolver] Error: ${e.message}`);
    return null;
  }
}

async function solveCaptchaIfPresent(page) {
  const url = page.url();

  // Check for reCAPTCHA v2
  const recaptchaFrame = await page.$('iframe[src*="recaptcha"]');
  if (recaptchaFrame) {
    const sitekey = await page.evaluate(() => {
      const el = document.querySelector(".g-recaptcha, [data-sitekey]");
      return el ? el.getAttribute("data-sitekey") : null;
    });
    if (sitekey) {
      console.log(`[capsolver] Solving reCAPTCHA v2 on ${url}...`);
      const solution = await solveCapsolverTask({
        type: "ReCaptchaV2TaskProxyLess",
        websiteURL: url,
        websiteKey: sitekey,
      });
      if (solution && solution.gRecaptchaResponse) {
        await page.evaluate((token) => {
          const el = document.querySelector("#g-recaptcha-response");
          if (el) el.value = token;
          if (typeof ___grecaptcha_cfg !== "undefined") {
            Object.keys(___grecaptcha_cfg.clients).forEach((k) => {
              const client = ___grecaptcha_cfg.clients[k];
              if (client && client.o && client.o.callback) client.o.callback(token);
            });
          }
        }, solution.gRecaptchaResponse);
        console.log("[capsolver] reCAPTCHA solved");
        await new Promise((r) => setTimeout(r, 2000));
        return true;
      }
    }
  }

  // Check for Cloudflare Turnstile
  const turnstile = await page.$('iframe[src*="challenges.cloudflare.com"]');
  if (turnstile) {
    const sitekey = await page.evaluate(() => {
      const el = document.querySelector("[data-sitekey]");
      return el ? el.getAttribute("data-sitekey") : null;
    });
    if (sitekey) {
      console.log(`[capsolver] Solving Cloudflare Turnstile on ${url}...`);
      const solution = await solveCapsolverTask({
        type: "AntiTurnstileTaskProxyLess",
        websiteURL: url,
        websiteKey: sitekey,
      });
      if (solution && solution.token) {
        await page.evaluate((token) => {
          const input = document.querySelector('[name="cf-turnstile-response"]');
          if (input) input.value = token;
          const cb = window.turnstile?.getResponse ? null : window.__turnstileCallback;
          if (cb) cb(token);
        }, solution.token);
        console.log("[capsolver] Turnstile solved");
        await new Promise((r) => setTimeout(r, 2000));
        return true;
      }
    }
  }

  // Check for hCaptcha
  const hcaptcha = await page.$('iframe[src*="hcaptcha.com"]');
  if (hcaptcha) {
    const sitekey = await page.evaluate(() => {
      const el = document.querySelector(".h-captcha, [data-sitekey]");
      return el ? el.getAttribute("data-sitekey") : null;
    });
    if (sitekey) {
      console.log(`[capsolver] Solving hCaptcha on ${url}...`);
      const solution = await solveCapsolverTask({
        type: "HCaptchaTaskProxyLess",
        websiteURL: url,
        websiteKey: sitekey,
      });
      if (solution && solution.gRecaptchaResponse) {
        await page.evaluate((token) => {
          const el = document.querySelector('[name="h-captcha-response"]');
          if (el) el.value = token;
        }, solution.gRecaptchaResponse);
        console.log("[capsolver] hCaptcha solved");
        await new Promise((r) => setTimeout(r, 2000));
        return true;
      }
    }
  }

  // Check for Cloudflare challenge page (JS challenge, not CAPTCHA)
  const cfChallenge = await page.evaluate(() => {
    return document.title.includes("Just a moment") || document.title.includes("Attention Required");
  });
  if (cfChallenge) {
    console.log(`[capsolver] Cloudflare JS challenge detected on ${url}, waiting...`);
    // Patchright should handle this automatically; wait for it to resolve
    try {
      await page.waitForFunction(
        () => !document.title.includes("Just a moment") && !document.title.includes("Attention Required"),
        { timeout: 30000 }
      );
      console.log("[capsolver] Cloudflare challenge passed");
      return true;
    } catch {
      console.log("[capsolver] Cloudflare challenge timeout");
    }
  }

  return false;
}

// ============================================================
// AUTH + HELPERS
// ============================================================

function authCheck(req, res) {
  const auth = req.headers.authorization;
  if (auth !== `Bearer ${AUTH_TOKEN}`) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  return true;
}

function extractLinks(html, baseUrl) {
  const links = [];
  const re = /<a[^>]+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const text = m[2].replace(/<[^>]+>/g, "").trim();
    if (text && text.length > 5 && text.length < 300) {
      let href = m[1];
      if (!href.startsWith("http")) {
        try { href = new URL(href, baseUrl).toString(); } catch { continue; }
      }
      links.push({ text, href });
    }
  }
  return links;
}

function extractTableRows(html) {
  const rows = [];
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let trM;
  while ((trM = trRe.exec(html)) !== null) {
    const cells = [];
    const tdRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let tdM;
    while ((tdM = tdRe.exec(trM[1])) !== null) {
      const text = tdM[1].replace(/<[^>]+>/g, "").trim();
      if (text) cells.push(text);
    }
    if (cells.length >= 2) rows.push(cells.join(" | "));
  }
  return rows;
}

function makeNoticeId(prefix, ...parts) {
  const raw = parts.filter(Boolean).join("-");
  const h = crypto.createHash("md5").update(raw).digest("hex").substring(0, 12);
  return `${prefix}-${h}`;
}

async function upsertToSupabase(records) {
  if (!SUPABASE_KEY || !records.length) return 0;

  let total = 0;
  for (let i = 0; i < records.length; i += 100) {
    const batch = records.slice(i, i + 100);
    try {
      const resp = await fetch(`${SUPABASE_URL}/rest/v1/opportunities?on_conflict=notice_id`, {
        method: "POST",
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates",
        },
        body: JSON.stringify(batch),
      });
      if (resp.ok) total += batch.length;
      else {
        for (const rec of batch) {
          try {
            const r2 = await fetch(`${SUPABASE_URL}/rest/v1/opportunities?on_conflict=notice_id`, {
              method: "POST",
              headers: {
                apikey: SUPABASE_KEY,
                Authorization: `Bearer ${SUPABASE_KEY}`,
                "Content-Type": "application/json",
                Prefer: "resolution=merge-duplicates",
              },
              body: JSON.stringify([rec]),
            });
            if (r2.ok) total++;
          } catch {}
        }
      }
    } catch (e) {
      console.log(`Supabase upsert error: ${e.message}`);
    }
  }
  return total;
}

// ============================================================
// HEALTH CHECK
// ============================================================

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    engine: "patchright",
    captcha: CAPSOLVER_KEY ? "capsolver-enabled" : "no-key",
    uptime: process.uptime(),
  });
});

// ============================================================
// RENDER ENDPOINTS
// ============================================================

app.get("/render", async (req, res) => {
  if (!authCheck(req, res)) return;

  const url = req.query.url;
  const wait = parseInt(req.query.wait) || 5000;

  if (!url) return res.status(400).json({ error: "url parameter required" });

  let context = null;
  try {
    const result = await getPage();
    context = result.context;
    const page = result.page;

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await solveCaptchaIfPresent(page);
    await new Promise((r) => setTimeout(r, wait));

    const html = await page.content();
    res.json({ success: true, url, html, length: html.length });
  } catch (err) {
    res.status(500).json({ success: false, url, error: err.message });
  } finally {
    if (context) await context.close().catch(() => {});
  }
});

app.post("/render-batch", async (req, res) => {
  if (!authCheck(req, res)) return;

  const { urls, wait = 5000 } = req.body;
  if (!urls || !Array.isArray(urls)) {
    return res.status(400).json({ error: "urls array required" });
  }

  const results = [];
  for (const url of urls.slice(0, 20)) {
    let context = null;
    try {
      const result = await getPage();
      context = result.context;
      const page = result.page;

      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
      await solveCaptchaIfPresent(page);
      await new Promise((r) => setTimeout(r, wait));
      const html = await page.content();
      results.push({ url, success: true, html, length: html.length });
    } catch (err) {
      results.push({ url, success: false, error: err.message });
    } finally {
      if (context) await context.close().catch(() => {});
    }
  }

  res.json({ results, count: results.length });
});

// ============================================================
// CRON SCRAPING ENDPOINTS
// ============================================================

// Cron: USASpending
app.post("/cron/usaspending", async (req, res) => {
  if (!authCheck(req, res)) return;
  console.log("[cron] USASpending starting...");

  const now = new Date();
  const start = new Date(now - 90 * 86400000).toISOString().split("T")[0];
  const end = now.toISOString().split("T")[0];
  let page = 1, totalSaved = 0, hasNext = true;

  while (hasNext && page <= 500) {
    try {
      const apiRes = await fetch("https://api.usaspending.gov/api/v2/search/spending_by_award/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filters: { time_period: [{ start_date: start, end_date: end }], award_type_codes: ["A","B","C","D"] },
          fields: ["Award ID","Recipient Name","Award Amount","Period of Performance Current End Date","Awarding Agency","Awarding Sub Agency","NAICS Code","generated_internal_id","Description"],
          limit: 100, page, sort: "Award Amount", order: "desc", subawards: false,
        }),
        signal: AbortSignal.timeout(30000),
      });
      const data = await apiRes.json();
      const awards = data.results || [];
      if (!awards.length) break;

      const records = awards.filter(a => a["Award ID"]).map(a => ({
        notice_id: `usaspending-${a["Award ID"]}`,
        title: `Recompete: ${(a.Description || a["Awarding Agency"] || "Contract").substring(0,100)} (${a["Recipient Name"] || "Unknown"})`,
        agency: [a["Awarding Agency"], a["Awarding Sub Agency"]].filter(Boolean).join(" / ") || "Unknown",
        solicitation_number: a["Award ID"],
        naics_code: a["NAICS Code"] || null,
        value_estimate: a["Award Amount"] ? Math.round(a["Award Amount"]) : null,
        response_deadline: a["Period of Performance Current End Date"] || null,
        source: "usaspending",
        source_url: `https://www.usaspending.gov/award/${a.generated_internal_id || a["Award ID"]}`,
        incumbent_name: a["Recipient Name"] || null,
        last_seen_at: new Date().toISOString(),
      }));

      const saved = await upsertToSupabase(records);
      totalSaved += saved;
      hasNext = data.hasNext === true || awards.length === 100;
      console.log(`[cron] USASpending page ${page}: ${saved} saved (total: ${totalSaved})`);
      page++;
      await new Promise(r => setTimeout(r, 1500));
    } catch (e) {
      console.log(`[cron] USASpending page ${page} error: ${e.message}`);
      break;
    }
  }

  console.log(`[cron] USASpending done: ${totalSaved} saved across ${page-1} pages`);
  res.json({ source: "usaspending", saved: totalSaved, pages: page - 1 });
});

// Cron: Grants.gov
app.post("/cron/grants", async (req, res) => {
  if (!authCheck(req, res)) return;
  console.log("[cron] Grants.gov starting...");

  let offset = 0, totalSaved = 0, hitCount = 0;

  while (true) {
    try {
      const apiRes = await fetch("https://apply07.grants.gov/grantsws/rest/opportunities/search", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ keyword: "", oppStatuses: "posted", sortBy: "openDate|desc", rows: 500, offset }),
        signal: AbortSignal.timeout(30000),
      });
      const data = await apiRes.json();
      const opps = data.oppHits || [];
      hitCount = data.hitCount || 0;
      if (!opps.length) break;

      const records = opps.filter(o => o.id || o.opportunityId).map(o => {
        const id = o.id || o.opportunityId;
        const parseDate = (d) => { if (!d) return null; const p = d.split("/"); return p.length === 3 ? `${p[2]}-${p[0].padStart(2,"0")}-${p[1].padStart(2,"0")}` : d; };
        return {
          notice_id: `grants-gov-${id}`,
          title: o.title || o.opportunityTitle || "Untitled Grant",
          agency: o.agency || o.agencyCode || "Unknown",
          solicitation_number: o.number || o.opportunityNumber || String(id),
          value_estimate: o.estimatedTotalFunding ? Math.round(o.estimatedTotalFunding) : (o.awardCeiling ? Math.round(o.awardCeiling) : null),
          response_deadline: parseDate(o.closeDate || o.closeDateStr),
          posted_date: parseDate(o.openDate || o.openDateStr),
          description: (o.description || "").substring(0, 10000) || null,
          source: "grants_gov",
          source_url: `https://www.grants.gov/search-results-detail/${id}`,
          last_seen_at: new Date().toISOString(),
        };
      });

      const saved = await upsertToSupabase(records);
      totalSaved += saved;
      offset += 500;
      console.log(`[cron] Grants.gov offset ${offset-500}: ${saved} saved (total: ${totalSaved}/${hitCount})`);
      if (opps.length < 500 || offset >= hitCount) break;
      await new Promise(r => setTimeout(r, 1500));
    } catch (e) {
      console.log(`[cron] Grants.gov offset ${offset} error: ${e.message}`);
      break;
    }
  }

  console.log(`[cron] Grants.gov done: ${totalSaved} saved`);
  res.json({ source: "grants_gov", saved: totalSaved, hitCount });
});

// Cron: Scrape HTML sources via Patchright + Capsolver
app.post("/cron/scrape-html", async (req, res) => {
  if (!authCheck(req, res)) return;

  const { sources } = req.body;
  if (!sources || !Array.isArray(sources)) {
    return res.status(400).json({ error: "sources array required" });
  }

  const results = [];
  const bidKw = /bid|rfp|rfq|solicit|procurement|contract|award|opportunity/i;

  for (const src of sources) {
    const { id, name, url, source_type } = src;
    let context = null;
    try {
      const result = await getPage();
      context = result.context;
      const page = result.page;

      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
      await solveCaptchaIfPresent(page);
      await new Promise((r) => setTimeout(r, 5000));
      const html = await page.content();

      const records = [];
      const links = extractLinks(html, url);
      for (const link of links) {
        if (bidKw.test(link.text) || bidKw.test(link.href)) {
          records.push({
            notice_id: makeNoticeId(id, link.text, link.href),
            title: `[${name}] ${link.text.substring(0, 200)}`,
            agency: name,
            source: source_type || "state_local",
            source_url: link.href,
            description: link.text,
            last_seen_at: new Date().toISOString(),
          });
        }
      }

      for (const row of extractTableRows(html)) {
        records.push({
          notice_id: makeNoticeId(id, row),
          title: `[${name}] ${row.substring(0, 200)}`,
          agency: name,
          source: source_type || "state_local",
          source_url: url,
          description: row.substring(0, 2000),
          last_seen_at: new Date().toISOString(),
        });
      }

      const seen = new Set();
      const unique = records.filter((r) => { if (seen.has(r.notice_id)) return false; seen.add(r.notice_id); return true; });
      const saved = await upsertToSupabase(unique);
      results.push({ id, name, saved, status: "ok", htmlLen: html.length });
      console.log(`[cron] ${name}: ${saved} items (${html.length} bytes)`);
    } catch (e) {
      results.push({ id, name, saved: 0, status: "error", error: e.message });
      console.log(`[cron] ${name}: error - ${e.message}`);
    } finally {
      if (context) await context.close().catch(() => {});
    }
    await new Promise((r) => setTimeout(r, 3000));
  }

  res.json({ results, total: results.reduce((s, r) => s + r.saved, 0) });
});

// Cron: Run all scrapers (master endpoint)
app.post("/cron/scrape-all", async (req, res) => {
  if (!authCheck(req, res)) return;
  console.log("[cron] Full scrape-all starting...");

  const summary = {};

  try {
    const r = await fetch(`http://localhost:${PORT}/cron/usaspending`, {
      method: "POST", headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
    });
    summary.usaspending = await r.json();
  } catch (e) { summary.usaspending = { error: e.message }; }

  try {
    const r = await fetch(`http://localhost:${PORT}/cron/grants`, {
      method: "POST", headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
    });
    summary.grants_gov = await r.json();
  } catch (e) { summary.grants_gov = { error: e.message }; }

  console.log("[cron] Full scrape-all complete");
  res.json(summary);
});

// ============================================================
// ALL SOURCES FOR CRON
// ============================================================

const ALL_STATE_SOURCES = [
  { id: "state-CA", name: "California", url: "https://caleprocure.ca.gov/pages/Events-BS3/event-search.aspx", source_type: "state_ca" },
  { id: "state-TX", name: "Texas", url: "https://www.txsmartbuy.com/sp", source_type: "state_tx" },
  { id: "state-FL", name: "Florida", url: "https://vendor.myfloridamarketplace.com/search/bids", source_type: "state_fl" },
  { id: "state-CO", name: "Colorado", url: "https://bids.coloradovssc.com/", source_type: "state_co" },
  { id: "state-MD", name: "Maryland", url: "https://emaryland.buyspeed.com/bso/view/search/external/advancedSearchBid.xhtml", source_type: "state_md" },
  { id: "state-MI", name: "Michigan", url: "https://sigma.michigan.gov/webapp/PRDVSS2X1/AltSelfService", source_type: "state_mi" },
  { id: "state-KY", name: "Kentucky", url: "https://emars.ky.gov/online/vss/AltSelfService", source_type: "state_ky" },
  { id: "state-KS", name: "Kansas", url: "https://supplier.sok.ks.gov/psc/sokfssprd/SUPPLIER/ERP/h/?tab=SOK_EBID", source_type: "state_ks" },
  { id: "state-MO", name: "Missouri", url: "https://www.moolb.mo.gov/MOSCEnterprise/solicitationSearch.html", source_type: "state_mo" },
  { id: "state-AK", name: "Alaska", url: "https://iris-vss.state.ak.us/webapp/PRDVSS1X1/AltSelfService", source_type: "state_ak" },
  { id: "state-AZ", name: "Arizona", url: "https://spo.az.gov/contracts-and-solicitations", source_type: "state_az" },
  { id: "state-NH", name: "New Hampshire", url: "https://apps.das.nh.gov/bidscontracts/", source_type: "state_nh" },
  { id: "state-DC", name: "DC", url: "https://ocp.dc.gov/page/solicitations", source_type: "state_dc" },
  { id: "state-TN", name: "Tennessee", url: "https://tn.gov/generalservices/procurement/central-procurement-office--cpo-/solicitations.html", source_type: "state_tn" },
  { id: "state-AR", name: "Arkansas", url: "https://www.arkansas.gov/dfa/procurement/", source_type: "state_ar" },
  { id: "state-NC", name: "North Carolina", url: "https://www.ips.state.nc.us/", source_type: "state_nc" },
  { id: "state-LA", name: "Louisiana", url: "https://wwwprd.doa.louisiana.gov/osp/lapac/pubmain.asp", source_type: "state_la" },
  { id: "state-MT", name: "Montana", url: "https://svc.mt.gov/gsd/OneStop/", source_type: "state_mt" },
  { id: "state-PR", name: "Puerto Rico", url: "https://www.asg.pr.gov/", source_type: "state_pr" },
  { id: "state-SD", name: "South Dakota", url: "https://bop.sd.gov/", source_type: "state_sd" },
  { id: "state-WV", name: "West Virginia", url: "https://state.wv.gov/admin/purchase/", source_type: "state_wv" },
  { id: "state-HI", name: "Hawaii", url: "https://hands.hawaii.gov/", source_type: "state_hi" },
  { id: "state-AL", name: "Alabama", url: "https://purchasing.alabama.gov/", source_type: "state_al" },
  { id: "state-NY", name: "New York", url: "https://ogs.ny.gov/procurement", source_type: "state_ny" },
  { id: "state-PA", name: "Pennsylvania", url: "https://www.emarketplace.state.pa.us/", source_type: "state_pa" },
  { id: "state-OH", name: "Ohio", url: "https://procure.ohio.gov/proc/index.asp", source_type: "state_oh" },
  { id: "state-WI", name: "Wisconsin", url: "https://vendornet.state.wi.us/", source_type: "state_wi" },
  { id: "state-WA", name: "Washington", url: "https://des.wa.gov/services/contracting-purchasing", source_type: "state_wa" },
  { id: "state-OR", name: "Oregon", url: "https://orpin.oregon.gov/open.dll/welcome", source_type: "state_or" },
  { id: "state-IN", name: "Indiana", url: "https://www.in.gov/idoa/procurement/", source_type: "state_in" },
  { id: "state-SC", name: "South Carolina", url: "https://procurement.sc.gov/", source_type: "state_sc" },
  { id: "state-VA", name: "Virginia", url: "https://eva.virginia.gov/", source_type: "state_va" },
  { id: "state-NJ", name: "New Jersey", url: "https://www.njstart.gov/", source_type: "state_nj" },
  { id: "state-CT", name: "Connecticut", url: "https://portal.ct.gov/DAS/Procurement/", source_type: "state_ct" },
  { id: "state-GA", name: "Georgia", url: "https://ssl.doas.state.ga.us/gpr/", source_type: "state_ga" },
  { id: "state-IL", name: "Illinois", url: "https://www.bidbuy.illinois.gov/", source_type: "state_il" },
  { id: "state-MA", name: "Massachusetts", url: "https://www.commbuys.com/", source_type: "state_ma" },
  { id: "state-NV", name: "Nevada", url: "https://nevadaepro.com/bso/view/search/external/advancedSearchBid.xhtml", source_type: "state_nv" },
  { id: "state-NE", name: "Nebraska", url: "https://das.nebraska.gov/materiel/purchasing.html", source_type: "state_ne" },
  { id: "state-ME", name: "Maine", url: "https://www.maine.gov/purchases/", source_type: "state_me" },
  { id: "state-DE", name: "Delaware", url: "https://contracts.delaware.gov/", source_type: "state_de" },
  { id: "state-IA", name: "Iowa", url: "https://bidopportunities.iowa.gov/", source_type: "state_ia" },
  { id: "state-MS", name: "Mississippi", url: "https://www.ms.gov/dfa/contract_bid_search/", source_type: "state_ms" },
  { id: "state-ID", name: "Idaho", url: "https://purchasing.idaho.gov/", source_type: "state_id" },
  { id: "state-ND", name: "North Dakota", url: "https://www.nd.gov/omb/agency/procurement/", source_type: "state_nd" },
  { id: "state-NM", name: "New Mexico", url: "https://www.generalservices.state.nm.us/", source_type: "state_nm" },
  { id: "state-RI", name: "Rhode Island", url: "https://www.purchasing.ri.gov/", source_type: "state_ri" },
  { id: "state-VT", name: "Vermont", url: "https://bgs.vermont.gov/purchasing", source_type: "state_vt" },
  { id: "state-OK", name: "Oklahoma", url: "https://oklahoma.gov/omes/services/purchasing.html", source_type: "state_ok" },
  { id: "state-UT", name: "Utah", url: "https://purchasing.utah.gov/", source_type: "state_ut" },
  { id: "state-MN", name: "Minnesota", url: "https://mn.gov/admin/osp/", source_type: "state_mn" },
  { id: "state-WY", name: "Wyoming", url: "https://ai.wyo.gov/divisions/procurement", source_type: "state_wy" },
  { id: "state-VI", name: "Virgin Islands", url: "https://dpp.vi.gov/", source_type: "state_vi" },
  { id: "state-GU", name: "Guam", url: "https://www.guamgsa.com/", source_type: "state_gu" },
];

const ALL_FEDERAL_SOURCES = [
  { id: "faa_contracting", name: "FAA Contracting", url: "https://faaco.faa.gov/index.cfm/announcement/list", source_type: "federal_civilian" },
  { id: "fema_procurement", name: "FEMA Procurement", url: "https://www.fema.gov/about/doing-business-with-fema", source_type: "federal_civilian" },
  { id: "commerce_oam", name: "Commerce OAM", url: "https://www.commerce.gov/oam", source_type: "federal_civilian" },
  { id: "usda_procurement", name: "USDA Procurement", url: "https://www.dm.usda.gov/procurement/", source_type: "federal_civilian" },
  { id: "sba_subnet", name: "SBA SubNet", url: "https://eweb1.sba.gov/subnet/client/dsp_Landing.cfm", source_type: "federal_civilian" },
  { id: "ssa_contracts", name: "SSA Contracts", url: "https://www.ssa.gov/oag/contracts/", source_type: "federal_civilian" },
  { id: "dol_procurement", name: "Labor Procurement", url: "https://www.dol.gov/general/procurement", source_type: "federal_civilian" },
  { id: "nih_nitaac", name: "NIH NITAAC", url: "https://nitaac.nih.gov/buy/opportunities", source_type: "federal_civilian" },
  { id: "sbir_dod", name: "SBIR DoD", url: "https://www.dodsbirsttr.mil/submissions/", source_type: "federal_civilian" },
  { id: "gsa_ebuy", name: "GSA eBuy", url: "https://www.ebuy.gsa.gov/ebuy/", source_type: "federal_civilian" },
  { id: "dot_osdbu", name: "DOT OSDBU", url: "https://www.transportation.gov/osdbu", source_type: "federal_civilian" },
  { id: "hhs_contracts", name: "HHS Contracts", url: "https://www.hhs.gov/grants-contracts/index.html", source_type: "federal_civilian" },
  { id: "doj_procurement", name: "DOJ Procurement", url: "https://www.justice.gov/jmd/procurement", source_type: "federal_civilian" },
  { id: "hud_cpo", name: "HUD CPO", url: "https://www.hud.gov/program_offices/cpo", source_type: "federal_civilian" },
  { id: "ed_contracts", name: "Education Contracts", url: "https://www.ed.gov/fund/contract", source_type: "federal_civilian" },
  { id: "nasa_procurement", name: "NASA Procurement", url: "https://procurement.nasa.gov/", source_type: "federal_civilian" },
  { id: "epa_contracts", name: "EPA Contracts", url: "https://www.epa.gov/contracts", source_type: "federal_civilian" },
  { id: "doe_procurement", name: "DOE Procurement", url: "https://www.energy.gov/management/office-management/operational-management/procurement-and-acquisition", source_type: "federal_civilian" },
  { id: "va_procurement", name: "VA Procurement", url: "https://www.va.gov/opal/nac/", source_type: "federal_civilian" },
  { id: "dhs_procurement", name: "DHS Procurement", url: "https://www.dhs.gov/procurement-operations", source_type: "federal_civilian" },
  { id: "treasury_procurement", name: "Treasury Procurement", url: "https://home.treasury.gov/about/offices/management/procurement", source_type: "federal_civilian" },
  { id: "state_procurement", name: "State Dept Procurement", url: "https://www.state.gov/key-topics-bureau-of-administration/procurement/", source_type: "federal_civilian" },
  { id: "opm_procurement", name: "OPM Procurement", url: "https://www.opm.gov/about-us/doing-business-with-opm/", source_type: "federal_civilian" },
];

// ============================================================
// BUILT-IN CRON
// ============================================================

app.listen(PORT, () => {
  console.log(`Patchright scraper server running on port ${PORT}`);

  if (SUPABASE_KEY) {
    const CRON_INTERVAL = 30 * 60 * 1000;
    const lastRun = { usaspending: 0, grants: 0, states: 0, federal: 0 };
    const HOUR = 3600000;

    async function cronCycle() {
      const now = Date.now();
      console.log(`[cron] Cycle starting at ${new Date().toISOString()}`);

      try {
        // Every 1 hour: API sources
        if (now - lastRun.usaspending > 1 * HOUR) {
          console.log("[cron] Triggering USASpending...");
          const r = await fetch(`http://localhost:${PORT}/cron/usaspending`, {
            method: "POST", headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
            signal: AbortSignal.timeout(600000),
          });
          const data = await r.json();
          console.log(`[cron] USASpending result: ${JSON.stringify(data).substring(0, 200)}`);
          lastRun.usaspending = now;
        }

        if (now - lastRun.grants > 1 * HOUR) {
          console.log("[cron] Triggering Grants.gov...");
          const r = await fetch(`http://localhost:${PORT}/cron/grants`, {
            method: "POST", headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
            signal: AbortSignal.timeout(300000),
          });
          const data = await r.json();
          console.log(`[cron] Grants.gov result: ${JSON.stringify(data).substring(0, 200)}`);
          lastRun.grants = now;
        }

        // Every 2 hours: State portals via Patchright
        if (now - lastRun.states > 2 * HOUR) {
          console.log("[cron] Triggering state portals...");
          const r = await fetch(`http://localhost:${PORT}/cron/scrape-html`, {
            method: "POST",
            headers: { Authorization: `Bearer ${AUTH_TOKEN}`, "Content-Type": "application/json" },
            body: JSON.stringify({ sources: ALL_STATE_SOURCES }),
            signal: AbortSignal.timeout(1800000),
          });
          const data = await r.json();
          console.log(`[cron] States result: ${data.total} saved`);
          lastRun.states = now;
        }

        // Every 2 hours: Federal civilian agencies via Patchright
        if (now - lastRun.federal > 2 * HOUR) {
          console.log("[cron] Triggering federal civilian agencies...");
          const r = await fetch(`http://localhost:${PORT}/cron/scrape-html`, {
            method: "POST",
            headers: { Authorization: `Bearer ${AUTH_TOKEN}`, "Content-Type": "application/json" },
            body: JSON.stringify({ sources: ALL_FEDERAL_SOURCES }),
            signal: AbortSignal.timeout(1200000),
          });
          const data = await r.json();
          console.log(`[cron] Federal civilian result: ${data.total} saved`);
          lastRun.federal = now;
        }
      } catch (e) {
        console.log(`[cron] Cycle error: ${e.message}`);
      }

      console.log(`[cron] Cycle complete at ${new Date().toISOString()}`);
    }

    setTimeout(cronCycle, 60000);
    setInterval(cronCycle, CRON_INTERVAL);
    console.log("[cron] Auto-scraping enabled: every 30 minutes");
  } else {
    console.log("[cron] No SUPABASE_KEY — auto-scraping disabled");
  }
});
