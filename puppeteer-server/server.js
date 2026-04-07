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

// Cron: SAM.gov (internal API — no API key needed)
// Queries by notice_type + NAICS to bypass 10K pagination cap
app.post("/cron/sam", async (req, res) => {
  if (!authCheck(req, res)) return;
  console.log("[cron] SAM.gov starting (internal API, full 45K+ scrape)...");

  const SAM_SEARCH = "https://sam.gov/api/prod/sgs/v1/search/";
  const SAM_HEADERS = {
    Accept: "application/json, text/plain, */*",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    Referer: "https://sam.gov/search/",
    Origin: "https://sam.gov",
  };
  const PAGE_SIZE = 100;
  const MAX_PAGES = 99; // SAM.gov caps at page 99 (0-indexed = 10,000 results)

  // Build query batches: each must stay under 10K results
  // Types under 10K: query directly. Type k (15K): split by NAICS 2-digit (33→3-digit)
  const NAICS_2DIGIT = ["11","21","22","23","31","32","42","44","45","48","51","52","53","54","55","56","61","62","71","72","81"];
  const NAICS_33_3DIGIT = ["331","332","333","334","335","336","337","339"];

  const batches = [];
  // Small types — query directly (all under 10K)
  for (const code of ["p","o","r","s","a","u","g","i"]) {
    batches.push({ notice_type: code, naics: null, label: `type=${code}` });
  }
  // Type k — split by NAICS (each under 10K)
  for (const n of NAICS_2DIGIT) {
    if (n === "33") continue; // 33 is 12K+, split further
    batches.push({ notice_type: "k", naics: n, label: `type=k,naics=${n}` });
  }
  for (const n of NAICS_33_3DIGIT) {
    batches.push({ notice_type: "k", naics: n, label: `type=k,naics=${n}` });
  }
  // Type k with no NAICS match (~35 records) — catch with plain type=k at the end
  // (will get up to 10K which covers duplicates + the ~35 without NAICS)
  batches.push({ notice_type: "k", naics: null, label: "type=k,catchall" });

  // Helper: paginate one batch
  async function scrapeBatch(batch) {
    let page = 0, saved = 0, total = 0;
    while (page < MAX_PAGES) {
      try {
        const params = new URLSearchParams({
          index: "opp", q: "", page: String(page),
          sort: "-modifiedDate", size: String(PAGE_SIZE),
          mode: "search", is_active: "true",
          notice_type: batch.notice_type,
        });
        if (batch.naics) params.set("naics", batch.naics);

        const apiRes = await fetch(`${SAM_SEARCH}?${params}`, {
          headers: SAM_HEADERS,
          signal: AbortSignal.timeout(30000),
        });

        if (!apiRes.ok) {
          if (page > 0) console.log(`[sam] ${batch.label} page ${page} HTTP ${apiRes.status} — stopping`);
          break;
        }

        const data = await apiRes.json();
        total = (data.page || {}).totalElements || 0;
        const items = (data._embedded || {}).results || [];
        if (!items.length) break;

        const records = items.filter(r => r._id).map(r => {
          const orgs = r.organizationHierarchy || [];
          const dept = orgs.find(o => o.level === 1);
          const subtier = orgs.find(o => o.level === 2);
          const office = orgs.find(o => o.level === 3);
          const agency = [dept?.name, subtier?.name, office?.name]
            .filter(Boolean)
            .filter((v, i, a) => a.indexOf(v) === i)
            .join(" / ");
          const desc = (r.descriptions || []).map(d => d.content || "").join("\n").substring(0, 10000);
          return {
            notice_id: r._id,
            title: (r.title || "Untitled").substring(0, 500),
            agency: agency || "Unknown",
            solicitation_number: r.solicitationNumber || null,
            response_deadline: r.responseDate || null,
            posted_date: r.publishDate || null,
            description: desc || null,
            source: "sam_gov",
            source_url: `https://sam.gov/opp/${r._id}/view`,
            last_seen_at: new Date().toISOString(),
          };
        });

        saved += await upsertToSupabase(records);
        page++;
        if (items.length < PAGE_SIZE) break;
        await new Promise(r => setTimeout(r, 250));
      } catch (e) {
        console.log(`[sam] ${batch.label} page ${page} error: ${e.message}`);
        break;
      }
    }
    return { label: batch.label, saved, total, pages: page };
  }

  let grandTotal = 0;
  const batchResults = [];

  for (const batch of batches) {
    const result = await scrapeBatch(batch);
    batchResults.push(result);
    grandTotal += result.saved;
    if (result.saved > 0) {
      console.log(`[sam] ${result.label}: ${result.saved} saved (${result.total} in batch, ${result.pages} pages)`);
    }
  }

  console.log(`[cron] SAM.gov complete: ${grandTotal} total saved from ${batches.length} batches`);
  res.json({ source: "sam_gov", saved: grandTotal, batches: batchResults.filter(b => b.saved > 0) });
});

