const express = require("express");
const puppeteer = require("puppeteer");

const app = express();
app.use(express.json({ limit: "10mb" }));

const PORT = process.env.PORT || 3001;
const AUTH_TOKEN = process.env.RENDER_AUTH_TOKEN || "ci-puppeteer-2026";
const SUPABASE_URL = process.env.SUPABASE_URL || "https://qpyskwvhgclrlychhxjk.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

let browser = null;

async function getBrowser() {
  if (!browser || !browser.connected) {
    browser = await puppeteer.launch({
      headless: "new",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--single-process",
        "--no-zygote",
      ],
    });
  }
  return browser;
}

function authCheck(req, res) {
  const auth = req.headers.authorization;
  if (auth !== `Bearer ${AUTH_TOKEN}`) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  return true;
}

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

// Render a page with JavaScript
app.get("/render", async (req, res) => {
  if (!authCheck(req, res)) return;

  const url = req.query.url;
  const wait = parseInt(req.query.wait) || 5000;

  if (!url) {
    return res.status(400).json({ error: "url parameter required" });
  }

  let page = null;
  try {
    const b = await getBrowser();
    page = await b.newPage();

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );
    await page.setViewport({ width: 1280, height: 800 });

    await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });
    await new Promise((r) => setTimeout(r, wait));

    const html = await page.content();
    res.json({ success: true, url, html, length: html.length });
  } catch (err) {
    res.status(500).json({ success: false, url, error: err.message });
  } finally {
    if (page) await page.close().catch(() => {});
  }
});

// Batch render multiple URLs
app.post("/render-batch", async (req, res) => {
  if (!authCheck(req, res)) return;

  const { urls, wait = 5000 } = req.body;
  if (!urls || !Array.isArray(urls)) {
    return res.status(400).json({ error: "urls array required" });
  }

  const results = [];
  for (const url of urls.slice(0, 20)) {
    let page = null;
    try {
      const b = await getBrowser();
      page = await b.newPage();
      await page.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
      );
      await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });
      await new Promise((r) => setTimeout(r, wait));
      const html = await page.content();
      results.push({ url, success: true, html, length: html.length });
    } catch (err) {
      results.push({ url, success: false, error: err.message });
    } finally {
      if (page) await page.close().catch(() => {});
    }
  }

  res.json({ results, count: results.length });
});

// ============================================================
// CRON SCRAPING ENDPOINTS
// ============================================================

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
        // One-by-one fallback
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

const crypto = require("crypto");
function makeNoticeId(prefix, ...parts) {
  const raw = parts.filter(Boolean).join("-");
  const h = crypto.createHash("md5").update(raw).digest("hex").substring(0, 12);
  return `${prefix}-${h}`;
}

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
      if (totalSaved > 0) break;
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
        body: JSON.stringify({ keyword: "", oppStatuses: "forecasted|posted", sortBy: "openDate|desc", rows: 500, offset }),
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

// Cron: Scrape HTML source via Puppeteer
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
    let page = null;
    try {
      const b = await getBrowser();
      page = await b.newPage();
      await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
      await page.setViewport({ width: 1280, height: 800 });
      await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });
      await new Promise(r => setTimeout(r, 5000));
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

      // Dedup
      const seen = new Set();
      const unique = records.filter(r => { if (seen.has(r.notice_id)) return false; seen.add(r.notice_id); return true; });
      const saved = await upsertToSupabase(unique);
      results.push({ id, name, saved, status: "ok" });
      console.log(`[cron] ${name}: ${saved} items`);
    } catch (e) {
      results.push({ id, name, saved: 0, status: "error", error: e.message });
      console.log(`[cron] ${name}: error - ${e.message}`);
    } finally {
      if (page) await page.close().catch(() => {});
    }
    await new Promise(r => setTimeout(r, 2000));
  }

  res.json({ results, total: results.reduce((s, r) => s + r.saved, 0) });
});

