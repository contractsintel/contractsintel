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

  // How many active SAM rows have populated naics_code?
  const { count: activeTotal } = await supabase
    .from("opportunities").select("id", { count: "exact", head: true })
    .eq("source", "sam_gov").eq("status", "active");
  const { count: activeWithNaics } = await supabase
    .from("opportunities").select("id", { count: "exact", head: true })
    .eq("source", "sam_gov").eq("status", "active").not("naics_code", "is", null);
  const { count: activeWithSetAside } = await supabase
    .from("opportunities").select("id", { count: "exact", head: true })
    .eq("source", "sam_gov").eq("status", "active").not("set_aside_type", "is", null);
  const { count: activeSetAsideEmpty } = await supabase
    .from("opportunities").select("id", { count: "exact", head: true })
    .eq("source", "sam_gov").eq("status", "active").eq("set_aside_type", "");
  const { count: expiredWithNaics } = await supabase
    .from("opportunities").select("id", { count: "exact", head: true })
    .eq("source", "sam_gov").eq("status", "expired").not("naics_code", "is", null);

  // Try every other status value
  const { data: statusSample } = await supabase
    .from("opportunities")
    .select("status")
    .eq("source", "sam_gov")
    .limit(1000);
  const statusCounts: Record<string, number> = {};
  for (const r of statusSample || []) {
    statusCounts[r.status || "null"] = (statusCounts[r.status || "null"] || 0) + 1;
  }

  // Active samples with non-null naics (if any)
  const { data: goodSamples } = await supabase
    .from("opportunities")
    .select("id, title, naics_code, set_aside_type, response_deadline, last_seen_at")
    .eq("source", "sam_gov")
    .eq("status", "active")
    .not("naics_code", "is", null)
    .order("last_seen_at", { ascending: false })
    .limit(3);

  return NextResponse.json({
    counts: {
      activeTotal,
      activeWithNaics,
      activeWithSetAside,
      activeSetAsideEmpty,
      expiredWithNaics,
    },
    statusCountsInFirst1000: statusCounts,
    activeGoodSamples: goodSamples,
  });
}
