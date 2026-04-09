import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// One-shot recovery: undo the falsely-expired SAM contracts caused by the
// verifyExistingContracts() bug (no grace period). Re-marks any sam_gov rows
// as 'active' if their response_deadline is still in the future or within
// the last 7 days. Batched to avoid Postgres statement timeout.
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
  const startTime = Date.now();
  const TIME_BUDGET_MS = 50000; // leave margin before the 60s max
  const BATCH = 500;

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

  let totalRecovered = 0;
  let iterations = 0;
  let done = false;
  let lastError: string | null = null;

  while (!done && Date.now() - startTime < TIME_BUDGET_MS) {
    iterations++;

    // Fetch a batch of IDs that match the recovery criteria
    const { data: ids, error: selErr } = await supabase
      .from("opportunities")
      .select("id")
      .eq("source", "sam_gov")
      .eq("status", "expired")
      .or(`response_deadline.is.null,response_deadline.gt.${cutoff}`)
      .limit(BATCH);

    if (selErr) {
      lastError = selErr.message;
      break;
    }

    if (!ids || ids.length === 0) {
      done = true;
      break;
    }

    const idList = ids.map((r) => r.id);
    const { error: updErr } = await supabase
      .from("opportunities")
      .update({ status: "active" })
      .in("id", idList);

    if (updErr) {
      lastError = updErr.message;
      break;
    }

    totalRecovered += idList.length;

    if (ids.length < BATCH) {
      done = true;
    }
  }

  const { count: afterActive } = await supabase
    .from("opportunities")
    .select("id", { count: "exact", head: true })
    .eq("source", "sam_gov")
    .eq("status", "active");

  return NextResponse.json({
    success: !lastError,
    done,
    cutoff,
    iterations,
    recovered: totalRecovered,
    before: { active: beforeActive, expired: beforeExpired },
    after: { active: afterActive },
    elapsedMs: Date.now() - startTime,
    error: lastError,
  });
}
