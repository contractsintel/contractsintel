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

  try {
    const { data: agency, error } = await supabase
      .from("agencies")
      .select("*")
      .eq("id", params.id)
      .single();

    if (error || !agency) {
      return NextResponse.json({ error: "Agency not found" }, { status: 404 });
    }

    // Parent (if any) + children
    const { data: children } = await supabase
      .from("agencies")
      .select("*")
      .eq("parent_agency_id", params.id)
      .order("name");

    let parent = null;
    if (agency.parent_agency_id) {
      const { data: p } = await supabase
        .from("agencies")
        .select("*")
        .eq("id", agency.parent_agency_id)
        .single();
      parent = p;
    }

    // Pull recent opportunities for this agency (match on name OR acronym)
    const searchNames = [agency.name, agency.acronym].filter(Boolean) as string[];
    const orClause = searchNames
      .map((n: string) => `agency.ilike.%${n.replace(/,/g, "")}%`)
      .join(",");
    const { data: recentOpps } = await supabase
      .from("opportunities")
      .select("*")
      .or(orClause)
      .order("posted_date", { ascending: false, nullsFirst: false })
      .limit(10);

    return NextResponse.json({
      agency,
      parent,
      children: children ?? [],
      recent_opportunities: recentOpps ?? [],
    });
  } catch (err: unknown) {
    console.error("agency detail error:", err);
    return NextResponse.json({ error: "Agency not found" }, { status: 404 });
  }
}
