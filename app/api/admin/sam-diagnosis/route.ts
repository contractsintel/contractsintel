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

  const now = new Date().toISOString();

  // Total counts by status
  const { count: total } = await supabase
    .from("opportunities").select("id", { count: "exact", head: true })
    .eq("source", "sam_gov");
  const { count: active } = await supabase
    .from("opportunities").select("id", { count: "exact", head: true })
    .eq("source", "sam_gov").eq("status", "active");
  const { count: expired } = await supabase
    .from("opportunities").select("id", { count: "exact", head: true })
    .eq("source", "sam_gov").eq("status", "expired");

  // Expired rows with null deadline
  const { count: expiredNullDeadline } = await supabase
    .from("opportunities").select("id", { count: "exact", head: true })
    .eq("source", "sam_gov").eq("status", "expired").is("response_deadline", null);

  // Expired rows with deadline in the future
  const { count: expiredFutureDeadline } = await supabase
    .from("opportunities").select("id", { count: "exact", head: true })
    .eq("source", "sam_gov").eq("status", "expired").gt("response_deadline", now);

  // Active rows
  const { data: activeSample } = await supabase
    .from("opportunities")
    .select("id, title, response_deadline, set_aside_type, naics_code, created_at, last_seen_at")
    .eq("source", "sam_gov").eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(5);

  // Expired rows — most recent deadlines
  const { data: expiredSample } = await supabase
    .from("opportunities")
    .select("id, title, response_deadline, set_aside_type, naics_code, created_at, last_seen_at")
    .eq("source", "sam_gov").eq("status", "expired")
    .order("response_deadline", { ascending: false, nullsFirst: false })
    .limit(5);

  // Most recent created_at across all SAM
  const { data: mostRecentAny } = await supabase
    .from("opportunities")
    .select("id, status, created_at, last_seen_at, response_deadline")
    .eq("source", "sam_gov")
    .order("created_at", { ascending: false })
    .limit(3);

  return NextResponse.json({
    now,
    counts: {
      total,
      active,
      expired,
      expiredWithNullDeadline: expiredNullDeadline,
      expiredWithFutureDeadline: expiredFutureDeadline,
    },
    activeSample,
    expiredSample,
    mostRecentAny,
  });
}