// Cron: Run bulk matching manually
app.post("/cron/match", async (req, res) => {
  if (!authCheck(req, res)) return;
  console.log("[cron] Manual bulk matching triggered...");
  try {
    // Quick debug: check org count
    const debugRes = await fetch(`${SUPABASE_URL}/rest/v1/organizations?select=id,name,naics_codes&limit=5`, { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } });
    const debugOrgs = await debugRes.json();
    const orgCount = Array.isArray(debugOrgs) ? debugOrgs.length : 0;
    const sampleOrg = orgCount > 0 ? { id: debugOrgs[0].id, name: debugOrgs[0].name, naics: debugOrgs[0].naics_codes } : null;

    // Also check opportunity count
    const oppDebugRes = await fetch(`${SUPABASE_URL}/rest/v1/opportunities?select=id&order=created_at.desc&limit=3`, { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, Prefer: "count=exact" } });
    const oppDebugCount = oppDebugRes.headers.get("content-range")?.split("/")[1] || "?";
    // Check existing match count
    const matchDebugRes = await fetch(`${SUPABASE_URL}/rest/v1/opportunity_matches?select=id&limit=1`, { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, Prefer: "count=exact" } });
    const matchDebugCount = matchDebugRes.headers.get("content-range")?.split("/")[1] || "?";

    const matched = await runBulkMatching();
    console.log(`[cron] Manual matching complete: ${matched} matches created`);
    res.json({ success: true, matches_created: matched, debug: { org_count: orgCount, sample_org: sampleOrg, has_supabase_key: !!SUPABASE_KEY, total_opportunities: oppDebugCount, total_existing_matches: matchDebugCount } });
  } catch (e) {
    console.log(`[cron] Manual matching error: ${e.message}`);
    res.status(500).json({ error: e.message });
  }
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

  try {
    const r = await fetch(`http://localhost:${PORT}/cron/sam`, {
      method: "POST", headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
    });
    summary.sam_gov = await r.json();
  } catch (e) { summary.sam_gov = { error: e.message }; }

  console.log("[cron] Full scrape-all complete");
  res.json(summary);
});

// ============================================================
// ALL SOURCES FOR CRON
// ============================================================

