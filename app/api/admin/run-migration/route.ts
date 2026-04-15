import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 min for backfill on 168k rows

// Temporary endpoint to apply the solicitation_tsv migration.
// DELETE THIS FILE after running once.
export async function GET(request: NextRequest) {
  // One-time migration key — endpoint will be deleted after use
  const key = request.nextUrl.searchParams.get("key");
  if (key !== "tsv-migrate-20260415") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { db: { schema: "public" } }
  );

  const results: { step: string; status: string; error?: string }[] = [];

  // Step 1: Add solicitation_tsv column if it doesn't exist
  const { error: e1 } = await supabase.rpc("exec_sql", {
    query: "ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS solicitation_tsv tsvector",
  });
  if (e1) {
    // If exec_sql doesn't exist, try raw SQL via pg
    results.push({ step: "add_column", status: "rpc_unavailable", error: e1.message });
    return NextResponse.json({
      message: "exec_sql RPC not available. Run this SQL in Supabase SQL Editor:",
      sql: [
        "ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS solicitation_tsv tsvector;",
        "",
        "CREATE OR REPLACE FUNCTION opportunities_solicitation_tsv_refresh() RETURNS trigger AS $$ BEGIN NEW.solicitation_tsv := setweight(to_tsvector('english', coalesce(NEW.title, '')), 'A') || setweight(to_tsvector('english', coalesce(NEW.solicitation_number, '')), 'A') || setweight(to_tsvector('english', coalesce(NEW.agency, '')), 'A') || setweight(to_tsvector('english', coalesce(NEW.description, '')), 'B') || setweight(to_tsvector('english', coalesce(NEW.full_description, '')), 'B') || setweight(to_tsvector('english', coalesce(NEW.response_instructions, '')), 'C'); RETURN NEW; END; $$ LANGUAGE plpgsql;",
        "",
        "DROP TRIGGER IF EXISTS opportunities_solicitation_tsv_trigger ON opportunities;",
        "CREATE TRIGGER opportunities_solicitation_tsv_trigger BEFORE INSERT OR UPDATE OF title, solicitation_number, agency, description, full_description, response_instructions ON opportunities FOR EACH ROW EXECUTE FUNCTION opportunities_solicitation_tsv_refresh();",
        "",
        "CREATE INDEX IF NOT EXISTS idx_opportunities_solicitation_tsv ON opportunities USING GIN (solicitation_tsv);",
        "",
        "UPDATE opportunities SET solicitation_tsv = setweight(to_tsvector('english', coalesce(title, '')), 'A') || setweight(to_tsvector('english', coalesce(solicitation_number, '')), 'A') || setweight(to_tsvector('english', coalesce(agency, '')), 'A') || setweight(to_tsvector('english', coalesce(description, '')), 'B') || setweight(to_tsvector('english', coalesce(full_description, '')), 'B') || setweight(to_tsvector('english', coalesce(response_instructions, '')), 'C') WHERE solicitation_tsv IS NULL;",
      ],
      results,
    });
  }
  results.push({ step: "add_column", status: "ok" });

  // Step 2: Create/replace the trigger function
  const { error: e2 } = await supabase.rpc("exec_sql", {
    query: `CREATE OR REPLACE FUNCTION opportunities_solicitation_tsv_refresh() RETURNS trigger AS $$ BEGIN NEW.solicitation_tsv := setweight(to_tsvector('english', coalesce(NEW.title, '')), 'A') || setweight(to_tsvector('english', coalesce(NEW.solicitation_number, '')), 'A') || setweight(to_tsvector('english', coalesce(NEW.agency, '')), 'A') || setweight(to_tsvector('english', coalesce(NEW.description, '')), 'B') || setweight(to_tsvector('english', coalesce(NEW.full_description, '')), 'B') || setweight(to_tsvector('english', coalesce(NEW.response_instructions, '')), 'C'); RETURN NEW; END; $$ LANGUAGE plpgsql`,
  });
  results.push({ step: "create_function", status: e2 ? "error" : "ok", error: e2?.message });

  // Step 3: Create trigger
  const { error: e3a } = await supabase.rpc("exec_sql", {
    query: "DROP TRIGGER IF EXISTS opportunities_solicitation_tsv_trigger ON opportunities",
  });
  const { error: e3b } = await supabase.rpc("exec_sql", {
    query: "CREATE TRIGGER opportunities_solicitation_tsv_trigger BEFORE INSERT OR UPDATE OF title, solicitation_number, agency, description, full_description, response_instructions ON opportunities FOR EACH ROW EXECUTE FUNCTION opportunities_solicitation_tsv_refresh()",
  });
  results.push({ step: "create_trigger", status: e3b ? "error" : "ok", error: e3b?.message });

  // Step 4: Create GIN index
  const { error: e4 } = await supabase.rpc("exec_sql", {
    query: "CREATE INDEX IF NOT EXISTS idx_opportunities_solicitation_tsv ON opportunities USING GIN (solicitation_tsv)",
  });
  results.push({ step: "create_index", status: e4 ? "error" : "ok", error: e4?.message });

  // Step 5: Backfill in batches of 5000
  let totalUpdated = 0;
  let batchNum = 0;
  while (batchNum < 100) {
    const { error: e5, data } = await supabase.rpc("exec_sql", {
      query: `UPDATE opportunities SET solicitation_tsv = setweight(to_tsvector('english', coalesce(title, '')), 'A') || setweight(to_tsvector('english', coalesce(solicitation_number, '')), 'A') || setweight(to_tsvector('english', coalesce(agency, '')), 'A') || setweight(to_tsvector('english', coalesce(description, '')), 'B') || setweight(to_tsvector('english', coalesce(full_description, '')), 'B') || setweight(to_tsvector('english', coalesce(response_instructions, '')), 'C') WHERE id IN (SELECT id FROM opportunities WHERE solicitation_tsv IS NULL LIMIT 5000)`,
    });
    if (e5) {
      results.push({ step: `backfill_batch_${batchNum}`, status: "error", error: e5.message });
      break;
    }
    batchNum++;
    totalUpdated += 5000;
    // Check if any rows remain
    const { data: remaining } = await supabase
      .from("opportunities")
      .select("id", { count: "exact", head: true })
      .is("solicitation_tsv", null);
    if (!remaining || (remaining as any) === 0) break;
  }
  results.push({ step: "backfill", status: "ok", error: `~${totalUpdated} rows processed in ${batchNum} batches` });

  return NextResponse.json({ message: "Migration complete", results });
}
