import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Verbose matching run: surfaces the actual delete/insert errors that the
// production route swallows silently.
export async function POST(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}` && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const orgId = "bd7ab856-03da-4756-b77c-821e2f337b90";

  // Count before
  const beforeHead = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/opportunity_matches?organization_id=eq.${orgId}&is_demo=eq.false&select=id`,
    { method: "HEAD", headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, Prefer: "count=exact", Range: "0-0" } }
  );
  const beforeCount = parseInt(beforeHead.headers.get("content-range")?.split("/")[1] || "0");

  // Attempt delete
  const delStart = Date.now();
  const { error: delErr, count: deletedCount } = await supabase
    .from("opportunity_matches")
    .delete({ count: "exact" })
    .eq("organization_id", orgId)
    .eq("is_demo", false);
  const delMs = Date.now() - delStart;

  // Count after delete
  const afterDelHead = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/opportunity_matches?organization_id=eq.${orgId}&is_demo=eq.false&select=id`,
    { method: "HEAD", headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, Prefer: "count=exact", Range: "0-0" } }
  );
  const afterDelCount = parseInt(afterDelHead.headers.get("content-range")?.split("/")[1] || "0");

  // Try a test insert — dummy row
  const testOpp = await supabase
    .from("opportunities")
    .select("id")
    .eq("source", "sam_gov")
    .eq("status", "active")
    .limit(1)
    .single();

  let testInsertError: string | null = null;
  if (testOpp.data?.id) {
    const { error: insErr } = await supabase
      .from("opportunity_matches")
      .insert({
        organization_id: orgId,
        opportunity_id: testOpp.data.id,
        match_score: 99,
        bid_recommendation: "bid",
        recommendation_reasoning: "debug test",
        user_status: "new",
        is_demo: false,
      });
    if (insErr) testInsertError = insErr.message;
  }

  // Final count
  const finalHead = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/opportunity_matches?organization_id=eq.${orgId}&is_demo=eq.false&select=id`,
    { method: "HEAD", headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, Prefer: "count=exact", Range: "0-0" } }
  );
  const finalCount = parseInt(finalHead.headers.get("content-range")?.split("/")[1] || "0");

  return NextResponse.json({
    beforeCount,
    delete: { error: delErr?.message || null, count: deletedCount, durationMs: delMs },
    afterDeleteCount: afterDelCount,
    testOpportunityId: testOpp.data?.id,
    testInsertError,
    finalCount,
  });
}
