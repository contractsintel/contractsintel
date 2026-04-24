#!/usr/bin/env node
/**
 * One-shot backfill for the Apr 15 - Apr 22, 2026 SAM ingest gap.
 *
 * Context
 * -------
 * The production SAM key was exhausted (and/or externally burned) from roughly
 * Apr 15 through Apr 22. During that window the cron kept running but SAM
 * returned 429s, so no opportunities were written. Key was rotated Apr 22.
 * This script catches the table up once the new key is confirmed healthy.
 *
 * What it does
 * ------------
 * Paginates SAM /opportunities/v2/search with postedFrom=04/15/2026 and
 * postedTo=04/22/2026, looping offset += 1000 until a short page returns.
 * Upserts rows into `opportunities` with the same column mapping as the
 * normal cron (see app/api/cron/scrape-opportunities/route.ts).
 *
 * Incremental upsert
 * ------------------
 * Each page is upserted IMMEDIATELY after fetch. If SAM 429s (or any other
 * fetch error) mid-run, all successfully-fetched pages are already
 * persisted, and the script logs a resume hint and exits 0 (partial
 * progress is still valid progress). Re-run the script to resume; because
 * upsert is keyed on notice_id, re-upserting earlier pages is a no-op.
 *
 * Usage
 * -----
 *   SAM_API_KEY=... \
 *   NEXT_PUBLIC_SUPABASE_URL=... \
 *   SUPABASE_SERVICE_ROLE_KEY=... \
 *   node scripts/backfill-sam-gap.js
 *
 * Safety
 * ------
 * - Idempotent: upsert on notice_id. Safe to re-run.
 * - MAX_PAGES cap of 10 (10k opportunities) prevents runaway quota burn.
 * - Run ONCE after the Apr 23 00:05 UTC probe confirms the new key is clean.
 */

const { createClient } = require("@supabase/supabase-js");

const SAM_ENDPOINT = "https://api.sam.gov/opportunities/v2/search";
const POSTED_FROM = "04/15/2026";
const POSTED_TO = "04/22/2026";
const PAGE_SIZE = 1000;
const MAX_PAGES = 10;
const UPSERT_CHUNK = 500;

/**
 * @typedef {Object} SamOpportunity
 * @property {string} noticeId
 * @property {string=} title
 * @property {string=} solicitationNumber
 * @property {string=} department
 * @property {string=} subtier
 * @property {string=} office
 * @property {string=} postedDate
 * @property {string=} setAside
 * @property {string=} setAsideDescription
 * @property {string=} responseDeadLine
 * @property {string=} naicsCode
 * @property {{city?:{name?:string}, state?:{code?:string}}=} placeOfPerformance
 * @property {string=} description
 * @property {string=} uiLink
 * @property {{amount?:number}=} award
 */

function mapOppToRow(opp) {
  const agency = [opp.department, opp.subtier, opp.office].filter(Boolean).join(" / ");
  const pop = opp.placeOfPerformance;
  const placeStr = pop ? [pop.city && pop.city.name, pop.state && pop.state.code].filter(Boolean).join(", ") : null;
  return {
    notice_id: opp.noticeId,
    title: opp.title || "Untitled",
    agency: agency || "Unknown",
    solicitation_number: opp.solicitationNumber || null,
    set_aside: opp.setAsideDescription || opp.setAside || null,
    naics_code: opp.naicsCode || null,
    place_of_performance: placeStr,
    estimated_value: (opp.award && opp.award.amount) || null,
    response_deadline: opp.responseDeadLine || null,
    posted_date: opp.postedDate || null,
    description: opp.description ? opp.description.substring(0, 10000) : null,
    sam_url: opp.uiLink || null,
  };
}

async function fetchPage(apiKey, page) {
  const params = new URLSearchParams({
    api_key: apiKey,
    postedFrom: POSTED_FROM,
    postedTo: POSTED_TO,
    limit: String(PAGE_SIZE),
    offset: String(page * PAGE_SIZE),
  });
  const res = await fetch(`${SAM_ENDPOINT}?${params.toString()}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    const body = await res.text();
    const err = new Error(`SAM returned ${res.status} on page ${page}: ${body}`);
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  return data.opportunitiesData || data.opportunities || [];
}

async function upsertBatch(supabase, rows) {
  let upserted = 0;
  let failed = 0;
  for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
    const chunk = rows.slice(i, i + UPSERT_CHUNK);
    const { error, count } = await supabase
      .from("opportunities")
      .upsert(chunk, { onConflict: "notice_id", count: "exact" });
    if (error) {
      console.error(`    chunk ${i}-${i + chunk.length} failed: ${error.message}`);
      failed += chunk.length;
    } else {
      upserted += count != null ? count : chunk.length;
    }
  }
  return { upserted, failed };
}

async function main() {
  const apiKey = process.env.SAM_API_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!apiKey) throw new Error("SAM_API_KEY not set");
  if (!supabaseUrl) throw new Error("NEXT_PUBLIC_SUPABASE_URL not set");
  if (!supabaseKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY not set");

  console.log(`Backfilling SAM window ${POSTED_FROM} → ${POSTED_TO} (incremental upsert)...`);
  const supabase = createClient(supabaseUrl, supabaseKey);

  let totalFetched = 0;
  let totalUpserted = 0;
  let totalFailed = 0;
  let lastCompletedPage = -1;
  let stoppedEarly = false;
  let stopReason = null;

  for (let page = 0; page < MAX_PAGES; page++) {
    console.log(`\n[page ${page}] fetching offset=${page * PAGE_SIZE}...`);
    let batch;
    try {
      batch = await fetchPage(apiKey, page);
    } catch (err) {
      stoppedEarly = true;
      stopReason = err.message;
      console.error(`[page ${page}] fetch error: ${err.message}`);
      break;
    }

    console.log(`[page ${page}] fetched ${batch.length} rows`);
    totalFetched += batch.length;

    if (batch.length > 0) {
      const rows = batch.map(mapOppToRow);
      const { upserted, failed } = await upsertBatch(supabase, rows);
      totalUpserted += upserted;
      totalFailed += failed;
      console.log(`[page ${page}] upserted=${upserted} failed=${failed}`);
    }

    lastCompletedPage = page;

    if (batch.length < PAGE_SIZE) {
      console.log(`[page ${page}] short page — reached end of window`);
      break;
    }
  }

  console.log(`\n================ Backfill summary ================`);
  console.log(`Fetched:  ${totalFetched}`);
  console.log(`Upserted: ${totalUpserted}`);
  console.log(`Failed:   ${totalFailed}`);
  if (stoppedEarly) {
    const nextPage = lastCompletedPage + 1;
    console.log(`\nStopped early at page ${nextPage}. Reason: ${stopReason}`);
    console.log(`Backfilled pages 0-${lastCompletedPage}. Resume from page ${nextPage} on next run.`);
    console.log(`(Re-run the script after quota resets; upsert is idempotent on notice_id.)`);
  } else {
    console.log(`\nAll pages complete (0-${lastCompletedPage}).`);
  }
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
