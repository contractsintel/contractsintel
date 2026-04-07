import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}` && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const indexes = [
    "CREATE INDEX IF NOT EXISTS idx_opportunities_source ON opportunities(source)",
    "CREATE INDEX IF NOT EXISTS idx_opportunities_naics ON opportunities(naics_code)",
    "CREATE INDEX IF NOT EXISTS idx_opportunities_deadline ON opportunities(response_deadline)",
    "CREATE INDEX IF NOT EXISTS idx_opportunities_created ON opportunities(created_at)",
    "CREATE INDEX IF NOT EXISTS idx_opportunities_value ON opportunities(value_estimate)",
    "CREATE INDEX IF NOT EXISTS idx_opportunities_last_seen ON opportunities(last_seen_at)",
    "CREATE INDEX IF NOT EXISTS idx_opportunities_notice_id ON opportunities(notice_id)",
    "CREATE INDEX IF NOT EXISTS idx_matches_org_score ON opportunity_matches(organization_id, match_score DESC)",
    "CREATE INDEX IF NOT EXISTS idx_matches_status ON opportunity_matches(user_status)",
    "CREATE INDEX IF NOT EXISTS idx_matches_demo ON opportunity_matches(is_demo)",
  ];

  const results = [];

  for (const sql of indexes) {
    try {
      const { error } = await supabase.rpc("exec_sql", { query: sql });
      if (error) {
        // Try via raw pg if rpc not available
        results.push({ sql: sql.substring(0, 80), status: "rpc_unavailable", error: error.message });
      } else {
        results.push({ sql: sql.substring(0, 80), status: "ok" });
      }
    } catch (e) {
      results.push({ sql: sql.substring(0, 80), status: "error", error: String(e) });
    }
  }

  return NextResponse.json({
    message: "Index creation attempted. If RPC is unavailable, run these in the Supabase SQL Editor:",
    indexes: indexes,
    results,
  });
}
