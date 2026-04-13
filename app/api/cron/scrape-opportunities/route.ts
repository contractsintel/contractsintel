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
    let lastError: Error | null = null;

    // Try both endpoints
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
      console.log("SAM API returned 0 opportunities (API may be down):", lastError?.message);
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
          const matches = unmatched.map((o: any) => ({
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
        const orgIds = Array.from(new Set(orgsWithDemo.map((r: any) => r.organization_id)));
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
    console.error("Scrape opportunities error:", error);
    return NextResponse.json({ error: "Failed to scrape opportunities" }, { status: 500 });
  }
}
