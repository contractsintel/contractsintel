import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// G19: Full-text search inside solicitation body text (title + solicitation
// number + description + full_description + response_instructions). Reads the
// `solicitation_tsv` GIN index added by `20260410_g19_solicitation_fts.sql`.
//
// Usage: GET /api/opportunities/fts?q=zero+trust&limit=25
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
    const raw = (url.searchParams.get("q") ?? "").trim();
    if (!raw) {
      return NextResponse.json({ error: "Missing query" }, { status: 400 });
    }
    if (raw.length > 200) {
      return NextResponse.json({ error: "Query too long" }, { status: 400 });
    }
    const limit = Math.min(Number(url.searchParams.get("limit") ?? "25"), 100);

    // Build a `plainto_tsquery`-style PostgREST filter. PostgREST exposes
    // `fts(english).<term>` for to_tsquery and `plfts(english).<term>` for
    // plainto_tsquery — we use plfts so users can type natural keywords
    // without having to format & / | / ! operators themselves.
    const { data, error, count } = await supabase
      .from("opportunities")
      .select(
        "id, title, agency, naics_code, solicitation_number, response_deadline, posted_date, estimated_value, full_description, source",
        { count: "exact" },
      )
      .textSearch("solicitation_tsv", raw, { type: "plain", config: "english" })
      .or("status.is.null,and(status.neq.expired,status.neq.paused)")
      .order("posted_date", { ascending: false, nullsFirst: false })
      .limit(limit);

    if (error) {
      console.error("fts query error:", error);
      return NextResponse.json({ error: "Query failed" }, { status: 500 });
    }

    return NextResponse.json({ count, query: raw, opportunities: data ?? [] });
  } catch (err: any) {
    console.error("fts route error:", err);
    return NextResponse.json({ error: err?.message ?? "Internal error" }, { status: 500 });
  }
}
