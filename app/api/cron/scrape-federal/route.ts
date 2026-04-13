import { logger } from "@/lib/logger";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { runScrapersByCategory } from "@/lib/scrapers";

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const results = await runScrapersByCategory(supabase, "federal");

    const totalFound = results.reduce((s, r) => s + r.opportunities_found, 0);
    const totalMatches = results.reduce((s, r) => s + r.matches_created, 0);

    return NextResponse.json({
      success: true,
      category: "federal",
      scrapers_run: results.length,
      total_opportunities: totalFound,
      total_matches: totalMatches,
      details: results.map((r) => ({
        source: r.source,
        status: r.status,
        found: r.opportunities_found,
        matches: r.matches_created,
        error: r.error_message,
      })),
    });
  } catch (error) {
    logger.error("Scrape federal error", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "Failed to run federal scrapers" }, { status: 500 });
  }
}
