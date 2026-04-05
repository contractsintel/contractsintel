import { createClient } from "@/lib/supabase/server";

interface CalendarEvent {
  summary: string;
  description?: string;
  start: string; // ISO date string
  end?: string; // ISO date string
  location?: string;
}

async function getAccessToken(userId: string): Promise<string | null> {
  const supabase = await createClient();

  const { data: prefs } = await supabase
    .from("user_preferences")
    .select("google_calendar_access_token, google_calendar_refresh_token, google_calendar_token_expiry")
    .eq("user_id", userId)
    .single();

  if (!prefs?.google_calendar_refresh_token) return null;

  // Check if token is still valid
  const expiry = prefs.google_calendar_token_expiry
    ? new Date(prefs.google_calendar_token_expiry)
    : new Date(0);

  if (expiry > new Date(Date.now() + 60000) && prefs.google_calendar_access_token) {
    return prefs.google_calendar_access_token;
  }

  // Refresh the token
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CALENDAR_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CALENDAR_CLIENT_SECRET!,
      refresh_token: prefs.google_calendar_refresh_token,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    console.error("Failed to refresh Google token:", await res.text());
    return null;
  }

  const tokens = await res.json();

  // Update stored tokens
  await supabase
    .from("user_preferences")
    .update({
      google_calendar_access_token: tokens.access_token,
      google_calendar_token_expiry: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
    })
    .eq("user_id", userId);

  return tokens.access_token;
}

async function getOrgUserId(orgId: string): Promise<string | null> {
  const supabase = await createClient();

  // Get the first user for this org who has calendar connected
  const { data: users } = await supabase
    .from("users")
    .select("id")
    .eq("organization_id", orgId);

  if (!users || users.length === 0) return null;

  for (const u of users) {
    const { data: prefs } = await supabase
      .from("user_preferences")
      .select("google_calendar_connected")
      .eq("user_id", u.id)
      .eq("google_calendar_connected", true)
      .single();

    if (prefs) return u.id;
  }

  return null;
}

export async function pushDeadlineToCalendar(
  orgId: string,
  event: CalendarEvent
): Promise<string | null> {
  const userId = await getOrgUserId(orgId);
  if (!userId) return null;

  const accessToken = await getAccessToken(userId);
  if (!accessToken) return null;

  const endDate = event.end ?? event.start;

  const calendarEvent = {
    summary: event.summary,
    description: event.description ?? "",
    start: {
      date: event.start.split("T")[0],
    },
    end: {
      date: endDate.split("T")[0],
    },
    location: event.location,
    reminders: {
      useDefault: false,
      overrides: [
        { method: "email", minutes: 1440 }, // 1 day before
        { method: "popup", minutes: 60 }, // 1 hour before
      ],
    },
  };

  const res = await fetch(
    "https://www.googleapis.com/calendar/v3/calendars/primary/events",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(calendarEvent),
    }
  );

  if (!res.ok) {
    console.error("Failed to create calendar event:", await res.text());
    return null;
  }

  const created = await res.json();
  return created.id ?? null;
}

export async function removeDeadlineFromCalendar(
  orgId: string,
  eventId: string
): Promise<boolean> {
  const userId = await getOrgUserId(orgId);
  if (!userId) return false;

  const accessToken = await getAccessToken(userId);
  if (!accessToken) return false;

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  return res.ok || res.status === 404;
}
