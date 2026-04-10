import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey, publicClient } from "@/lib/api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// G28: GET /api/v1/opportunities/[id]
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await authenticateApiKey(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const client = publicClient();
  const { data, error } = await client
    .from("opportunities")
    .select(
      "id, title, agency, department, naics_code, solicitation_number, posted_date, response_deadline, estimated_value, place_of_performance, full_description, description, source, sam_url, source_url",
    )
    .eq("id", params.id)
    .maybeSingle();

  if (error) {
    console.error("v1 opportunity error:", error);
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ opportunity: data });
}