const ALL_STATE_SOURCES = [
  { id: "state-CA", name: "California", url: "https://caleprocure.ca.gov/pages/Events-BS3/event-search.aspx", source_type: "state_ca" },
  { id: "state-TX", name: "Texas", url: "https://www.txsmartbuy.gov/esbd", source_type: "state_tx" },
  { id: "state-FL", name: "Florida", url: "https://vendor.myfloridamarketplace.com/search/bids", source_type: "state_fl" },
  { id: "state-CO", name: "Colorado", url: "https://bids.coloradovssc.com/", source_type: "state_co" },
  { id: "state-MD", name: "Maryland", url: "https://emaryland.buyspeed.com/bso/view/search/external/advancedSearchBid.xhtml", source_type: "state_md" },
  { id: "state-MI", name: "Michigan", url: "https://sigma.michigan.gov/webapp/PRDVSS2X1/AltSelfService", source_type: "state_mi" },
  { id: "state-KY", name: "Kentucky", url: "https://vss.ky.gov", source_type: "state_ky" },
  { id: "state-KS", name: "Kansas", url: "https://supplier.sok.ks.gov/psc/sokfssprd/SUPPLIER/ERP/h/?tab=SOK_EBID", source_type: "state_ks" },
  { id: "state-MO", name: "Missouri", url: "https://www.moolb.mo.gov/MOSCEnterprise/solicitationSearch.html", source_type: "state_mo" },
  { id: "state-AK", name: "Alaska", url: "https://aws.state.ak.us/OnlinePublicNotices/", source_type: "state_ak" },
  { id: "state-AZ", name: "Arizona", url: "https://spo.az.gov/contracts-and-solicitations", source_type: "state_az" },
  { id: "state-NH", name: "New Hampshire", url: "https://apps.das.nh.gov/bidscontracts/", source_type: "state_nh" },
  { id: "state-DC", name: "DC", url: "https://ocp.dc.gov/page/solicitations", source_type: "state_dc" },
  { id: "state-TN", name: "Tennessee RFP", url: "https://www.tn.gov/generalservices/procurement/central-procurement-office--cpo-/supplier-information/request-for-proposals--rfp--opportunities1.html", source_type: "state_tn" },
  { id: "state-TN2", name: "Tennessee ITB", url: "https://www.tn.gov/generalservices/procurement/central-procurement-office--cpo-/supplier-information/invitations-to-bid--itb-.html", source_type: "state_tn" },
  { id: "state-AR", name: "Arkansas", url: "https://www.arkansas.gov/tss/procurement/bids/index.php", source_type: "state_ar" },
  { id: "state-NC", name: "North Carolina", url: "https://www.ips.state.nc.us/", source_type: "state_nc" },
  { id: "state-LA", name: "Louisiana", url: "https://wwwcfprd.doa.louisiana.gov/osp/lapac/srchopen.cfm?deptno=all&catno=all&dateStart=&dateEnd=&compareDate=O&keywords=&keywordsCheck=all", source_type: "state_la" },
  { id: "state-MT", name: "Montana", url: "https://bids.sciquest.com/apps/Router/PublicEvent?CustomerOrg=StateOfMontana", source_type: "state_mt" },
  { id: "state-PR", name: "Puerto Rico", url: "https://asg.pr.gov/subastas", source_type: "state_pr" },
  { id: "state-SD", name: "South Dakota", url: "https://bop.sd.gov/", source_type: "state_sd" },
  { id: "state-WV", name: "West Virginia", url: "https://state.wv.gov/admin/purchase/", source_type: "state_wv" },
  { id: "state-HI", name: "Hawaii", url: "https://hands.hawaii.gov/", source_type: "state_hi" },
  { id: "state-AL", name: "Alabama", url: "https://purchasing.alabama.gov/", source_type: "state_al" },
  { id: "state-NY", name: "New York", url: "https://ogs.ny.gov/procurement/bid-opportunities", source_type: "state_ny" },
  { id: "state-PA", name: "Pennsylvania", url: "https://www.emarketplace.state.pa.us/", source_type: "state_pa" },
  { id: "state-OH", name: "Ohio", url: "https://procure.ohio.gov/proc/index.asp", source_type: "state_oh" },
  { id: "state-WI", name: "Wisconsin", url: "https://vendornet.state.wi.us/", source_type: "state_wi" },
  { id: "state-WA", name: "Washington", url: "https://pr-webs-vendor.des.wa.gov/BidCalendar.aspx", source_type: "state_wa" },
  { id: "state-OR", name: "Oregon", url: "https://oregonbuys.gov/bso/", source_type: "state_or" },
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
  { id: "state-MN", name: "Minnesota GS", url: "https://osp.admin.mn.gov/GS-auto", source_type: "state_mn" },
  { id: "state-MN2", name: "Minnesota PT", url: "https://osp.admin.mn.gov/PT-auto", source_type: "state_mn" },
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
// STATE BATCHES (5 batches of ~11 states each)
// ============================================================

const STATE_BATCH_1 = ALL_STATE_SOURCES.filter(s => ["state_al","state_ak","state_az","state_ar","state_ca","state_co","state_ct","state_de","state_dc","state_fl"].includes(s.source_type));
const STATE_BATCH_2 = ALL_STATE_SOURCES.filter(s => ["state_ga","state_hi","state_id","state_il","state_in","state_ia","state_ks","state_ky","state_la","state_me","state_md","state_ma"].includes(s.source_type));
const STATE_BATCH_3 = ALL_STATE_SOURCES.filter(s => ["state_mi","state_mn","state_ms","state_mo","state_mt","state_ne","state_nv","state_nh","state_nj"].includes(s.source_type));
const STATE_BATCH_4 = ALL_STATE_SOURCES.filter(s => ["state_nm","state_ny","state_nc","state_nd","state_oh","state_ok","state_or","state_pa","state_ri","state_sc"].includes(s.source_type));
const STATE_BATCH_5 = ALL_STATE_SOURCES.filter(s => ["state_sd","state_tn","state_tx","state_ut","state_vt","state_va","state_wa","state_wv","state_wi","state_wy","state_vi","state_gu","state_pr"].includes(s.source_type));

// ============================================================
// ROTATION TRACKER & STATUS
// ============================================================

const cronStats = {
  rotationIndex: 0,
  running: false,
  lastRotationName: "none",
  lastRunAt: null,
  recordsAddedLastHour: 0,
  recordsAddedToday: 0,
  hourlyRecords: [],
  dailyRecords: 0,
  startedAt: new Date().toISOString(),
  rotationResults: {},
};

function trackRecords(count) {
  const now = Date.now();
  cronStats.hourlyRecords.push({ time: now, count });
  // Prune entries older than 1 hour
  cronStats.hourlyRecords = cronStats.hourlyRecords.filter(r => now - r.time < 3600000);
  cronStats.recordsAddedLastHour = cronStats.hourlyRecords.reduce((s, r) => s + r.count, 0);
  cronStats.recordsAddedToday += count;
}

// ============================================================
// STATUS ENDPOINT
// ============================================================

app.get("/status", async (req, res) => {
  const upSec = process.uptime();
  const hours = Math.floor(upSec / 3600);
  const mins = Math.floor((upSec % 3600) / 60);

  // Get total from Supabase
  let totalOpportunities = "?";
  if (SUPABASE_KEY) {
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/opportunities?select=id&limit=1`, {
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, Prefer: "count=exact" },
      });
      const cr = r.headers.get("content-range") || "";
      if (cr.includes("/")) totalOpportunities = parseInt(cr.split("/")[1]);
    } catch {}
  }

  const ROTATION_INTERVAL = 5 * 60 * 1000;
  const nextRunIn = cronStats.lastRunAt
    ? Math.max(0, ROTATION_INTERVAL - (Date.now() - new Date(cronStats.lastRunAt).getTime()))
    : 0;
  const nextMins = Math.floor(nextRunIn / 60000);
  const nextSecs = Math.floor((nextRunIn % 60000) / 1000);

  res.json({
    status: "ok",
    engine: "patchright",
    captcha: CAPSOLVER_KEY ? "capsolver-enabled" : "no-key",
    uptime: `${hours}h ${mins}m`,
    cron_running: cronStats.running || true,
    rotation_index: cronStats.rotationIndex,
    last_rotation: cronStats.lastRotationName,
    last_run_at: cronStats.lastRunAt,
    records_added_last_hour: cronStats.recordsAddedLastHour,
    records_added_today: cronStats.recordsAddedToday,
    total_opportunities: totalOpportunities,
    next_run_in: `${nextMins}m ${nextSecs}s`,
    sam_gov_status: "working (internal API)",
    sources_configured: ALL_STATE_SOURCES.length + ALL_FEDERAL_SOURCES.length + 3,
    recent_results: cronStats.rotationResults,
  });
});

// ============================================================
// 5-MINUTE ROTATION CRON
// ============================================================

const ROTATION_NAMES = [
  "SAM.gov",
  "USASpending",
  "Grants.gov",
  "States Batch 1 (AL-FL)",
  "States Batch 2 (GA-MA)",
  "States Batch 3 (MI-NJ)",
  "States Batch 4 (NM-SC)",
  "States Batch 5 (SD-WY+territories)",
  "Federal Civilian",
  "SBIR/STTR + Military",
  "Forecasts + Subcontracting",
  "SAM.gov (2nd check)",
];

async function runRotation(index) {
  const slot = index % ROTATION_NAMES.length;
  const name = ROTATION_NAMES[slot];
  cronStats.lastRotationName = name;
  cronStats.lastRunAt = new Date().toISOString();
  cronStats.running = true;

  console.log(`[cron] Rotation ${index} (slot ${slot}): ${name}`);

  let saved = 0;
  try {
    const headers = { Authorization: `Bearer ${AUTH_TOKEN}`, "Content-Type": "application/json" };
    const base = `http://localhost:${PORT}`;

    switch (slot) {
      case 0: // SAM.gov
      case 11: { // SAM.gov 2nd check
        const r = await fetch(`${base}/cron/sam`, { method: "POST", headers, signal: AbortSignal.timeout(1800000) });
        const data = await r.json();
        saved = data.saved || 0;
        break;
      }
      case 1: { // USASpending
        const r = await fetch(`${base}/cron/usaspending`, { method: "POST", headers, signal: AbortSignal.timeout(600000) });
        const data = await r.json();
        saved = data.saved || 0;
        break;
      }
      case 2: { // Grants.gov
        const r = await fetch(`${base}/cron/grants`, { method: "POST", headers, signal: AbortSignal.timeout(600000) });
        const data = await r.json();
        saved = data.saved || 0;
        break;
      }
      case 3: { // States batch 1
        const r = await fetch(`${base}/cron/scrape-html`, { method: "POST", headers, body: JSON.stringify({ sources: STATE_BATCH_1 }), signal: AbortSignal.timeout(600000) });
        const data = await r.json();
        saved = data.total || 0;
        break;
      }
      case 4: { // States batch 2
        const r = await fetch(`${base}/cron/scrape-html`, { method: "POST", headers, body: JSON.stringify({ sources: STATE_BATCH_2 }), signal: AbortSignal.timeout(600000) });
        const data = await r.json();
        saved = data.total || 0;
        break;
      }
      case 5: { // States batch 3
        const r = await fetch(`${base}/cron/scrape-html`, { method: "POST", headers, body: JSON.stringify({ sources: STATE_BATCH_3 }), signal: AbortSignal.timeout(600000) });
        const data = await r.json();
        saved = data.total || 0;
        break;
      }
      case 6: { // States batch 4
        const r = await fetch(`${base}/cron/scrape-html`, { method: "POST", headers, body: JSON.stringify({ sources: STATE_BATCH_4 }), signal: AbortSignal.timeout(600000) });
        const data = await r.json();
        saved = data.total || 0;
        break;
      }
      case 7: { // States batch 5
        const r = await fetch(`${base}/cron/scrape-html`, { method: "POST", headers, body: JSON.stringify({ sources: STATE_BATCH_5 }), signal: AbortSignal.timeout(600000) });
        const data = await r.json();
        saved = data.total || 0;
        break;
      }
      case 8: { // Federal civilian
        const r = await fetch(`${base}/cron/scrape-html`, { method: "POST", headers, body: JSON.stringify({ sources: ALL_FEDERAL_SOURCES }), signal: AbortSignal.timeout(900000) });
        const data = await r.json();
        saved = data.total || 0;
        break;
      }
      case 9: { // SBIR + Military (scrape via Patchright)
        const sbirSources = [
          { id: "sbir_gov", name: "SBIR.gov", url: "https://www.sbir.gov/sbirsearch/topic/current", source_type: "sbir_sttr" },
          { id: "dodsbir", name: "DoD SBIR", url: "https://www.dodsbirsttr.mil/submissions/", source_type: "sbir_sttr" },
          { id: "nih_sbir", name: "NIH SBIR", url: "https://seed.nih.gov/sbir-sttr-funding-opportunities", source_type: "sbir_sttr" },
          { id: "nsf_sbir", name: "NSF SBIR", url: "https://www.nsf.gov/funding/pgm_summ.jsp?pims_id=505362", source_type: "sbir_sttr" },
          { id: "doe_sbir", name: "DOE SBIR", url: "https://science.osti.gov/sbir", source_type: "sbir_sttr" },
          { id: "army_mil", name: "Army Procurement", url: "https://www.army.mil/asaalt/", source_type: "military_defense" },
          { id: "navy_mil", name: "Navy Procurement", url: "https://www.neco.navy.mil/", source_type: "military_defense" },
        ];
        const r = await fetch(`${base}/cron/scrape-html`, { method: "POST", headers, body: JSON.stringify({ sources: sbirSources }), signal: AbortSignal.timeout(600000) });
        const data = await r.json();
        saved = data.total || 0;
        break;
      }
      case 10: { // Forecasts + Subcontracting
        const miscSources = [
          { id: "sam_forecasts", name: "SAM Forecasts", url: "https://sam.gov/search/?index=opp&is_active=true&sort=-modifiedDate&opp_type=forecasts", source_type: "forecasts" },
          { id: "gsa_subk", name: "GSA Subcontracting", url: "https://www.gsa.gov/small-business/subcontracting-opportunities/subcontracting-directory", source_type: "subcontracting" },
          { id: "sba_subk", name: "SBA Subcontracting", url: "https://www.sba.gov/federal-contracting/contracting-assistance-programs/subcontracting-network-subnet", source_type: "subcontracting" },
        ];
        const r = await fetch(`${base}/cron/scrape-html`, { method: "POST", headers, body: JSON.stringify({ sources: miscSources }), signal: AbortSignal.timeout(600000) });
        const data = await r.json();
        saved = data.total || 0;
        break;
      }
    }

    trackRecords(saved);
    cronStats.rotationResults[name] = { saved, at: new Date().toISOString() };
    console.log(`[cron] Rotation ${index} (${name}): ${saved} records saved`);

    // Run matching after scrape if new records were added
    if (saved > 0) {
      try {
        const matched = await runBulkMatching();
        if (matched > 0) console.log(`[cron] Matching: ${matched} new matches created`);
      } catch (e) {
        console.log(`[cron] Matching error: ${e.message}`);
      }
    }
  } catch (e) {
    console.log(`[cron] Rotation ${index} (${name}) error: ${e.message}`);
    cronStats.rotationResults[name] = { error: e.message, at: new Date().toISOString() };
  }

  cronStats.running = false;
}

// Bulk NAICS-based matching: matches orgs against unmatched opportunities
async function runBulkMatching() {
  const headers = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" };

  // Get ALL organizations (filter NAICS client-side since empty array vs null varies)
  if (!SUPABASE_KEY) { console.log("[match] No SUPABASE_KEY — cannot match"); return 0; }
  const orgRes = await fetch(`${SUPABASE_URL}/rest/v1/organizations?select=id,name,naics_codes,certifications`, { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } });
  const allOrgs = await orgRes.json();
  console.log(`[match] Org query status: ${orgRes.status}, result type: ${typeof allOrgs}, isArray: ${Array.isArray(allOrgs)}, length: ${Array.isArray(allOrgs) ? allOrgs.length : 'N/A'}`);
  if (!Array.isArray(allOrgs) || allOrgs.length === 0) {
    console.log("[match] No orgs found or error:", JSON.stringify(allOrgs).substring(0, 300));
    return 0;
  }
  const orgs = allOrgs.filter(o => o.naics_codes && Array.isArray(o.naics_codes) && o.naics_codes.length > 0);
  console.log(`[match] ${allOrgs.length} total orgs, ${orgs.length} with NAICS codes`);
  if (allOrgs.length > 0) {
    console.log(`[match] Sample org: ${JSON.stringify({ id: allOrgs[0].id, name: allOrgs[0].name, naics: allOrgs[0].naics_codes }).substring(0, 200)}`);
  }
  if (!orgs.length) {
    console.log("[match] No orgs with NAICS — running broad matching for all orgs");
    return await runBroadMatching(allOrgs, headers);
  }

  let totalMatched = 0;

  for (const org of orgs) {

    // Get existing matched opportunity IDs
    const existRes = await fetch(`${SUPABASE_URL}/rest/v1/opportunity_matches?select=opportunity_id&organization_id=eq.${org.id}&is_demo=eq.false`, { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } });
    const existing = await existRes.json();
    const existingIds = new Set((existing || []).map(m => m.opportunity_id));

    // Find opportunities matching any of the org's NAICS codes
    for (const naics of org.naics_codes) {
      // Exact match
      const oppRes = await fetch(`${SUPABASE_URL}/rest/v1/opportunities?select=id,title,agency,naics_code,set_aside,estimated_value,source,response_deadline&naics_code=eq.${naics}&limit=500`, { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } });
      const opps = await oppRes.json();

      // 4-digit prefix match
      const prefix = naics.substring(0, 4);
      const prefixRes = await fetch(`${SUPABASE_URL}/rest/v1/opportunities?select=id,title,agency,naics_code,set_aside,estimated_value,source,response_deadline&naics_code=like.${prefix}*&naics_code=neq.${naics}&limit=500`, { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } });
      const prefixOpps = await prefixRes.json();

      const allOpps = [...(Array.isArray(opps) ? opps : []), ...(Array.isArray(prefixOpps) ? prefixOpps : [])];
      const newOpps = allOpps.filter(o => !existingIds.has(o.id));
      if (!newOpps.length) continue;

      const matches = newOpps.map(opp => {
        let score = 0;
        const isExact = opp.naics_code === naics;
        score += isExact ? 50 : 30;

        // Set-aside bonus
        if (opp.set_aside && org.certifications?.length) {
          const sa = (opp.set_aside || "").toLowerCase();
          if (org.certifications.some(c => sa.includes(c.toLowerCase().substring(0, 4)))) score += 20;
        }
        if (opp.estimated_value > 0) score += 5;
        if (opp.source === "sam_gov") score += 5;

        score = Math.min(score, 100);
        const rec = score >= 70 ? "bid" : score >= 40 ? "monitor" : "skip";

        return {
          organization_id: org.id,
          opportunity_id: opp.id,
          match_score: score,
          bid_recommendation: rec,
          recommendation_reasoning: `${isExact ? "Exact" : "Sector"} NAICS ${opp.naics_code} match. ${opp.agency || ""}`.trim(),
          user_status: "new",
          is_demo: false,
        };
      }).filter(m => m.match_score >= 20);

      // Upsert in batches of 200
      for (let i = 0; i < matches.length; i += 200) {
        const batch = matches.slice(i, i + 200);
        await fetch(`${SUPABASE_URL}/rest/v1/opportunity_matches?on_conflict=organization_id,opportunity_id`, {
          method: "POST",
          headers: { ...headers, Prefer: "resolution=merge-duplicates" },
          body: JSON.stringify(batch),
        });
        for (const m of batch) existingIds.add(m.opportunity_id);
      }
      totalMatched += matches.length;
    }
  }
  return totalMatched;
}

