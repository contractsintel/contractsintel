import { createClient } from "@/lib/supabase/server";
import { createClient as createAdmin } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { seedDemoData } from "@/lib/demo-data";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(`${origin}/login`);
  }

  const supabase = await createClient();
  const { data: sessionData, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !sessionData?.user) {
    return NextResponse.redirect(`${origin}/login`);
  }

  const user = sessionData.user;

  // Use service role client for admin operations (bypasses RLS)
  const admin = createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Check if this user already has an org (returning user vs new signup)
  const { data: existingUser } = await admin
    .from("users")
    .select("organization_id")
    .eq("auth_id", user.id)
    .single();

  if (existingUser?.organization_id) {
    // Returning user — just redirect
    // Check if they should go to get-started
    const { data: prefs } = await admin
      .from("user_preferences")
      .select("default_page")
      .eq("organization_id", existingUser.organization_id)
      .single();

    if (prefs?.default_page === "get-started") {
      return NextResponse.redirect(`${origin}/dashboard/get-started`);
    }
    return NextResponse.redirect(`${origin}/dashboard`);
  }

  // New user from Google OAuth — the DB trigger may have created the org,
  // but we need to wait for it and ensure everything is set up.
  // Poll up to 5 times (500ms apart) instead of a single long sleep.
  let orgId: string | null = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    await new Promise((r) => setTimeout(r, 500));
    const { data: userAfterTrigger } = await admin
      .from("users")
      .select("organization_id")
      .eq("auth_id", user.id)
      .single();
    if (userAfterTrigger?.organization_id) {
      orgId = userAfterTrigger.organization_id;
      break;
    }
  }

  if (!orgId) {
    // Trigger didn't fire or failed — create org manually
    const displayName = user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split("@")[0] || "My Company";

    const { data: newOrg } = await admin
      .from("organizations")
      .insert({
        name: displayName,
        subscription_status: "trialing",
        subscription_tier: "discovery",
        trial_ends_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .select("id")
      .single();

    orgId = newOrg?.id;

    if (orgId) {
      await admin.from("users").insert({
        auth_id: user.id,
        email: user.email!,
        organization_id: orgId,
        role: "owner",
      });
    }
  } else {
    // Trigger created org — update it with Google profile info and trial dates
    const displayName = user.user_metadata?.full_name || user.user_metadata?.name || null;
    await admin
      .from("organizations")
      .update({
        name: displayName || undefined,
        subscription_status: "trialing",
        trial_ends_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .eq("id", orgId);
  }

  if (orgId) {
    // Ensure user_preferences exists with get-started as default
    const { data: existingPrefs } = await admin
      .from("user_preferences")
      .select("id")
      .eq("organization_id", orgId)
      .single();

    if (!existingPrefs) {
      await admin.from("user_preferences").insert({
        organization_id: orgId,
        default_page: "get-started",
        onboarding_completed: false,
        tour_completed: false,
        checklist_account_created: true,
      });
    } else {
      await admin
        .from("user_preferences")
        .update({ default_page: "get-started" })
        .eq("organization_id", orgId);
    }

    // Seed demo data
    await seedDemoData(admin, orgId);
  }

  return NextResponse.redirect(`${origin}/dashboard/get-started`);
}
