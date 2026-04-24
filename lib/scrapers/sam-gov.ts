import { logger } from "@/lib/logger";
import type { ScraperResult } from "./index";
import type { SupabaseAdmin } from "./types";

const SAM_INTERNAL_API = "https://sam.gov/api/prod/sgs/v1/search/";
const SAM_PUBLIC_API = "https://api.sam.gov/opportunities/v2/search";

interface SamResult {
  _id: string;
  title?: string;
  solicitationNumber?: string;
  publishDate?: string;
  responseDate?: string;
  modifiedDate?: string;
  isActive?: boolean;
  type?: { code?: string; value?: string };
  descriptions?: Array<{ content?: string }>;
  organizationHierarchy?: Array<{ level: number; name: string }>;
}

function getAgency(orgs: Array<{ level: number; name: string }>): string {
  const parts = orgs
    .sort((a, b) => a.level - b.level)
    .map((o) => o.name)
    .filter((v, i, a) => a.indexOf(v) === i);
  return parts.join(" / ") || "Unknown";
}

async function fetchInternalApi(page: number, size: number): Promise<{ results: SamResult[]; totalElements: number }> {
  const params = new URLSearchParams({
    index: "opp",
    q: "",
    page: String(page),
    sort: "-modifiedDate",
    size: String(size),
    mode: "search",
    is_active: "true",
  });

  // SAM's internal search API (sam.gov/api/prod/sgs/v1/search/) performs
  // strict content negotiation and only serves HAL-JSON. Sending plain
  // "application/json" has returned HTTP 406 "Not Acceptable" since roughly
  // Apr 9, 2026 — the server response body spells this out exactly:
  //   { "detail": "Acceptable representations: [application/hal+json]" }
  // The response shape is still plain JSON (HAL is a JSON superset with
  // `_embedded` and `_links` conventions, which this code already consumes
  // via `data._embedded?.results`), so only the Accept header needs to change.
  const res = await fetch(`${SAM_INTERNAL_API}?${params}`, {
    headers: {
      Accept: "application/hal+json",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) throw new Error(`SAM internal API returned ${res.status}`);

  const data = await res.json();
  return {
    results: data._embedded?.results ?? [],
    totalElements: data.page?.totalElements ?? 0,
  };
}

// Per-tick page cap + wall-clock budget.
//
// The previous MAX_PAGES=500 was set when this scraper was the only caller
// in a standalone worker; under the Vercel 300s maxDuration on
// /api/cron/scrape-federal (which runs this scraper plus three others in
// sequence) it can exceed the budget mid-pagination and get killed before
// the ScraperResult row is written, leaving no audit trail.
//
// Per-page cost: one fetch (~200-1500ms) + 500ms pause + upsert loop for
// up to PAGE_SIZE=100 rows. Practical budget: keep the sam_gov leg under
// ~180s so three downstream scrapers still fit under 300s.
//
// 100 pages × (~1s fetch + 500ms pause + ~100ms upsert) ≈ 160s worst case.
// Results are sorted -modifiedDate by the upstream API, so page 0 is always
// the freshest — capping at 100 pages preserves newest-first delta behavior
// and re-scans older records on later ticks.
//
// Additionally: a soft wall-clock budget breaks out of the loop early if
// we're approaching the function's maxDuration, guaranteeing we write a
// ScraperResult row even if the catalog is unusually deep. The scraper
// stays idempotent on notice_id, so the next tick resumes without loss.
//
// Follow-up worth filing: store a high-water modifiedDate cursor so we
// early-exit as soon as we re-encounter known records, instead of walking
// the full N pages. That needs a small migration (e.g. scraper_state) and
// is out of scope for this minimal unblocking fix.
const PAGE_SIZE = 100;
const MAX_PAGES = 100;
const WALL_CLOCK_BUDGET_MS = 180_000; // 180s of our 300s share
const PAGE_PAUSE_MS = 500;

export async function scrapeSamGov(supabase: SupabaseAdmin): Promise<ScraperResult> {
  const startedAt = new Date().toISOString();
  const startMs = Date.now();

  try {
    let totalSaved = 0;
    let totalElements = 0;
    let page = 0;
    let hitBudget = false;

    while (page < MAX_PAGES) {
      if (Date.now() - startMs > WALL_CLOCK_BUDGET_MS) {
        hitBudget = true;
        break;
      }

      const { results, totalElements: total } = await fetchInternalApi(page, PAGE_SIZE);
      totalElements = total;
      if (!results.length) break;

      for (const r of results) {
        if (!r._id) continue;

        const orgs = r.organizationHierarchy ?? [];
        const desc = (r.descriptions ?? []).map((d) => d.content ?? "").join("\n").substring(0, 10000);

        const { error } = await supabase.from("opportunities").upsert(
          {
            notice_id: r._id,
            title: (r.title ?? "Untitled").substring(0, 500),
            agency: getAgency(orgs),
            solicitation_number: r.solicitationNumber ?? null,
            response_deadline: r.responseDate ?? null,
            posted_date: r.publishDate ?? null,
            description: desc || null,
            source: "sam_gov",
            source_url: `https://sam.gov/opp/${r._id}/view`,
            last_seen_at: new Date().toISOString(),
          },
          { onConflict: "notice_id" }
        );

        if (!error) totalSaved++;
      }

      logger.info(`[sam-gov] Page ${page}: ${results.length} results, ${totalSaved} saved (${totalElements} total active)`);
      page++;
      if (results.length < PAGE_SIZE) break;
      await new Promise((resolve) => setTimeout(resolve, PAGE_PAUSE_MS));
    }

    if (hitBudget) {
      logger.info(`[sam-gov] Wall-clock budget reached at page ${page}; returning partial progress (${totalSaved} saved).`);
    }

    return {
      source: "sam_gov",
      status: "success",
      opportunities_found: totalSaved,
      matches_created: totalSaved,
      started_at: startedAt,
      completed_at: new Date().toISOString(),
    };
  } catch (err) {
    return {
      source: "sam_gov",
      status: "error",
      opportunities_found: 0,
      matches_created: 0,
      error_message: err instanceof Error ? err.message : String(err),
      started_at: startedAt,
      completed_at: new Date().toISOString(),
    };
  }
}
