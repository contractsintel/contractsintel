import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}` && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Find Ralph's org
  const { data: orgs } = await supabase
    .from("organizations")
    .select("id, name, naics_codes, certifications, keywords, min_contract_value, max_contract_value, serves_nationwide")
    .or("name.ilike.%ralph%,name.ilike.%raphael%")
    .limit(5);

  if (!orgs || orgs.length === 0) {
    // Fallback: most recently-updated org
    const { data: recent } = await supabase
      .from("organizations")
      .select("id, name, naics_codes, certifications, keywords, min_contract_value, max_contract_value, serves_nationwide")
      .order("updated_at", { ascending: false })
      .limit(3);
    return NextResponse.json({ message: "No Ralph found; showing recent orgs", orgs: recent });
  }

  const org = orgs[0];

  // Match distribution
  const { data: matches } = await supabase
    .from("opportunity_matches")
    .select("match_score, bid_recommendation")
    .eq("organization_id", org.id)
    .eq("is_demo", false)
    .limit(5000);

  const buckets = { "90-100": 0, "80-89": 0, "70-79": 0, "60-69": 0, "50-59": 0, "40-49": 0, "<40": 0 };
  const recBuckets: Record<string, number> = {};
  for (const m of matches || []) {
    const s = m.match_score;
    if (s >= 90) buckets["90-100"]++;
    else if (s >= 80) buckets["80-89"]++;
    else if (s >= 70) buckets["70-79"]++;
    else if (s >= 60) buckets["60-69"]++;
    else if (s >= 50) buckets["50-59"]++;
    else if (s >= 40) buckets["40-49"]++;
    else buckets["<40"]++;
    recBuckets[m.bid_recommendation || "none"] = (recBuckets[m.bid_recommendation || "none"] || 0) + 1;
  }

  // Top 5 matches
  const { data: topMatches } = await supabase
    .from("opportunity_matches")
    .select("match_score, bid_recommendation, recommendation_reasoning, opportunity_id, opportunities(title, naics_code, set_aside_type, source)")
    .eq("organization_id", org.id)
    .eq("is_demo", false)
    .order("match_score", { ascending: false })
    .limit(5);

  return NextResponse.json({
    org,
    totalMatches: matches?.length || 0,
    scoreBuckets: buckets,
    recommendationBuckets: recBuckets,
    topMatches,
  });
}
