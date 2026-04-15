import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Fast search endpoint using search_opportunities() RPC (GIN-indexed, ~100ms).
// GET /api/opportunities/search?q=cybersecurity&limit=50&offset=0
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
    const q = (url.searchParams.get("q") ?? "").trim();
    if (!q) {
      return NextResponse.json({ error: "Missing query" }, { status: 400 });
    }
    const limit = Math.min(Number(url.searchParams.get("limit") ?? "50"), 100);
    const offset = Math.max(Number(url.searchParams.get("offset") ?? "0"), 0);
    const stateParam = url.searchParams.get("state");
    const sourceParam = url.searchParams.get("source");
    const sourceLikeParam = url.searchParams.get("source_like");
    const sourceInParam = url.searchParams.get("source_in");

    // If filters are present, use a filtered query instead of the RPC
    const hasFilters = stateParam || sourceParam || sourceLikeParam || sourceInParam;

    if (hasFilters) {
      let query = supabase
        .from("opportunities")
        .select("id,title,agency,source,estimated_value,response_deadline,naics_code,set_aside_type,place_of_performance,solicitation_number,description,posted_date,sam_url,source_url,created_at", { count: "estimated" })
        .or(`title.ilike.%${q}%,agency.ilike.%${q}%,solicitation_number.ilike.%${q}%,description.ilike.%${q}%`);

      if (stateParam) query = query.eq("source", `state_${stateParam}`);
      else if (sourceParam) query = query.eq("source", sourceParam);

      if (sourceLikeParam) query = query.like("source", sourceLikeParam);
      if (sourceInParam) query = query.in("source", sourceInParam.split(","));

      query = query.order("created_at", { ascending: false }).range(offset, offset + limit - 1);
      const { data, error, count } = await query;

      if (error) {
        console.error("filtered search error:", error);
        return NextResponse.json({ error: "Search failed" }, { status: 500 });
      }
      return NextResponse.json({ results: data ?? [], count: count ?? (data?.length ?? 0), query: q });
    }

    const { data, error } = await supabase.rpc("search_opportunities", {
      search_query: q,
      row_limit: limit,
      row_offset: offset,
    });

    if (error) {
      console.error("search RPC error:", error);
      return NextResponse.json({ error: "Search failed" }, { status: 500 });
    }

    return NextResponse.json({
      results: data ?? [],
      count: (data?.length ?? 0) >= limit ? offset + limit + 1 : offset + (data?.length ?? 0),
      query: q,
    });
  } catch (err: unknown) {
    console.error("search route error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    );
  }
}
