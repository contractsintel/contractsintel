import type { ScraperResult } from "./index";

const SAM_ENDPOINTS = [
  "https://api.sam.gov/opportunities/v2/search",
  "https://api.sam.gov/prod/opportunities/v2/search",
];

interface SamOpportunity {
  noticeId: string;
  title: string;
  solicitationNumber?: string;
  department?: string;
  subtier?: string;
  office?: string;
  postedDate?: string;
  type?: string;
  baseType?: string;
  setAside?: string;
  setAsideDescription?: string;
  responseDeadLine?: string;
  naicsCode?: string;
  placeOfPerformance?: { city?: { name?: string }; state?: { code?: string } };
  description?: string;
  uiLink?: string;
  award?: { amount?: number };
}

function getToday(): string {
  const d = new Date();
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`;
}

function getDateDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`;
}

async function fetchFromSam(endpoint: string, apiKey: string): Promise<SamOpportunity[]> {
  const params = new URLSearchParams({
    api_key: apiKey,
    postedFrom: getDateDaysAgo(7),
    postedTo: getToday(),
    limit: "1000",
    offset: "0",
  });

  const res = await fetch(`${endpoint}?${params.toString()}`, {
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    throw new Error(`SAM API returned ${res.status}`);
  }

  const data = await res.json();
  return data.opportunitiesData ?? data.opportunities ?? [];
}

export async function scrapeSamGov(supabase: any): Promise<ScraperResult> {
  const startedAt = new Date().toISOString();
  const apiKey = process.env.SAM_API_KEY;

  if (!apiKey) {
    return {
      source: "sam_gov",
      status: "error",
      opportunities_found: 0,
      matches_created: 0,
      error_message: "SAM_API_KEY not configured",
      started_at: startedAt,
      completed_at: new Date().toISOString(),
    };
  }

  let opportunities: SamOpportunity[] = [];
  let lastError: Error | null = null;

  for (const endpoint of SAM_ENDPOINTS) {
    try {
      opportunities = await fetchFromSam(endpoint, apiKey);
      break;
    } catch (err) {
      lastError = err as Error;
      continue;
    }
  }

  if (opportunities.length === 0) {
    console.log("SAM.gov API returned 0 opportunities:", lastError?.message);
    return {
      source: "sam_gov",
      status: "success",
      opportunities_found: 0,
      matches_created: 0,
      error_message: lastError?.message ?? "API returned 0 results",
      started_at: startedAt,
      completed_at: new Date().toISOString(),
    };
  }

  let upserted = 0;

  for (const opp of opportunities) {
    const agency = [opp.department, opp.subtier, opp.office].filter(Boolean).join(" / ");
    const pop = opp.placeOfPerformance;
    const placeStr = pop ? [pop.city?.name, pop.state?.code].filter(Boolean).join(", ") : null;

    const { error } = await supabase.from("opportunities").upsert(
      {
        notice_id: opp.noticeId,
        title: opp.title ?? "Untitled",
        agency: agency || "Unknown",
        solicitation_number: opp.solicitationNumber ?? null,
        set_aside: opp.setAsideDescription ?? opp.setAside ?? null,
        naics_code: opp.naicsCode ?? null,
        place_of_performance: placeStr,
        estimated_value: opp.award?.amount ?? null,
        response_deadline: opp.responseDeadLine ?? null,
        posted_date: opp.postedDate ?? null,
        description: opp.description?.substring(0, 10000) ?? null,
        sam_url: opp.uiLink ?? null,
        source: "sam_gov",
        source_url: opp.uiLink ?? null,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "notice_id" }
    );

    if (!error) upserted++;
  }

  return {
    source: "sam_gov",
    status: "success",
    opportunities_found: opportunities.length,
    matches_created: upserted,
    started_at: startedAt,
    completed_at: new Date().toISOString(),
  };
}
