import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey, publicClient } from "@/lib/api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// G28: GET /api/v1/matches
// Returns the API key tenant's opportunity_matches with the joined opportunity.
export async function GET(request: NextRequest) {
  const auth = await authenticateApiKey(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const url = new URL(request.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? "25"), 100);
  const minScore = Number(url.searchParams.get("min_score") ?? "0");

  const client = publicClient();
  const { data, error, count } = await client
    .from("opportunity_matches")
    .select(
      "id, match_score, pipeline_stage, user_status, created_at, opportunities(*)",
      { count: "estimated" },
    )
    .eq("organization_id", auth.ctx.organizationId)
    .gte("match_score", minScore)
    .order("match_score", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error) {
    console.error("v1 matches error:", error);
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }
  // Filter out past-deadline opportunities
  const now = new Date().toISOString();
  const active = (data ?? []).filter((m: Record<string, any>) => {
    const dl = m.opportunities?.response_deadline;
    return !dl || dl >= now;
  });
  return NextResponse.json({ count: active.length, matches: active });
}
