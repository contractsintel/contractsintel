import type { ScraperResult } from "./index";

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

  const res = await fetch(`${SAM_INTERNAL_API}?${params}`, {
    headers: {
      Accept: "application/json",
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

export async function scrapeSamGov(supabase: any): Promise<ScraperResult> {
  const startedAt = new Date().toISOString();

  try {
    const PAGE_SIZE = 100;
    const MAX_PAGES = 500;
    let totalSaved = 0;
    let totalElements = 0;
    let page = 0;

    while (page < MAX_PAGES) {
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

      console.log(`[sam-gov] Page ${page}: ${results.length} results, ${totalSaved} saved (${totalElements} total active)`);
      page++;
      if (results.length < PAGE_SIZE) break;
      await new Promise((resolve) => setTimeout(resolve, 500));
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
