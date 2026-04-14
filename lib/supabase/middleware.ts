import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  // Surface the pathname to server components via a custom request header.
  // The dashboard layout reads this to safely guard the onboarding flow
  // without depending on the client.
  request.headers.set("x-pathname", request.nextUrl.pathname);

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  // Not logged in — redirect to login
  if (!user && pathname.startsWith("/dashboard")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Logged in + on dashboard — run subscription checks
  // PERF: Cache the subscription check in a short-lived cookie (60s) to avoid
  // hitting the DB on every single navigation. The cookie stores the status and
  // trial_ends_at so we only query once per minute.
  if (user && pathname.startsWith("/dashboard")) {
    let org: Record<string, any> | undefined;
    const cached = request.cookies.get("ci_sub_cache")?.value;
    if (cached) {
      try { org = JSON.parse(cached); } catch { /* re-query */ }
    }

    if (!org) {
      const { data: userRec } = await supabase
        .from("users")
        .select("organization_id, organizations(subscription_status, trial_ends_at)")
        .eq("auth_id", user.id)
        .single();

      org = (userRec as Record<string, any> | null)?.organizations as Record<string, any> | undefined;

      // Cache for 60 seconds
      if (org) {
        supabaseResponse.cookies.set("ci_sub_cache", JSON.stringify({
          subscription_status: org.subscription_status,
          trial_ends_at: org.trial_ends_at,
        }), { maxAge: 60, path: "/", httpOnly: true });
      }
    }

    if (org) {
      const status = org.subscription_status;

      // Trial expired — redirect to /expired
      if (status === "trialing" && org.trial_ends_at) {
        const trialEnd = new Date(org.trial_ends_at);
        if (trialEnd < new Date()) {
          const url = request.nextUrl.clone();
          url.pathname = "/expired";
          return NextResponse.redirect(url);
        }
      }

      // Cancelled — block immediately
      if (status === "cancelled") {
        const url = request.nextUrl.clone();
        url.pathname = "/expired";
        return NextResponse.redirect(url);
      }
    }

    // P2.5 onboarding loop-break: set a cookie so the dashboard layout's
    // onboarding redirect doesn't infinite-loop (the layout reads the cookie
    // but CANNOT write cookies because it's a Server Component).
    if (pathname.startsWith("/dashboard/onboarding")) {
      supabaseResponse.cookies.set("ci_onboarding_checked", "1", {
        maxAge: 60,
        path: "/",
      });
    }
  }

  return supabaseResponse;
}
