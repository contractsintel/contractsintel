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