// Broad matching: for orgs without NAICS, match ALL unmatched opportunities
// Skip the dedup check — just create matches for random samples of unmatched opps using upsert
async function runBroadMatching(allOrgs, headers) {
  let totalMatched = 0;
  const MAX_PER_ORG = 5000; // max new matches per org per run
  const BATCH_SIZE = 1000;

  for (const org of allOrgs) {
    // Get count of existing matches for this org
    const countRes = await fetch(`${SUPABASE_URL}/rest/v1/opportunity_matches?select=id&organization_id=eq.${org.id}`, { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, Prefer: "count=exact" } });
    const existCount = parseInt(countRes.headers.get("content-range")?.split("/")[1] || "0");

    let orgMatched = 0;
    let offset = existCount; // Start AFTER the already-matched opportunities (they're ordered by created_at desc, same as opps)

    console.log(`[match] Broad: org ${org.name || org.id}: ${existCount} existing matches, starting from offset ${offset}`);

    while (orgMatched < MAX_PER_ORG) {
      // Get a batch of opportunities, offsetting past already-matched ones
      const oppRes = await fetch(`${SUPABASE_URL}/rest/v1/opportunities?select=id,title,agency,naics_code,set_aside,estimated_value,source,response_deadline&order=created_at.desc&limit=${BATCH_SIZE}&offset=${offset}`, { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } });
      const opps = await oppRes.json();
      if (!Array.isArray(opps) || !opps.length) break;

      // Score each opp
      const matches = opps.map(opp => {
        let score = 30;
        if (opp.source === "sam_gov") score += 15;
        else if (["federal_civilian", "usaspending"].includes(opp.source)) score += 10;
        else if (opp.source?.startsWith("state_")) score += 5;
        if (opp.estimated_value > 0) score += 10;
        if (opp.set_aside) score += 5;
        score = Math.min(score, 100);
        return {
          organization_id: org.id,
          opportunity_id: opp.id,
          match_score: score,
          bid_recommendation: score >= 50 ? "monitor" : "skip",
          recommendation_reasoning: `${opp.source || "federal"} opportunity: ${opp.agency || "Unknown agency"}`,
          user_status: "new",
          is_demo: false,
        };
      }).filter(m => m.match_score >= 30);

      if (!matches.length) break;

      // Upsert — database handles dedup via on_conflict
      for (let i = 0; i < matches.length; i += 200) {
        const batch = matches.slice(i, i + 200);
        const upsertRes = await fetch(`${SUPABASE_URL}/rest/v1/opportunity_matches`, {
          method: "POST",
          headers: { ...headers, Prefer: "resolution=ignore-duplicates,return=minimal" },
          body: JSON.stringify(batch),
        });
        if (!upsertRes.ok) {
          const err = await upsertRes.text();
          console.log(`[match] Upsert error: ${upsertRes.status} ${err.substring(0, 200)}`);
          break;
        }
      }

      orgMatched += matches.length;
      offset += BATCH_SIZE;

      if (opps.length < BATCH_SIZE) break; // no more opps
    }

    totalMatched += orgMatched;
    if (orgMatched > 0) console.log(`[match] Broad: ${orgMatched} matches for ${org.name || org.id}`);
  }
  return totalMatched;
}

app.listen(PORT, () => {
  console.log(`Patchright scraper server running on port ${PORT}`);

  if (SUPABASE_KEY) {
    const ROTATION_INTERVAL = 5 * 60 * 1000; // 5 minutes

    // First rotation 30 seconds after startup
    setTimeout(async () => {
      await runRotation(cronStats.rotationIndex++);

      // Then every 5 minutes
      setInterval(async () => {
        if (cronStats.running) {
          console.log("[cron] Previous rotation still running, skipping...");
          return;
        }
        await runRotation(cronStats.rotationIndex++);
      }, ROTATION_INTERVAL);
    }, 30000);

    console.log("[cron] 5-minute rotation cron enabled (12 slots, every source checked hourly)");
  } else {
    console.log("[cron] No SUPABASE_KEY — auto-scraping disabled");
  }
});
