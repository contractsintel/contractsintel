import { logger } from "@/lib/logger";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdmin } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { cleanupDemoData } from "@/lib/demo-cleanup";

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
  pointOfContact?: Array<{ fullName?: string; email?: string }>;
}

// SAM pagination: limit is capped at 1000 per page. On high-volume days SAM
// posts well above 1000 opportunities in a 7-day window, so a single page
// silently truncates results. We loop until the returned page is smaller than
// the limit (meaning we've consumed all available results), with a hard safety
// cap on pages to prevent runaway quota burn.
const SAM_PAGE_SIZE = 1000;
const SAM_MAX_PAGES = 10; // 10,000 opportunities per tick — more than any real window

interface FetchResult {
  opps: SamOpportunity[];
  hitCap: boolean;         // true iff we exited due to SAM_MAX_PAGES, not short-page
  postedFrom: string;
  postedTo: string;
  lastPageSize: number;
}

async function fetchFromSam(endpoint: string, apiKey: string): Promise<FetchResult> {
  const all: SamOpportunity[] = [];
  const postedFrom = getDateDaysAgo(7);
  const postedTo = getToday();
  let hitCap = false;
  let lastPageSize = 0;

  for (let page = 0; page < SAM_MAX_PAGES; page++) {
    const params = new URLSearchParams({
      api_key: apiKey,
      postedFrom,
      postedTo,
      limit: String(SAM_PAGE_SIZE),
      offset: String(page * SAM_PAGE_SIZE),
    });

    const res = await fetch(`${endpoint}?${params.toString()}`, {
      headers: { Accept: "application/json" },
    });

    if (!res.ok) {
      // Don't keep paging once we're throttled or erroring — conserves quota.
      throw new Error(`SAM API returned ${res.status} on page ${page}`);
    }

    const data = await res.json();
    const batch: SamOpportunity[] = data.opportunitiesData ?? data.opportunities ?? [];
    all.push(...batch);
    lastPageSize = batch.length;

    // Short page = end of results.
    if (batch.length < SAM_PAGE_SIZE) break;

    // Last iteration completed a full page — we're exiting on the cap, not
    // because we drained. Raise the truncation flag so the caller can alert.
    if (page === SAM_MAX_PAGES - 1) hitCap = true;
  }

  return { opps: all, hitCap, postedFrom, postedTo, lastPageSize };
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

export async function GET(request: NextRequest) {
  try {
    // Verify cron secret for Vercel
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const apiKey = process.env.SAM_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "SAM_API_KEY not configured" }, { status: 500 });
    }

    let opportunities: SamOpportunity[] = [];
    let fetchMeta: FetchResult | null = null;
    let lastError: Error | null = null;

    // Try both endpoints
    for (const endpoint of SAM_ENDPOINTS) {
      try {
        const r = await fetchFromSam(endpoint, apiKey);
        opportunities = r.opps;
        fetchMeta = r;
        break;
      } catch (err) {
        lastError = err as Error;
        continue;
      }
    }

    // Pagination-cap alert: loop exited because page === SAM_MAX_PAGES - 1
    // with a full last page, not because of short-page drain. Surface so we
    // can raise the cap if real-world windows start exceeding it.
    if (fetchMeta?.hitCap) {
      const adminForAlert = createAdmin(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );
      await adminForAlert.from("cron_alerts").insert({
        severity: "warn",
        source: "sam-pagination-cap-hit",
        message: `SAM pagination hit MAX_PAGES=${SAM_MAX_PAGES} cap, possible silent truncation. postedFrom=${fetchMeta.postedFrom} postedTo=${fetchMeta.postedTo}`,
        context: {
          postedFrom: fetchMeta.postedFrom,
          postedTo: fetchMeta.postedTo,
          total_ingested: opportunities.length,
          last_page_size: fetchMeta.lastPageSize,
          max_pages: SAM_MAX_PAGES,
          page_size: SAM_PAGE_SIZE,
          route: "scrape-opportunities",
        },
      });
    }

    if (opportunities.length === 0) {
      logger.info("SAM API returned 0 opportunities (API may be down)", { error: lastError?.message });
      // Even when SAM is down, run matching against existing unmatched opportunities
      const adminClient = createAdmin(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );
      const { data: orgs } = await adminClient.from("organizations").select("id, naics_codes").neq("naics_codes", "{}");
      let matchesCreated = 0;
      for (const org of orgs || []) {
        if (!org.naics_codes?.length) continue;
        const { data: unmatched } = await adminClient
          .from("opportunities")
          .select("id, naics_code, title, agency")
          .in("naics_code", org.naics_codes)
          .not("id", "in", `(SELECT opportunity_id FROM opportunity_matches WHERE organization_id = '${org.id}')`)
          .limit(50);
        if (unmatched?.length) {
          const matches = unmatched.map((o: Record<string, any>) => ({
            organization_id: org.id,
            opportunity_id: o.id,
            match_score: 60 + Math.floor(Math.random() * 30),
            bid_recommendation: "monitor",
            recommendation_reasoning: `NAICS ${o.naics_code} matches your profile. Review ${o.title} from ${o.agency}.`,
            user_status: "new",
            is_demo: false,
          }));
          const { error } = await adminClient.from("opportunity_matches").upsert(matches, { onConflict: "organization_id,opportunity_id" });
          if (!error) matchesCreated += matches.length;
        }
      }
      return NextResponse.json({
        success: true,
        sam_status: "unavailable",
        details: lastError?.message || "API returned 0 opportunities",
        existing_matches_created: matchesCreated,
      });
    }

    const supabase = await createClient();
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
        },
        { onConflict: "notice_id" }
      );

      if (!error) upserted++;
    }

    // Clean up demo data for all orgs that now have real matches
    if (upserted > 0) {
      const adminClient = createAdmin(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );
      const { data: orgsWithDemo } = await adminClient
        .from("opportunity_matches")
        .select("organization_id")
        .eq("is_demo", true);

      if (orgsWithDemo?.length) {
        const orgIds = Array.from(new Set(orgsWithDemo.map((r: Record<string, any>) => r.organization_id)));
        for (const orgId of orgIds) {
          await cleanupDemoData(adminClient, orgId as string);
        }
      }
    }

    return NextResponse.json({
      success: true,
      fetched: opportunities.length,
      upserted,
    });
  } catch (error) {
    logger.error("Scrape opportunities error", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "Failed to scrape opportunities" }, { status: 500 });
  }
}
