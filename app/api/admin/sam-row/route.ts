import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Robust counts via direct PostgREST HEAD requests with count=exact header.
async function rawCount(url: string, key: string, params: string): Promise<number | null> {
  try {
    const r = await fetch(`${url}/rest/v1/opportunities?${params}`, {
      method: "HEAD",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Prefer: "count=exact",
        Range: "0-0",
      },
    });
    const cr = r.headers.get("content-range") || "";
    const total = cr.split("/")[1];
    return total && total !== "*" ? parseInt(total) : null;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}` && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  const [total, active, expired, activeWithNaics, activeWithSetAside, activeWithoutNaics, activeWithoutSetAside] = await Promise.all([
    rawCount(url, key, "source=eq.sam_gov&select=id"),
    rawCount(url, key, "source=eq.sam_gov&status=eq.active&select=id"),
    rawCount(url, key, "source=eq.sam_gov&status=eq.expired&select=id"),
    rawCount(url, key, "source=eq.sam_gov&status=eq.active&naics_code=not.is.null&select=id"),
    rawCount(url, key, "source=eq.sam_gov&status=eq.active&set_aside_type=not.is.null&select=id"),
    rawCount(url, key, "source=eq.sam_gov&status=eq.active&naics_code=is.null&select=id"),
    rawCount(url, key, "source=eq.sam_gov&status=eq.active&set_aside_type=is.null&select=id"),
  ]);

  // For the org we care about (Ralph), compute how many matches are possible
  const supabase = createClient(url, key);
  const { data: sampleNaics } = await supabase
    .from("opportunities")
    .select("naics_code")
    .eq("source", "sam_gov")
    .eq("status", "active")
    .not("naics_code", "is", null)
    .limit(100);

  return NextResponse.json({
    rawCounts: {
      total,
      active,
      expired,
      activeWithNaics,
      activeWithSetAside,
      activeWithoutNaics,
      activeWithoutSetAside,
    },
    sampleActiveNaicsCodes: Array.from(new Set((sampleNaics || []).map((r) => r.naics_code))).slice(0, 30),
  });
}
