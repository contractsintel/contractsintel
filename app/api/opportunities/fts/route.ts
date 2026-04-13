import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// G19: Full-text search inside solicitation body text (title + solicitation
// number + description + full_description + response_instructions).
//
// Primary: uses `solicitation_tsv` GIN index if available.
// Fallback: ilike search on title + description if the tsv column hasn't been
// migrated yet (production may not have it).
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

    const fields =
      "id, title, agency, naics_code, solicitation_number, response_deadline, posted_date, estimated_value, full_description, source";

    // Try FTS first (requires solicitation_tsv column)
    let data: any[] | null = null;
    let count: number | null = null;
    let error: any = null;

    const ftsResult = await supabase
      .from("opportunities")
      .select(fields, { count: "exact" })
      .textSearch("solicitation_tsv", raw, { type: "plain", config: "english" })
      .or("status.is.null,and(status.neq.expired,status.neq.paused)")
      .order("posted_date", { ascending: false, nullsFirst: false })
      .limit(limit);

    if (ftsResult.error?.message?.includes("does not exist")) {
      // Fallback: ilike search on title + description
      const keywords = raw
        .split(/\s+/)
        .map((w) => w.replace(/[%,.()"'\\]/g, ""))
        .filter((w) => w.length >= 2)
        .slice(0, 5);

      if (keywords.length === 0) {
        return NextResponse.json({
          count: 0,
          query: raw,
          opportunities: [],
        });
      }

      const filters = keywords
        .map((kw) => `title.ilike.%${kw}%,description.ilike.%${kw}%`)
        .join(",");

      const fallbackResult = await supabase
        .from("opportunities")
        .select(fields, { count: "exact" })
        .or(filters)
        .or("status.is.null,and(status.neq.expired,status.neq.paused)")
        .order("posted_date", { ascending: false, nullsFirst: false })
        .limit(limit);

      data = fallbackResult.data;
      count = fallbackResult.count;
      error = fallbackResult.error;
    } else {
      data = ftsResult.data;
      count = ftsResult.count;
      error = ftsResult.error;
    }

    if (error) {
      console.error("fts query error:", error);
      return NextResponse.json({ error: "Query failed" }, { status: 500 });
    }

    return NextResponse.json({ count, query: raw, opportunities: data ?? [] });
  } catch (err: any) {
    console.error("fts route error:", err);
    return NextResponse.json(
      { error: err?.message ?? "Internal error" },
      { status: 500 },
    );
  }
}
