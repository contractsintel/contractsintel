import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  try {
    // Rate limit by IP to prevent lead-table flooding (5 per minute)
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const rl = rateLimit(`leads:${ip}`, 5, 60_000);
    if (!rl.allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const { email, uei, company_name, audit_score } = await request.json();

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const supabase = await createClient();

    const { error } = await supabase.from("leads").insert({
      email,
      uei: uei ?? null,
      company_name: company_name ?? null,
      audit_score: audit_score ?? null,
      source: "audit",
      created_at: new Date().toISOString(),
    });

    if (error) {
      console.error("Lead save error:", error);
      // Don't expose internal errors to client
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Lead API error:", error);
    return NextResponse.json({ error: "Failed to save lead" }, { status: 500 });
  }
}
