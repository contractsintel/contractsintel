import type { ScraperResult } from "./index";

const GRANTS_GOV_API = "https://apply07.grants.gov/grantsws/rest/opportunities/search";

interface GrantsGovOpportunity {
  id?: number;
  opportunityId?: number;
  opportunityNumber?: string;
  opportunityTitle?: string;
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

export async function scrapeGrantsGov(supabase: any): Promise<ScraperResult> {
  const startedAt = new Date().toISOString();

  try {
    const PER_PAGE = 500;
    let offset = 0;
    const allOpportunities: GrantsGovOpportunity[] = [];
    let hitCount = 0;

    // Paginate through all results
    do {
      const payload = {
        keyword: "",
        oppStatuses: "forecasted|posted",
        sortBy: "openDate|desc",
        rows: PER_PAGE,
        offset,
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
        console.log(`Grants.gov API returned ${res.status}: ${errorText.substring(0, 200)}`);
        if (allOpportunities.length > 0) {
          console.log(`[grants-gov] API error at offset ${offset}, proceeding with ${allOpportunities.length} results`);
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

      allOpportunities.push(...opportunities);
      offset += PER_PAGE;

      console.log(`[grants-gov] Fetched ${opportunities.length} at offset ${offset - PER_PAGE} (total: ${allOpportunities.length}/${hitCount})`);

      // Stop if we got fewer than requested (last page) or we have all hits
    } while (allOpportunities.length < hitCount && offset < hitCount);

    let upserted = 0;

    for (const opp of allOpportunities) {
      const oppId = opp.id ?? opp.opportunityId;
      if (!oppId) continue;

      const noticeId = `grants-gov-${oppId}`;
      const title = (opp as any).title ?? opp.opportunityTitle ?? "Untitled Grant";
      const agency = opp.agency ?? opp.agencyCode ?? "Unknown";
      const number = (opp as any).number ?? opp.opportunityNumber ?? String(oppId);
      const deadline = opp.closeDate ?? opp.closeDateStr ?? null;
      const value = opp.estimatedTotalFunding ?? opp.awardCeiling ?? null;

      // Parse dates from MM/DD/YYYY to YYYY-MM-DD
      const parseDate = (d: string | null | undefined): string | null => {
        if (!d) return null;
        const parts = d.split("/");
        if (parts.length === 3) return `${parts[2]}-${parts[0].padStart(2,"0")}-${parts[1].padStart(2,"0")}`;
        return d;
      };

      const { error } = await supabase.from("opportunities").upsert(
        {
          notice_id: noticeId,
          title,
          agency,
          solicitation_number: number,
          value_estimate: value,
          response_deadline: deadline ? parseDate(deadline) : null,
          posted_date: parseDate(opp.openDate ?? opp.openDateStr) ?? null,
          description: opp.description?.substring(0, 10000) ?? null,
          source: "grants_gov",
          source_url: `https://www.grants.gov/search-results-detail/${oppId}`,
        },
        { onConflict: "notice_id" }
      );

      if (!error) upserted++;
    }

    return {
      source: "grants_gov",
      status: "success",
      opportunities_found: allOpportunities.length,
      matches_created: upserted,
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
