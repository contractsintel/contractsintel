import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey, publicClient } from "@/lib/api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// G28: GET /api/v1/opportunities
// Read-only listing of opportunities scoped to the API key's organization.
// Filters: ?naics=, ?agency=, ?limit= (max 100), ?since= (ISO date).
export async function GET(request: NextRequest) {
  const auth = await authenticateApiKey(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const url = new URL(request.url);
  const naics = url.searchParams.get("naics");
  const agency = url.searchParams.get("agency");
  const since = url.searchParams.get("since");
  const limit = Math.min(Number(url.searchParams.get("limit") ?? "25"), 100);

  const client = publicClient();
  const now = new Date().toISOString();
  let q = client
    .from("opportunities")
    .select(
      "id, title, agency, naics_code, solicitation_number, posted_date, response_deadline, estimated_value, source, sam_url",
      { count: "exact" },
    )
    .or(`response_deadline.is.null,response_deadline.gte.${now}`)
    .order("posted_date", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (naics) q = q.eq("naics_code", naics);
  if (agency) q = q.ilike("agency", `%${agency.replace(/[%,.()"'\\]/g, "")}%`);
  if (since) q = q.gte("posted_date", since);

  const { data, error, count } = await q;
  if (error) {
    console.error("v1 opportunities error:", error);
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }
  return NextResponse.json({ count, opportunities: data ?? [] });
}
