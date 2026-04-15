import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/teaming/partners?naics=&set_aside=&state=&q=
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const naics = url.searchParams.get("naics")?.trim();
  const setAside = url.searchParams.get("set_aside")?.trim();
  const state = url.searchParams.get("state")?.trim();
  const q = url.searchParams.get("q")?.trim();
  const limit = Math.min(Number(url.searchParams.get("limit") ?? "50"), 200);

  let query = supabase
    .from("teaming_partners")
    .select(
      "id, name, uei, cage_code, website, summary, naics_codes, set_asides, state, city, capabilities, past_agencies, employee_range, contact_email",
    )
    .order("name")
    .limit(limit);

  // PostgREST array-contains via `.contains()` for NAICS and set-aside.
  if (naics) query = query.contains("naics_codes", [naics]);
  if (setAside) query = query.contains("set_asides", [setAside]);
  if (state) query = query.eq("state", state.toUpperCase());
  if (q) {
    const safe = q.replace(/[%,.()"'\\]/g, "").trim();
    if (safe) {
      // Use textSearch for GIN-indexed full-text search when available, fall back to ilike prefix match
      const tsQuery = safe.split(/\s+/).join(" & ");
      query = query.or(`name.ilike.${safe}%,summary.ilike.${safe}%`);
    }
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ partners: data ?? [], count: data?.length ?? 0 });
}
