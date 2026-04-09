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

  // Logged in + on dashboard — run checks
  if (user && pathname.startsWith("/dashboard")) {
    const { data: userRec } = await supabase
      .from("users")
      .select("organization_id, organizations(subscription_status, trial_ends_at)")
      .eq("auth_id", user.id)
      .single();

    const org = (userRec as any)?.organizations;
    const orgId = userRec?.organization_id;

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

    // Get-started redirect removed from middleware to prevent navigation issues.
    // The auth callback handles first-login redirect to /dashboard/get-started.
    // Users can freely click Dashboard in the sidebar to see the main dashboard.
  }

  return supabaseResponse;
}
