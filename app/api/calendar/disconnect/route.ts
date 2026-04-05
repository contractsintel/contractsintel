import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Clear calendar tokens
    await supabase
      .from("user_preferences")
      .update({
        google_calendar_refresh_token: null,
        google_calendar_access_token: null,
        google_calendar_token_expiry: null,
        google_calendar_connected: false,
      })
      .eq("user_id", user.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Calendar disconnect error:", error);
    return NextResponse.json({ error: "Failed to disconnect calendar" }, { status: 500 });
  }
}
