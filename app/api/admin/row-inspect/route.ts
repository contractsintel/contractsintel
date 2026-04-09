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

  // Find ALL rows with "award synopsis" in title (any status)
  const { data: allRows } = await supabase
    .from("opportunities")
    .select("id, title, source, status, naics_code, set_aside_type, contract_type")
    .ilike("title", "%award synopsis%")
    .limit(20);

  // Check which of Ralph's matches have award-synopsis titles
  const orgId = "bd7ab856-03da-4756-b77c-821e2f337b90";
  const { data: ralphMatches } = await supabase
    .from("opportunity_matches")
    .select("match_score, opportunity_id, opportunities(id, title, source, status, naics_code, set_aside_type, contract_type)")
    .eq("organization_id", orgId)
    .eq("is_demo", false)
    .order("match_score", { ascending: false })
    .limit(20);

  const synopsisMatches = (ralphMatches || []).filter((m: any) =>
    (m.opportunities?.title || "").toLowerCase().includes("award synopsis")
  );

  return NextResponse.json({
    totalAwardSynopsisRowsInOpportunities: allRows?.length || 0,
    allAwardSynopsisRows: allRows,
    ralphTop20: (ralphMatches || []).map((m: any) => ({
      score: m.match_score,
      opp_id: m.opportunities?.id,
      title: m.opportunities?.title?.slice(0, 80),
      status: m.opportunities?.status,
      source: m.opportunities?.source,
    })),
    synopsisMatchesInRalphTop20: synopsisMatches.map((m: any) => ({
      score: m.match_score,
      opp_id: m.opportunities?.id,
      title: m.opportunities?.title,
      status: m.opportunities?.status,
      source: m.opportunities?.source,
      contract_type: m.opportunities?.contract_type,
    })),
  });
}
