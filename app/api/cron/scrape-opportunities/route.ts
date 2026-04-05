import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

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
    postedFrom: getDateDaysAgo(1),
    postedTo: getToday(),
    limit: "100",
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
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && process.env.NODE_ENV === "production") {
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

    if (opportunities.length === 0 && lastError) {
      console.error("All SAM endpoints failed:", lastError);
      return NextResponse.json({ error: "SAM API unavailable", details: lastError.message }, { status: 502 });
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
