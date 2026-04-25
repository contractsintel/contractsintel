import { logger } from "@/lib/logger";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { runScrapersByCategory } from "@/lib/scrapers";

// Vercel cron default function timeout is 60s. The "states" category contains
// scrapeBidNetDirect which iterates 50+ states sequentially with a 500ms
// inter-state delay (~75s minimum) plus the per-state HTTP work — this
// blew through the 60s budget every single tick after a 2026-04-15 deploy
// shifted the loop ordering. The route was being killed before scraper_runs
// rows could be written, so the failure was invisible. PR 3's health-check
// (cron_coverage) surfaced it via the post-2026-04-15 silence.
//
// Vercel Pro plan permits up to 300s on cron functions via maxDuration.
// Setting it to 300s gives headroom for the full 50-state loop and any
// transient slowness without making the route hang indefinitely.
export const maxDuration = 300;

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

    const results = await runScrapersByCategory(supabase, "states");

    return NextResponse.json({
      success: true,
      category: "states",
      scrapers_run: results.length,
      total_opportunities: results.reduce((s, r) => s + r.opportunities_found, 0),
      details: results.map((r) => ({
        source: r.source,
        status: r.status,
        found: r.opportunities_found,
        error: r.error_message,
      })),
    });
  } catch (error) {
    logger.error("Scrape states error", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "Failed to run state scrapers" }, { status: 500 });
  }
}
