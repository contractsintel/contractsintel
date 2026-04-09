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

  // Distribution of contract_type values for active SAM
  const { data } = await supabase
    .from("opportunities")
    .select("contract_type")
    .eq("source", "sam_gov")
    .eq("status", "active")
    .limit(5000);

  const counts: Record<string, number> = {};
  for (const r of data || []) {
    const t = r.contract_type || "(null)";
    counts[t] = (counts[t] || 0) + 1;
  }

  // Top matches for Ralph — fetch their contract_types
  const orgId = "bd7ab856-03da-4756-b77c-821e2f337b90";
  const { data: topMatches } = await supabase
    .from("opportunity_matches")
    .select("match_score, opportunity_id, opportunities(title, contract_type, naics_code, set_aside_type)")
    .eq("organization_id", orgId)
    .eq("is_demo", false)
    .order("match_score", { ascending: false })
    .limit(15);

  return NextResponse.json({
    contractTypeDistribution: counts,
    ralphTop15: (topMatches || []).map((m: any) => ({
      score: m.match_score,
      title: (m.opportunities?.title || "").slice(0, 70),
      contract_type: m.opportunities?.contract_type,
      naics: m.opportunities?.naics_code,
      set_aside: m.opportunities?.set_aside_type,
    })),
  });
}
