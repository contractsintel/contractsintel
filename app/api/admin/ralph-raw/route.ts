import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

async function rawCount(url: string, key: string, params: string): Promise<number | null> {
  const r = await fetch(`${url}/rest/v1/opportunity_matches?${params}`, {
    method: "HEAD",
    headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: "count=exact", Range: "0-0" },
  });
  const cr = r.headers.get("content-range") || "";
  return cr.split("/")[1] && cr.split("/")[1] !== "*" ? parseInt(cr.split("/")[1]) : null;
}

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}` && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const orgId = "bd7ab856-03da-4756-b77c-821e2f337b90";

  const [all, demo, real, score70, score80, score90] = await Promise.all([
    rawCount(url, key, `organization_id=eq.${orgId}&select=id`),
    rawCount(url, key, `organization_id=eq.${orgId}&is_demo=eq.true&select=id`),
    rawCount(url, key, `organization_id=eq.${orgId}&is_demo=eq.false&select=id`),
    rawCount(url, key, `organization_id=eq.${orgId}&is_demo=eq.false&match_score=gte.70&select=id`),
    rawCount(url, key, `organization_id=eq.${orgId}&is_demo=eq.false&match_score=gte.80&select=id`),
    rawCount(url, key, `organization_id=eq.${orgId}&is_demo=eq.false&match_score=gte.90&select=id`),
  ]);

  // Top 10 via direct REST
  const topR = await fetch(
    `${url}/rest/v1/opportunity_matches?organization_id=eq.${orgId}&is_demo=eq.false&order=match_score.desc&limit=10&select=match_score,bid_recommendation,recommendation_reasoning,opportunities(title,naics_code,set_aside_type)`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } }
  );
  const top = await topR.json();

  return NextResponse.json({
    counts: { all, demo, real, score70plus: score70, score80plus: score80, score90plus: score90 },
    top10: top,
  });
}
