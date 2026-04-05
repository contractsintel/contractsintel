import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID;
    const redirectUri = process.env.GOOGLE_CALENDAR_REDIRECT_URI;

    if (!clientId || !redirectUri) {
      return NextResponse.json({ error: "Google Calendar not configured" }, { status: 500 });
    }

    const scopes = [
      "https://www.googleapis.com/auth/calendar.events",
    ];

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: scopes.join(" "),
      access_type: "offline",
      prompt: "consent",
      state: user.id,
    });

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

    return NextResponse.redirect(authUrl);
  } catch (error) {
    console.error("Calendar connect error:", error);
    return NextResponse.json({ error: "Failed to initiate calendar connection" }, { status: 500 });
  }
}
