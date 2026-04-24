#!/usr/bin/env node
/** DSBS network probe v3 — type into search input, click quick-search, capture real API body. */
"use strict";
const { chromium } = require("patchright");
const fs = require("fs");

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    viewport: { width: 1440, height: 900 },
  });
  const page = await ctx.newPage();

  const events = [];
  page.on("request", (req) => {
    const url = req.url();
    if (!/\/_api\/v2\//.test(url)) return;
    events.push({
      phase: "request",
      url,
      method: req.method(),
      postData: req.postData() || null,
    });
  });
  page.on("response", async (res) => {
    const url = res.url();
    if (!/\/_api\/v2\//.test(url)) return;
    let body = null;
    try {
      body = (await res.text()).slice(0, 6000);
    } catch {}
    events.push({ phase: "response", url, status: res.status(), body });
  });

  console.log("=== GOTO landing ===");
  await page.goto("https://search.certifications.sba.gov/", {
    waitUntil: "networkidle",
    timeout: 45000,
  });
  await page.waitForTimeout(1500);

  console.log("=== type into search input ===");
  await page.fill("#search-input", "hubzone");
  await page.waitForTimeout(400);

  console.log("=== click quick-search ===");
  await page.click('[data-testid="button"].SearchBarNew_quick-search-button__WDhbQ, button[aria-label*="search" i]').catch(async () => {
    console.log("  specific selector miss, trying press Enter on input");
    await page.press("#search-input", "Enter");
  });

  await page.waitForTimeout(6000);
  console.log(`  final URL: ${page.url()}`);
  console.log(`  title: ${await page.title()}`);

  // Also dump the /advanced page HTML so we can see the cert filter form.
  console.log("\n=== GOTO /advanced (for DOM dump) ===");
  await page.goto("https://search.certifications.sba.gov/advanced", {
    waitUntil: "networkidle",
    timeout: 45000,
  });
  await page.waitForTimeout(2000);
  const adv = await page.content();
  fs.writeFileSync("/tmp/dsbs_advanced.html", adv);
  console.log(`  /advanced HTML -> /tmp/dsbs_advanced.html (${adv.length} bytes)`);

  await browser.close();

  fs.writeFileSync("/tmp/dsbs_events.json", JSON.stringify(events, null, 2));
  console.log(`\n=== ${events.length} _api/v2 events ===`);
  for (const ev of events) {
    if (ev.phase === "request") {
      console.log(`-> ${ev.method} ${ev.url}`);
      if (ev.postData) console.log(`   POST: ${ev.postData.slice(0, 2000)}`);
    } else {
      console.log(`<- ${ev.status} ${ev.url}`);
      if (ev.body) console.log(`   BODY: ${ev.body.slice(0, 2000)}`);
    }
  }
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
