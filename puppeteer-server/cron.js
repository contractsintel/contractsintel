#!/usr/bin/env node
/**
 * ContractsIntel Cron Worker — runs on Railway
 * Triggers scraping endpoints on the Puppeteer server at regular intervals.
 *
 * Schedule:
 *   Every 1 hour:  USASpending, Grants.gov
 *   Every 2 hours: State portals, Federal civilian, SBIR
 *   Every 4 hours: Military, Forecasts
 */

const SERVER_URL = process.env.INTERNAL_URL || `http://localhost:${process.env.PORT || 3001}`;
const AUTH_TOKEN = process.env.RENDER_AUTH_TOKEN || "ci-puppeteer-2026";

async function callEndpoint(path) {
  try {
    const res = await fetch(`${SERVER_URL}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${AUTH_TOKEN}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(600000), // 10 min timeout
    });
    const data = await res.json();
    console.log(`[cron] ${path}: ${JSON.stringify(data).substring(0, 200)}`);
    return data;
  } catch (e) {
    console.log(`[cron] ${path} error: ${e.message}`);
    return { error: e.message };
  }
}

// Track last run times
const lastRun = {
  usaspending: 0,
  grants: 0,
  states: 0,
  federal: 0,
  sbir: 0,
  military: 0,
};

async function runCronCycle() {
  const now = Date.now();
  const HOUR = 3600000;

  console.log(`[cron] Cycle starting at ${new Date().toISOString()}`);

  // Every 1 hour: API sources
  if (now - lastRun.usaspending > 1 * HOUR) {
    await callEndpoint("/cron/usaspending");
    lastRun.usaspending = now;
  }

  if (now - lastRun.grants > 1 * HOUR) {
    await callEndpoint("/cron/grants");
    lastRun.grants = now;
  }

  // Every 2 hours: HTML sources
  if (now - lastRun.states > 2 * HOUR) {
    // All state portals
    const stateSources = [
      { id: "state-AL", name: "Alabama", url: "https://purchasing.alabama.gov/", source_type: "state_local" },
      { id: "state-CA", name: "California", url: "https://caleprocure.ca.gov/pages/Events-BS3/event-search.aspx", source_type: "state_local" },
      { id: "state-CT", name: "Connecticut", url: "https://portal.ct.gov/DAS/Procurement/", source_type: "state_local" },
      { id: "state-DE", name: "Delaware", url: "https://contracts.delaware.gov/", source_type: "state_local" },
      { id: "state-FL", name: "Florida", url: "https://vendor.myfloridamarketplace.com/search/bids", source_type: "state_local" },
      { id: "state-GA", name: "Georgia", url: "https://ssl.doas.state.ga.us/gpr/", source_type: "state_local" },
      { id: "state-ID", name: "Idaho", url: "https://purchasing.idaho.gov/", source_type: "state_local" },
      { id: "state-IL", name: "Illinois", url: "https://www.bidbuy.illinois.gov/", source_type: "state_local" },
      { id: "state-IN", name: "Indiana", url: "https://www.in.gov/idoa/procurement/", source_type: "state_local" },
      { id: "state-IA", name: "Iowa", url: "https://bidopportunities.iowa.gov/", source_type: "state_local" },
      { id: "state-ME", name: "Maine", url: "https://www.maine.gov/purchases/", source_type: "state_local" },
      { id: "state-MA", name: "Massachusetts", url: "https://www.commbuys.com/", source_type: "state_local" },
      { id: "state-MS", name: "Mississippi", url: "https://www.ms.gov/dfa/contract_bid_search/", source_type: "state_local" },
      { id: "state-ND", name: "North Dakota", url: "https://www.nd.gov/omb/agency/procurement/", source_type: "state_local" },
      { id: "state-NY", name: "New York", url: "https://ogs.ny.gov/procurement", source_type: "state_local" },
      { id: "state-OH", name: "Ohio", url: "https://procure.ohio.gov/", source_type: "state_local" },
      { id: "state-OK", name: "Oklahoma", url: "https://oklahoma.gov/omes/services/purchasing.html", source_type: "state_local" },
      { id: "state-PA", name: "Pennsylvania", url: "https://www.emarketplace.state.pa.us/", source_type: "state_local" },
      { id: "state-RI", name: "Rhode Island", url: "https://www.ridop.ri.gov/", source_type: "state_local" },
      { id: "state-SC", name: "South Carolina", url: "https://procurement.sc.gov/", source_type: "state_local" },
      { id: "state-TX", name: "Texas", url: "https://www.txsmartbuy.com/sp", source_type: "state_local" },
      { id: "state-UT", name: "Utah", url: "https://purchasing.utah.gov/", source_type: "state_local" },
      { id: "state-VT", name: "Vermont", url: "https://bgs.vermont.gov/purchasing-contracting", source_type: "state_local" },
      { id: "state-VA", name: "Virginia", url: "https://eva.virginia.gov/", source_type: "state_local" },
      { id: "state-WI", name: "Wisconsin", url: "https://vendornet.wi.gov/", source_type: "state_local" },
      { id: "state-DC", name: "DC", url: "https://ocp.dc.gov/page/solicitations", source_type: "state_local" },
      { id: "state-GU", name: "Guam", url: "https://www.guamopa.com/", source_type: "state_local" },
    ];

    await callEndpoint("/cron/scrape-html").catch(() => {});
    // Actually POST with sources
    try {
      const res = await fetch(`${SERVER_URL}/cron/scrape-html`, {
        method: "POST",
        headers: { Authorization: `Bearer ${AUTH_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({ sources: stateSources }),
        signal: AbortSignal.timeout(600000),
      });
      console.log(`[cron] States done: ${(await res.json()).total} saved`);
    } catch (e) {
      console.log(`[cron] States error: ${e.message}`);
    }
    lastRun.states = now;
  }

  // Every 2 hours: Federal civilian
  if (now - lastRun.federal > 2 * HOUR) {
    const fedSources = [
      { id: "fedciv-gsa", name: "GSA eBuy", url: "https://www.ebuy.gsa.gov/ebuy/", source_type: "federal_civilian" },
      { id: "fedciv-nasa", name: "NASA", url: "https://procurement.nasa.gov/", source_type: "federal_civilian" },
      { id: "fedciv-epa", name: "EPA", url: "https://www.epa.gov/contracts", source_type: "federal_civilian" },
      { id: "fedciv-va", name: "VA", url: "https://www.va.gov/opal/nac/", source_type: "federal_civilian" },
      { id: "fedciv-dhs", name: "DHS", url: "https://www.dhs.gov/procurement-operations", source_type: "federal_civilian" },
      { id: "fedciv-hhs", name: "HHS", url: "https://www.hhs.gov/grants-contracts/index.html", source_type: "federal_civilian" },
      { id: "fedciv-gsa-sub", name: "GSA Subcontracting", url: "https://www.gsa.gov/small-business/subcontracting-opportunities/subcontracting-directory", source_type: "federal_civilian" },
    ];
    try {
      const res = await fetch(`${SERVER_URL}/cron/scrape-html`, {
        method: "POST",
        headers: { Authorization: `Bearer ${AUTH_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({ sources: fedSources }),
        signal: AbortSignal.timeout(300000),
      });
      console.log(`[cron] Federal done: ${(await res.json()).total} saved`);
    } catch (e) {
      console.log(`[cron] Federal error: ${e.message}`);
    }
    lastRun.federal = now;
  }

  console.log(`[cron] Cycle complete at ${new Date().toISOString()}`);
}

// Run every 30 minutes
async function main() {
  console.log("[cron] ContractsIntel cron worker starting...");

  // Run immediately on startup
  await runCronCycle();

  // Then every 30 minutes
  setInterval(runCronCycle, 30 * 60 * 1000);
}

main().catch(console.error);
