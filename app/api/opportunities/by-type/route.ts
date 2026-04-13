import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED = new Set(["contract", "grant", "sbir", "sttr"]);

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { data: userRecord } = await supabase
      .from("users")
      .select("organization_id")
      .eq("auth_id", user.id)
      .single();
    if (!userRecord?.organization_id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const typeParam = url.searchParams.get("type") ?? "contract";
    if (!ALLOWED.has(typeParam)) {
      return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    }

    const limit = Math.min(Number(url.searchParams.get("limit") ?? "50"), 200);

    const { data, error, count } = await supabase
      .from("opportunities")
      .select(
        "id, title, agency, source, naics_code, opportunity_type, set_aside_type, response_deadline, posted_date, estimated_value, sam_url, source_url, full_description",
        { count: "exact" },
      )
      .eq("opportunity_type", typeParam)
      .order("posted_date", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("opportunities by-type error:", error);
      return NextResponse.json({ error: "Query failed" }, { status: 500 });
    }

    return NextResponse.json({ type: typeParam, count, opportunities: data ?? [] });
  } catch (err: unknown) {
    console.error("opportunities by-type error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Internal error" }, { status: 500 });
  }
}
