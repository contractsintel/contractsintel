import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { headers, cookies } from "next/headers";
import { DashboardProvider } from "./context";
import { Sidebar } from "./sidebar";
import { TopNav } from "./top-nav";
import { TourWrapper } from "./tour-wrapper";
import { CopilotPanel } from "./copilot-panel";
import { DocumentChatPanel } from "./document-chat-panel";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) redirect("/login");

  // P2.5: Server-side onboarding redirect with cookie-based loop break.
  // Pathname comes from x-pathname header set by middleware.ts. The
  // ci_onboarding_checked cookie expires after 60s and prevents
  // redirect loops if the header is missing for any reason.
  const headerStore = await headers();
  const cookieStore = await cookies();
  const pathname = headerStore.get("x-pathname") ?? "";
  const onboardingChecked = cookieStore.get("ci_onboarding_checked")?.value === "1";

  // Fetch user profile joined with organization
  const { data: profile } = await supabase
    .from("users")
    .select("*, organizations(*)")
    .eq("auth_id", authUser.id)
    .single();

  // Fallback: try profiles table if users table doesn't exist yet
  const rawOrg = profile?.organizations ?? {
    id: profile?.organization_id ?? authUser.id,
    name: profile?.company_name ?? authUser.email?.split("@")[0] ?? "Company",
    uei: null,
    cage_code: null,
    certifications: profile?.certifications ?? [],
    naics_codes: profile?.naics_codes ?? [],
    address: null,
    plan: profile?.plan ?? "discovery",
    subscription_status: profile?.subscription_status ?? null,
    subscription_tier: profile?.subscription_tier ?? "discovery",
    trial_ends_at: profile?.trial_ends_at ?? null,
    stripe_customer_id: null,
    created_at: profile?.created_at ?? new Date().toISOString(),
  };

  // Ensure plan field is set from subscription_tier (DB uses subscription_tier, UI uses plan)
  const org = {
    ...rawOrg,
    plan: rawOrg.subscription_tier ?? rawOrg.plan ?? "discovery",
  };

  const userProfile = {
    id: authUser.id,
    email: authUser.email ?? "",
    full_name: profile?.full_name ?? authUser.user_metadata?.full_name ?? null,
    organization_id: org.id,
    role: profile?.role ?? "owner",
    created_at: profile?.created_at ?? new Date().toISOString(),
  };

  // P2.5: Redirect users with incomplete onboarding to the wizard, unless
  // they're already on a /dashboard/onboarding route OR the loop-break
  // cookie says we just checked. Treat null as incomplete.
  // NOTE: Cookie writes are NOT allowed in Server Components (layout).
  // The loop-break cookie is now set by the middleware redirect instead.
  if (
    org &&
    org.onboarding_complete !== true &&
    pathname &&
    !pathname.startsWith("/dashboard/onboarding") &&
    !pathname.startsWith("/dashboard/get-started") &&
    !onboardingChecked
  ) {
    redirect("/dashboard/onboarding");
  }

  return (
    <DashboardProvider user={userProfile} organization={org}>
      <div className="min-h-screen bg-[#f8f9fb]">
        <TopNav
          companyName={org.name || ""}
          userEmail={authUser.email ?? ""}
          userName={userProfile.full_name || null}
          plan={org.plan}
        />
        <div className="flex pt-16">
          <div className="hidden lg:block">
            <Sidebar plan={org.plan} />
          </div>
          <main className="flex-1 lg:ml-[240px] p-4 sm:p-6 lg:p-8">
            <div className="max-w-dashboard mx-auto">{children}</div>
          </main>
          <TourWrapper />
        </div>
        <DocumentChatPanel />
        <CopilotPanel />
      </div>
    </DashboardProvider>
  );
}
