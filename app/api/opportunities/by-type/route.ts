import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED = new Set(["contract", "grant", "sbir", "sttr"]);

// Map type param to source-based filters (fallback when opportunity_type column
// hasn't been migrated yet)
const SOURCE_FILTERS: Record<string, { sourcePattern?: string; titlePattern?: string }> = {
  grant: { sourcePattern: "grants" },
  sbir: { titlePattern: "SBIR" },
  sttr: { titlePattern: "STTR" },
  contract: {},
};

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
    const typeParam = url.searchParams.get("type") ?? "contract";
    if (!ALLOWED.has(typeParam)) {
      return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    }

    const limit = Math.min(Number(url.searchParams.get("limit") ?? "50"), 200);

    // Try with opportunity_type column first
    const primary = await supabase
      .from("opportunities")
      .select("*", { count: "exact" })
      .eq("opportunity_type", typeParam)
      .order("posted_date", { ascending: false })
      .limit(limit);

    if (!primary.error) {
      return NextResponse.json({
        type: typeParam,
        count: primary.count,
        opportunities: primary.data ?? [],
      });
    }

    // Fallback: opportunity_type column doesn't exist — filter by source/title
    const filter = SOURCE_FILTERS[typeParam] ?? {};
    let q = supabase
      .from("opportunities")
      .select("*", { count: "exact" })
      .order("posted_date", { ascending: false })
      .limit(limit);

    if (filter.sourcePattern) {
      q = q.ilike("source", `%${filter.sourcePattern}%`);
    } else if (filter.titlePattern) {
      q = q.or(
        `title.ilike.%${filter.titlePattern}%,solicitation_number.ilike.%${filter.titlePattern}%`,
      );
    } else {
      // "contract" fallback: exclude grants/sbir/sttr sources
      q = q
        .not("source", "ilike", "%grants%")
        .not("title", "ilike", "%SBIR%")
        .not("title", "ilike", "%STTR%");
    }

    const { data, error, count } = await q;
    if (error) {
      console.error("opportunities by-type fallback error:", error);
      return NextResponse.json({ error: "Query failed" }, { status: 500 });
    }

    return NextResponse.json({
      type: typeParam,
      count,
      opportunities: data ?? [],
    });
  } catch (err: unknown) {
    console.error("opportunities by-type error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    );
  }
}