// Cron: Run all scrapers (master endpoint)
app.post("/cron/scrape-all", async (req, res) => {
  if (!authCheck(req, res)) return;
  console.log("[cron] Full scrape-all starting...");

  const summary = {};

  // 1. USASpending
  try {
    const r = await fetch(`http://localhost:${PORT}/cron/usaspending`, {
      method: "POST", headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
    });
    summary.usaspending = await r.json();
  } catch (e) { summary.usaspending = { error: e.message }; }

  // 2. Grants.gov
  try {
    const r = await fetch(`http://localhost:${PORT}/cron/grants`, {
      method: "POST", headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
    });
    summary.grants_gov = await r.json();
  } catch (e) { summary.grants_gov = { error: e.message }; }

  // 3. States (via HTML scraping)
  const stateSources = [
    { id: "state-AL", name: "Alabama", url: "https://purchasing.alabama.gov/", source_type: "state_local" },
    { id: "state-CA", name: "California", url: "https://caleprocure.ca.gov/pages/Events-BS3/event-search.aspx", source_type: "state_local" },
    { id: "state-CT", name: "Connecticut", url: "https://portal.ct.gov/DAS/Procurement/", source_type: "state_local" },
    { id: "state-FL", name: "Florida", url: "https://vendor.myfloridamarketplace.com/search/bids", source_type: "state_local" },
    { id: "state-GA", name: "Georgia", url: "https://ssl.doas.state.ga.us/gpr/", source_type: "state_local" },
    { id: "state-IL", name: "Illinois", url: "https://www.bidbuy.illinois.gov/", source_type: "state_local" },
    { id: "state-IN", name: "Indiana", url: "https://www.in.gov/idoa/procurement/", source_type: "state_local" },
    { id: "state-ME", name: "Maine", url: "https://www.maine.gov/purchases/", source_type: "state_local" },
    { id: "state-MA", name: "Massachusetts", url: "https://www.commbuys.com/", source_type: "state_local" },
    { id: "state-NY", name: "New York", url: "https://ogs.ny.gov/procurement", source_type: "state_local" },
    { id: "state-OH", name: "Ohio", url: "https://procure.ohio.gov/", source_type: "state_local" },
    { id: "state-PA", name: "Pennsylvania", url: "https://www.emarketplace.state.pa.us/", source_type: "state_local" },
    { id: "state-SC", name: "South Carolina", url: "https://procurement.sc.gov/", source_type: "state_local" },
    { id: "state-TX", name: "Texas", url: "https://www.txsmartbuy.com/sp", source_type: "state_local" },
    { id: "state-VA", name: "Virginia", url: "https://eva.virginia.gov/", source_type: "state_local" },
    { id: "state-DC", name: "DC", url: "https://ocp.dc.gov/page/solicitations", source_type: "state_local" },
  ];

  try {
    const r = await fetch(`http://localhost:${PORT}/cron/scrape-html`, {
      method: "POST",
      headers: { Authorization: `Bearer ${AUTH_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ sources: stateSources }),
    });
    summary.states = await r.json();
  } catch (e) { summary.states = { error: e.message }; }

  console.log("[cron] Full scrape-all complete");
  res.json(summary);
});

app.listen(PORT, () => {
  console.log(`Puppeteer server running on port ${PORT}`);

  // Built-in cron: auto-trigger scraping every 30 minutes
  if (SUPABASE_KEY) {
    const CRON_INTERVAL = 30 * 60 * 1000; // 30 minutes
    const lastRun = { usaspending: 0, grants: 0, states: 0 };
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

        // Every 2 hours: State portals
        if (now - lastRun.states > 2 * HOUR) {
          console.log("[cron] Triggering state portals...");
          const stateSources = [
            { id: "state-AL", name: "Alabama", url: "https://purchasing.alabama.gov/", source_type: "state_local" },
            { id: "state-CA", name: "California", url: "https://caleprocure.ca.gov/pages/Events-BS3/event-search.aspx", source_type: "state_local" },
            { id: "state-CT", name: "Connecticut", url: "https://portal.ct.gov/DAS/Procurement/", source_type: "state_local" },
            { id: "state-FL", name: "Florida", url: "https://vendor.myfloridamarketplace.com/search/bids", source_type: "state_local" },
            { id: "state-IN", name: "Indiana", url: "https://www.in.gov/idoa/procurement/", source_type: "state_local" },
            { id: "state-ME", name: "Maine", url: "https://www.maine.gov/purchases/", source_type: "state_local" },
            { id: "state-NY", name: "New York", url: "https://ogs.ny.gov/procurement", source_type: "state_local" },
            { id: "state-SC", name: "South Carolina", url: "https://procurement.sc.gov/", source_type: "state_local" },
            { id: "state-TX", name: "Texas", url: "https://www.txsmartbuy.com/sp", source_type: "state_local" },
            { id: "state-VA", name: "Virginia", url: "https://eva.virginia.gov/", source_type: "state_local" },
          ];
          const r = await fetch(`http://localhost:${PORT}/cron/scrape-html`, {
            method: "POST",
            headers: { Authorization: `Bearer ${AUTH_TOKEN}`, "Content-Type": "application/json" },
            body: JSON.stringify({ sources: stateSources }),
            signal: AbortSignal.timeout(600000),
          });
          const data = await r.json();
          console.log(`[cron] States result: ${data.total} saved`);
          lastRun.states = now;
        }
      } catch (e) {
        console.log(`[cron] Cycle error: ${e.message}`);
      }

      console.log(`[cron] Cycle complete at ${new Date().toISOString()}`);
    }

    // First run after 60 seconds (let server start up)
    setTimeout(cronCycle, 60000);
    // Then every 30 minutes
    setInterval(cronCycle, CRON_INTERVAL);
    console.log("[cron] Auto-scraping enabled: every 30 minutes");
  } else {
    console.log("[cron] No SUPABASE_KEY — auto-scraping disabled");
  }
});
