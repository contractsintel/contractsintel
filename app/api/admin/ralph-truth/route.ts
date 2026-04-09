import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Ground-truth diagnostic: fetch ALL Ralph's matches and bucket in JS.
// The HEAD count=exact path has been unreliable (Postgres planner returning
// estimates on unindexed score filters).
export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}` && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const orgId = "bd7ab856-03da-4756-b77c-821e2f337b90";
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  // Page through all rows explicitly with Range headers to bypass the
  // default 1000-row cap.
  const all: any[] = [];
  let offset = 0;
  while (true) {
    const r = await fetch(
      `${url}/rest/v1/opportunity_matches?organization_id=eq.${orgId}&is_demo=eq.false&select=match_score,bid_recommendation,recommendation_reasoning,opportunity_id,opportunities(title,naics_code,set_aside_type,source)&order=match_score.desc`,
      {
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          Range: `${offset}-${offset + 999}`,
          "Range-Unit": "items",
        },
      }
    );
    const batch = await r.json();
    if (!Array.isArray(batch) || batch.length === 0) break;
    all.push(...batch);
    if (batch.length < 1000) break;
    offset += 1000;
    if (offset > 10000) break; // safety
  }

  const buckets = { "90-100": 0, "80-89": 0, "70-79": 0, "60-69": 0, "50-59": 0, "40-49": 0, "<40": 0 };
  for (const m of all) {
    const s = m.match_score;
    if (s >= 90) buckets["90-100"]++;
    else if (s >= 80) buckets["80-89"]++;
    else if (s >= 70) buckets["70-79"]++;
    else if (s >= 60) buckets["60-69"]++;
    else if (s >= 50) buckets["50-59"]++;
    else if (s >= 40) buckets["40-49"]++;
    else buckets["<40"]++;
  }

  return NextResponse.json({
    total: all.length,
    scoreBuckets: buckets,
    top15: all.slice(0, 15).map((m) => ({
      score: m.match_score,
      rec: m.bid_recommendation,
      naics: m.opportunities?.naics_code,
      set_aside: m.opportunities?.set_aside_type,
      title: (m.opportunities?.title || "").slice(0, 70),
      reasoning: m.recommendation_reasoning,
    })),
  });
}
