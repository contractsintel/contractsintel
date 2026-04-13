import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("contracting_officers")
    .select("*")
    .eq("agency_id", params.id)
    .order("name");

  if (error) {
    // Table may not exist yet — return empty instead of 500
    console.error("contracting_officers query error:", error.message);
    return NextResponse.json({
      contracting_officers: [],
      count: 0,
    });
  }

  return NextResponse.json({
    contracting_officers: data ?? [],
    count: data?.length ?? 0,
  });
}
