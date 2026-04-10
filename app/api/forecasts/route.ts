import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  listForecasts,
  generateForecastsFromPastPerformance,
} from "@/lib/forecast";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    const agency = url.searchParams.get("agency") ?? undefined;
    const naics = url.searchParams.get("naics") ?? undefined;
    const monthsOut = url.searchParams.get("months_out");
    const limit = url.searchParams.get("limit");

    const rows = await listForecasts({
      agency: agency || undefined,
      naics: naics || undefined,
      months_out: monthsOut ? Number(monthsOut) : undefined,
      limit: limit ? Number(limit) : undefined,
    });

    return NextResponse.json({ forecasts: rows, count: rows.length });
  } catch (err) {
    console.error("forecasts GET error", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  // POST triggers on-demand projection from the caller's past_performance.
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { data: userRecord } = await supabase
      .from("users")
      .select("organization_id")
      .eq("auth_id", user.id)
      .single();
    if (!userRecord?.organization_id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const inserted = await generateForecastsFromPastPerformance(
      userRecord.organization_id,
    );
    return NextResponse.json({ ok: true, inserted });
  } catch (err) {
    console.error("forecasts POST error", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
