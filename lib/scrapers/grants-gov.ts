import { logger } from "@/lib/logger";
import type { ScraperResult } from "./index";
import type { SupabaseAdmin } from "./types";

const GRANTS_GOV_API = "https://apply07.grants.gov/grantsws/rest/opportunities/search";

interface GrantsGovOpportunity {
  id?: number;
  opportunityId?: number;
  opportunityNumber?: string;
  opportunityTitle?: string;
  title?: string;
  number?: string;
  agencyCode?: string;
  agency?: string;
  closeDateStr?: string;
  closeDate?: string;
  openDateStr?: string;
  openDate?: string;
  cfdaList?: string;
  description?: string;
  awardCeiling?: number;
  awardFloor?: number;
  estimatedTotalFunding?: number;
}

// Parse dates from MM/DD/YYYY to YYYY-MM-DD
function parseDate(d: string | null | undefined): string | null {
  if (!d) return null;
  const parts = d.split("/");
  if (parts.length === 3) return `${parts[2]}-${parts[0].padStart(2, "0")}-${parts[1].padStart(2, "0")}`;
  return d;
}

// Build a date range string for the last N days in MM/DD/YYYY format
function dateRangeLast(days: number): string {
  const now = new Date();
  const past = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const fmt = (d: Date) =>
    `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`;
  return `${fmt(past)}-${fmt(now)}`;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const AGENCIES = [
  "DOD", "HHS", "DOE", "NSF", "NASA", "EPA", "USDA", "DOJ", "DOI", "DOT",
  "DHS", "VA", "HUD", "ED", "DOL", "DOC", "USDOT", "DOS", "IMLS", "NEA",
  "NEH", "PAMS", "MCC", "ONDCP", "AC",
];

async function upsertOpp(supabase: SupabaseAdmin, opp: GrantsGovOpportunity, fallbackAgency?: string): Promise<boolean> {
  const oppId = opp.id ?? opp.opportunityId;
  if (!oppId) return false;

  const { error } = await supabase.from("opportunities").upsert(
    {
      notice_id: `grants-gov-${oppId}`,
      title: opp.title ?? opp.opportunityTitle ?? "Untitled Grant",
      agency: opp.agency ?? opp.agencyCode ?? fallbackAgency ?? "Unknown",
      solicitation_number: opp.number ?? opp.opportunityNumber ?? String(oppId),
      value_estimate: opp.estimatedTotalFunding ?? opp.awardCeiling ?? null,
      response_deadline: parseDate(opp.closeDate ?? opp.closeDateStr),
      posted_date: parseDate(opp.openDate ?? opp.openDateStr),
      description: opp.description?.substring(0, 10000) ?? null,
      source: "grants_gov",
      source_url: `https://www.grants.gov/search-results-detail/${oppId}`,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: "notice_id" }
  );

  return !error;
}

export async function scrapeGrantsGov(supabase: SupabaseAdmin): Promise<ScraperResult> {
  const startedAt = new Date().toISOString();

  try {
    const PER_PAGE = 100;
    let offset = 0;
    let totalFetched = 0;
    let totalSaved = 0;
    let hitCount = 0;

    const dateRange = dateRangeLast(180);

    // ── Phase 1: Global query ──────────────────────────────────────────
    do {
      const payload = {
        keyword: "",
        oppStatuses: "posted",
        sortBy: "openDate|desc",
        rows: PER_PAGE,
        offset,
        dateRange,
      };

      const res = await fetch(GRANTS_GOV_API, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(30000),
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => "unknown");
        logger.info(`[grants-gov] Global query error at offset ${offset}: ${res.status} ${errorText.substring(0, 200)}`);
        if (totalFetched > 0) {
          logger.info(`[grants-gov] Proceeding with ${totalFetched} results from global query`);
          break;
        }
        return {
          source: "grants_gov",
          status: "error",
          opportunities_found: 0,
          matches_created: 0,
          error_message: `Grants.gov API returned ${res.status}`,
          started_at: startedAt,
          completed_at: new Date().toISOString(),
        };
      }

      const data = await res.json();
      const opportunities: GrantsGovOpportunity[] = data.oppHits ?? [];
      hitCount = data.hitCount ?? 0;
      totalFetched += opportunities.length;

      for (const opp of opportunities) {
        if (await upsertOpp(supabase, opp)) totalSaved++;
      }

      logger.info(`[grants-gov] Global: fetched ${opportunities.length} at offset ${offset} (total: ${totalFetched}/${hitCount})`);

      offset += PER_PAGE;
      if (opportunities.length < PER_PAGE) break;
    } while (offset < hitCount);

    logger.info(`[grants-gov] Global query complete: ${totalFetched} fetched, ${totalSaved} saved`);

    // ── Phase 2: Per-agency queries for broader coverage ───────────────
    let agencySaved = 0;
    let agencyFetched = 0;

    for (const agencyCode of AGENCIES) {
      let agencyOffset = 0;
      let agencyHitCount = 0;
      let agencyPageNum = 0;

      try {
        do {
          agencyPageNum++;
          const agencyRes = await fetch(GRANTS_GOV_API, {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({
              keyword: "",
              oppStatuses: "posted",
              sortBy: "openDate|desc",
              rows: PER_PAGE,
              offset: agencyOffset,
              agencies: agencyCode,
              dateRange,
            }),
            signal: AbortSignal.timeout(30000),
          });

          if (!agencyRes.ok) {
            logger.info(`[grants-gov] Agency ${agencyCode} error at offset ${agencyOffset}: ${agencyRes.status}`);
            break;
          }

          const agencyData = await agencyRes.json();
          const agencyOpps: GrantsGovOpportunity[] = agencyData.oppHits ?? [];
          agencyHitCount = agencyData.hitCount ?? 0;
          totalFetched += agencyOpps.length;
          agencyFetched += agencyOpps.length;

          for (const opp of agencyOpps) {
            if (await upsertOpp(supabase, opp, agencyCode)) {
              totalSaved++;
              agencySaved++;
            }
          }

          logger.info(`[grants-gov] Agency ${agencyCode} page ${agencyPageNum}: ${agencyOpps.length} opps (offset ${agencyOffset}, hitCount ${agencyHitCount})`);

          agencyOffset += PER_PAGE;
          if (agencyOpps.length < PER_PAGE) break;
        } while (agencyOffset < agencyHitCount);
      } catch (agencyErr) {
        logger.info(`[grants-gov] Agency ${agencyCode} failed at offset ${agencyOffset}: ${agencyErr}`);
      }

      // Rate-limit: 1 second pause between agencies
      await sleep(1000);
    }

    logger.info(`[grants-gov] Per-agency queries complete: ${agencyFetched} fetched, ${agencySaved} saved`);
    logger.info(`[grants-gov] Total: ${totalFetched} fetched, ${totalSaved} saved`);

    return {
      source: "grants_gov",
      status: "success",
      opportunities_found: totalFetched,
      matches_created: totalSaved,
      started_at: startedAt,
      completed_at: new Date().toISOString(),
    };
  } catch (err) {
    return {
      source: "grants_gov",
      status: "error",
      opportunities_found: 0,
      matches_created: 0,
      error_message: err instanceof Error ? err.message : String(err),
      started_at: startedAt,
      completed_at: new Date().toISOString(),
    };
  }
}
