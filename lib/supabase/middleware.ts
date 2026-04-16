import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Race a promise against a timeout so a hung Supabase call can't
// blow past Vercel's edge-middleware budget and produce a 504
// MIDDLEWARE_INVOCATION_TIMEOUT for every user on the site.
function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve(fallback);
      }
    }, ms);
    p.then(
      (v) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(v);
        }
      },
      () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(fallback);
        }
      }
    );
  });
}

export async function updateSession(request: NextRequest) {
  // Surface the pathname to server components via a custom request header.
  // The dashboard layout reads this to safely guard the onboarding flow
  // without depending on the client.
  request.headers.set("x-pathname", request.nextUrl.pathname);

  let supabaseResponse = NextResponse.next({ request });

  // Wrap the whole middleware in try/catch so an unexpected throw never
  // takes the edge worker down — we'd rather serve the page unauthenticated
  // than return a 504 to every visitor.
  try {
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

    // 3s cap — if auth server is slow we give up and treat as anonymous.
    // The Server Component layer does its own auth check, so a false "no user"
    // just means we skip the middleware redirect logic this round-trip.
    const authResult = await withTimeout(
      supabase.auth.getUser() as Promise<{ data: { user: any } | null; error: any }>,
      3000,
      { data: { user: null }, error: null }
    );
    const user = authResult?.data?.user ?? null;

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
        // 2s cap — if the DB is slow we skip the subscription gate for this
        // request. The page's own data fetch will handle enforcement.
        // Wrap the Supabase query builder in Promise.resolve() — the builder
        // is thenable but not a proper Promise, which tsc rejects.
        const queryPromise: Promise<any> = Promise.resolve(
          supabase
            .from("users")
            .select("organization_id, organizations(subscription_status, trial_ends_at)")
            .eq("auth_id", user.id)
            .single()
        );
        const userRecResult: any = await withTimeout(
          queryPromise,
          2000,
          { data: null, error: null }
        );

        org = (userRecResult?.data as Record<string, any> | null)
          ?.organizations as Record<string, any> | undefined;

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
  } catch (err) {
    // Never let a middleware throw bubble up to a 500/504.
    console.error("[middleware] swallowed error:", err);
  }

  return supabaseResponse;
}
