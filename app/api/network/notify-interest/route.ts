import { createClient } from "@supabase/supabase-js";
import { createClient as createAuthClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";

export const dynamic = "force-dynamic";

// P3.2: Notify the poster of a teaming opportunity when someone expresses
// interest. Best-effort — silently no-ops if Resend isn't configured so
// the dashboard interaction never blocks on email delivery.
export async function POST(request: NextRequest) {
  try {
    // Require authentication
    const authSupabase = await createAuthClient();
    const { data: { user } } = await authSupabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { teaming_opportunity_id } = await request.json();
    if (!teaming_opportunity_id) {
      return NextResponse.json({ error: "teaming_opportunity_id required" }, { status: 400 });
    }

    const resendApiKey = process.env.RESEND_API_KEY;
    if (!resendApiKey) {
      // No-op success — feature gate is silent on purpose
      return NextResponse.json({ ok: true, skipped: "RESEND_API_KEY not configured" });
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Look up the teaming opportunity + poster's contact email
    const { data: opp } = await supabaseAdmin
      .from("teaming_opportunities")
      .select("id, title, organization_id, organizations(name)")
      .eq("id", teaming_opportunity_id)
      .single();

    if (!opp) return NextResponse.json({ error: "not found" }, { status: 404 });

    // Find an owner user for the posting org
    const { data: posterUser } = await supabaseAdmin
      .from("users")
      .select("email, full_name")
      .eq("organization_id", opp.organization_id)
      .limit(1)
      .single();

    if (!posterUser?.email) {
      return NextResponse.json({ ok: true, skipped: "no poster email on file" });
    }

    const resend = new Resend(resendApiKey);
    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || "ContractsIntel <noreply@contractsintel.com>",
      to: posterUser.email,
      subject: `New interest in your teaming post: ${opp.title}`,
      text: `Hi ${posterUser.full_name || "there"},

A ContractsIntel member just expressed interest in your teaming opportunity:

  ${opp.title}

Sign in to ContractsIntel to review the interested party and start the conversation.

— ContractsIntel`,
    });

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    console.error("[notify-interest] error", e instanceof Error ? e.message : "Unknown error");
    // Soft-fail so the dashboard interaction never breaks
    return NextResponse.json({ ok: true, error: "delivery failed" });
  }
}
