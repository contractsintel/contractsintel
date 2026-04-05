import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const code = request.nextUrl.searchParams.get("code");
    const state = request.nextUrl.searchParams.get("state");

    if (!code || !state) {
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL ?? "https://app.contractsintel.com"}/dashboard/settings?error=missing_params`
      );
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user || user.id !== state) {
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL ?? "https://app.contractsintel.com"}/login`
      );
    }

    // Exchange code for tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CALENDAR_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CALENDAR_CLIENT_SECRET!,
        redirect_uri: process.env.GOOGLE_CALENDAR_REDIRECT_URI!,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      console.error("Token exchange failed:", await tokenRes.text());
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL ?? "https://app.contractsintel.com"}/dashboard/settings?error=token_exchange`
      );
    }

    const tokens = await tokenRes.json();

    // Store refresh token in user_preferences
    await supabase
      .from("user_preferences")
      .upsert({
        user_id: user.id,
        google_calendar_refresh_token: tokens.refresh_token ?? null,
        google_calendar_access_token: tokens.access_token,
        google_calendar_token_expiry: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
        google_calendar_connected: true,
      }, { onConflict: "user_id" });

    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL ?? "https://app.contractsintel.com"}/dashboard/settings?calendar=connected`
    );
  } catch (error) {
    console.error("Calendar callback error:", error);
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL ?? "https://app.contractsintel.com"}/dashboard/settings?error=callback_failed`
    );
  }
}
