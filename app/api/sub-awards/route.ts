import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const naics = url.searchParams.get("naics");
    const agency = url.searchParams.get("agency");
    const limit = Math.min(Number(url.searchParams.get("limit") ?? "50"), 200);

    let q = supabase
      .from("sub_awards")
      .select(
        "id, prime_award_id, prime_contractor, sub_vendor, sub_uei, agency, naics_code, description, value, awarded_at, source, source_url",
        { count: "exact" },
      )
      .order("awarded_at", { ascending: false })
      .limit(limit);

    if (naics) q = q.eq("naics_code", naics);
    if (agency) q = q.ilike("agency", `%${agency.replace(/[%,.()"'\\]/g, "")}%`);

    const { data, error, count } = await q;
    if (error) {
      console.error("sub-awards query error:", error);
      return NextResponse.json({ error: "Query failed" }, { status: 500 });
    }

    return NextResponse.json({ count, sub_awards: data ?? [] });
  } catch (err: any) {
    console.error("sub-awards route error:", err);
    return NextResponse.json({ error: err?.message ?? "Internal error" }, { status: 500 });
  }
}
