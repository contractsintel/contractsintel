import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// One-shot recovery: undo the falsely-expired SAM contracts caused by the
// verifyExistingContracts() bug (no grace period). Re-marks any sam_gov rows
// as 'active' if their response_deadline is still in the future or within
// the last 7 days.
export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}` && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const cutoff = new Date(Date.now() - 7 * 86400000).toISOString();

  // Count first so we know what we're recovering
  const { count: beforeActive } = await supabase
    .from("opportunities")
    .select("id", { count: "exact", head: true })
    .eq("source", "sam_gov")
    .eq("status", "active");

  const { count: beforeExpired } = await supabase
    .from("opportunities")
    .select("id", { count: "exact", head: true })
    .eq("source", "sam_gov")
    .eq("status", "expired");

  // Recover: any sam_gov rows currently expired whose deadline is null OR
  // still within the 7-day grace window.
  const { data: recovered, error: recoverErr } = await supabase
    .from("opportunities")
    .update({ status: "active" })
    .eq("source", "sam_gov")
    .eq("status", "expired")
    .or(`response_deadline.is.null,response_deadline.gt.${cutoff}`)
    .select("id");

  if (recoverErr) {
    return NextResponse.json({ error: recoverErr.message }, { status: 500 });
  }

  const { count: afterActive } = await supabase
    .from("opportunities")
    .select("id", { count: "exact", head: true })
    .eq("source", "sam_gov")
    .eq("status", "active");

  return NextResponse.json({
    success: true,
    cutoff,
    before: { active: beforeActive, expired: beforeExpired },
    recovered: recovered?.length || 0,
    after: { active: afterActive },
  });
}
