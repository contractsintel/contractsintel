import type { ScraperResult } from "./index";

const GRANTS_GOV_API = "https://www.grants.gov/grantsws/rest/opportunities/search/";

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
    // Search for open grant opportunities
    const payload = {
      keyword: "",
      oppStatuses: "forecasted|posted",
      sortBy: "openDate|desc",
      rows: 100,
      offset: 0,
    };

    const res = await fetch(GRANTS_GOV_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      // Grants.gov API can be unreliable; handle gracefully
      const errorText = await res.text().catch(() => "unknown");
      console.log(`Grants.gov API returned ${res.status}: ${errorText.substring(0, 200)}`);
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
    const opportunities: GrantsGovOpportunity[] =
      data.oppHits ?? data.opportunities ?? data.opportunitiesData ?? [];

    let upserted = 0;

    for (const opp of opportunities) {
      const oppId = opp.opportunityId ?? opp.id;
      if (!oppId) continue;

      const noticeId = `grants-gov-${oppId}`;
      const title = opp.opportunityTitle ?? "Untitled Grant";
      const agency = opp.agency ?? opp.agencyCode ?? "Unknown";
      const deadline = opp.closeDateStr ?? opp.closeDate ?? null;
      const value = opp.estimatedTotalFunding ?? opp.awardCeiling ?? null;

      const { error } = await supabase.from("opportunities").upsert(
        {
          notice_id: noticeId,
          title,
          agency,
          solicitation_number: opp.opportunityNumber ?? String(oppId),
          estimated_value: value,
          response_deadline: deadline,
          posted_date: opp.openDateStr ?? opp.openDate ?? null,
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
      opportunities_found: opportunities.length,
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
