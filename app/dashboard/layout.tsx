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

  // PERF: Select only the columns needed instead of SELECT *
  const { data: profile } = await supabase
    .from("users")
    .select("id, auth_id, full_name, organization_id, role, created_at, organizations(id, name, uei, cage_code, certifications, naics_codes, keywords, entity_description, address, plan, subscription_status, subscription_tier, trial_ends_at, stripe_customer_id, created_at, onboarding_complete, has_seen_dashboard, setup_wizard_complete, min_contract_value, max_contract_value, service_states, serves_nationwide, preferred_agencies)")
    .eq("auth_id", authUser.id)
    .single();

  // Fallback: try profiles table if users table doesn't exist yet
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = profile as Record<string, any> | null;
  const rawOrg = p?.organizations ?? {
    id: p?.organization_id ?? authUser.id,
    name: p?.company_name ?? authUser.email?.split("@")[0] ?? "Company",
    uei: null,
    cage_code: null,
    certifications: p?.certifications ?? [],
    naics_codes: p?.naics_codes ?? [],
    address: null,
    plan: p?.plan ?? "discovery",
    subscription_status: p?.subscription_status ?? null,
    subscription_tier: p?.subscription_tier ?? "discovery",
    trial_ends_at: p?.trial_ends_at ?? null,
    stripe_customer_id: null,
    created_at: p?.created_at ?? new Date().toISOString(),
  };

  // Ensure plan field is set from subscription_tier (DB uses subscription_tier, UI uses plan)
  const org = {
    ...rawOrg,
    plan: rawOrg.subscription_tier ?? rawOrg.plan ?? "discovery",
  };

  const userProfile = {
    id: authUser.id,
    email: authUser.email ?? "",
    full_name: p?.full_name ?? authUser.user_metadata?.full_name ?? null,
    organization_id: org.id,
    role: p?.role ?? "owner",
    created_at: p?.created_at ?? new Date().toISOString(),
  };

  // P2.5: Soft onboarding nudge — show onboarding on FIRST visit only.
  // Users should never be locked out of the product. The onboarding page
  // has a "Skip for now" option and the ProfileBoostBanner on every page
  // continuously encourages profile completion.
  // Only redirect on the very first dashboard visit (no cookie set yet).
  if (
    org &&
    org.onboarding_complete !== true &&
    pathname === "/dashboard" &&
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
