import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function trunc(s: string | null | undefined, n = 200): string {
  if (!s) return "";
  return s.length > n ? s.slice(0, n) + "…" : s;
}

async function logTrap(request: NextRequest): Promise<void> {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return;
    const supabase = createClient(url, key, { auth: { persistSession: false } });
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const ua = trunc(request.headers.get("user-agent"), 200);
    const referer = trunc(request.headers.get("referer"), 200);
    const uei = request.nextUrl.searchParams.get("uei");
    const path = request.nextUrl.pathname + request.nextUrl.search;
    const ts = new Date().toISOString();
    await supabase.from("cron_alerts").insert({
      severity: "info",
      source: "audit-killswitch-trap",
      message: `audit request trapped: ip=${ip} ua=${trunc(ua, 80)}`,
      context: { ip, ua, referer, uei_param: uei, path, timestamp: ts },
    });
  } catch {
    // Swallow — never let logging break the killswitch response.
  }
}

export async function GET(request: NextRequest) {
  await logTrap(request);
  return NextResponse.json(
    { error: "Service temporarily unavailable", retry_after: "24h", code: "audit_disabled" },
    {
      status: 503,
      headers: { "Retry-After": "86400", "Cache-Control": "no-store" },
    },
  );
}
