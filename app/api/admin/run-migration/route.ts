import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Temporary endpoint — calls backfill_solicitation_tsv() in batches.
// The column, trigger, index, and function were already created via CLI.
// DELETE THIS FILE after backfill completes.
export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get("key");
  if (key !== "tsv-migrate-20260415") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const batchSize = 2000;
  const maxBatches = 120; // 120 * 2000 = 240k max
  let totalUpdated = 0;
  const errors: string[] = [];

  for (let i = 0; i < maxBatches; i++) {
    const { data, error } = await supabase.rpc("backfill_solicitation_tsv", {
      batch_size: batchSize,
    });
    if (error) {
      errors.push(`batch ${i}: ${error.message}`);
      break;
    }
    const count = typeof data === "number" ? data : 0;
    totalUpdated += count;
    if (count < batchSize) break; // done
  }

  // Check remaining
  const { count: remaining } = await supabase
    .from("opportunities")
    .select("id", { count: "exact", head: true })
    .is("solicitation_tsv", null);

  return NextResponse.json({
    totalUpdated,
    remaining: remaining ?? "unknown",
    errors: errors.length ? errors : undefined,
  });
}
