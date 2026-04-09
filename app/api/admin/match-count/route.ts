import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}` && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const orgId = "bd7ab856-03da-4756-b77c-821e2f337b90";

  // Exact count via Prefer: count=exact
  const r1 = await fetch(
    `${url}/rest/v1/opportunity_matches?organization_id=eq.${orgId}&is_demo=eq.false&select=id`,
    { method: "HEAD", headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: "count=exact", Range: "0-0" } }
  );
  const totalCount = parseInt(r1.headers.get("content-range")?.split("/")[1] || "0");

  // Fetch all matches paged via Range, check for award synopsis
  const allRows: any[] = [];
  let offset = 0;
  while (offset < 5000) {
    const r = await fetch(
      `${url}/rest/v1/opportunity_matches?organization_id=eq.${orgId}&is_demo=eq.false&select=id,match_score,opportunity_id,opportunities(id,title)`,
      { headers: { apikey: key, Authorization: `Bearer ${key}`, Range: `${offset}-${offset + 999}` } }
    );
    const batch = await r.json();
    if (!Array.isArray(batch) || batch.length === 0) break;
    allRows.push(...batch);
    if (batch.length < 1000) break;
    offset += 1000;
  }

  const synopsisMatches = allRows.filter(r => (r.opportunities?.title || "").toLowerCase().includes("award synopsis"));

  // Also search specifically for the known "bad" opp id
  const targetOppId = "af2a0b51-d102-453e-bed0-d8e253762f53";
  const r2 = await fetch(
    `${url}/rest/v1/opportunity_matches?organization_id=eq.${orgId}&opportunity_id=eq.${targetOppId}&select=id,match_score,created_at,organization_id,is_demo,opportunity_id`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } }
  );
  const targetMatchRows = await r2.json();

  return NextResponse.json({
    totalCount,
    fetchedViaRange: allRows.length,
    synopsisMatchesFound: synopsisMatches.length,
    synopsisDetails: synopsisMatches.map(m => ({
      match_id: m.id,
      score: m.match_score,
      opp_id: m.opportunity_id,
      title: m.opportunities?.title?.slice(0, 100),
    })),
    targetOppDirectQuery: targetMatchRows,
  });
}
