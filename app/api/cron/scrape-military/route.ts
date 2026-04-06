import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { runScrapersByCategory } from "@/lib/scrapers";

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && process.env.NODE_ENV === "production") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const results = await runScrapersByCategory(supabase, "military");

    return NextResponse.json({
      success: true,
      category: "military",
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
    console.error("Scrape military error:", error);
    return NextResponse.json({ error: "Failed to run military scrapers" }, { status: 500 });
  }
}
