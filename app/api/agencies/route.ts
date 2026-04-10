import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/agencies?q=CISA → list (optionally filtered by name/acronym)
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim();
  const parentOnly = url.searchParams.get("parent_only") === "true";

  let query = supabase
    .from("agencies")
    .select(
      "id, name, acronym, parent_agency_id, description, website, total_obligations, active_opportunities",
    )
    .order("total_obligations", { ascending: false, nullsFirst: false });

  if (q) query = query.or(`name.ilike.%${q}%,acronym.ilike.%${q}%`);
  if (parentOnly) query = query.is("parent_agency_id", null);

  const { data, error } = await query.limit(50);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ agencies: data ?? [], count: data?.length ?? 0 });
}
