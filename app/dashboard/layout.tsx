import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { DashboardProvider } from "./context";
import { Sidebar } from "./sidebar";
import { TopNav } from "./top-nav";
import { TourWrapper } from "./tour-wrapper";

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

  // Fetch user profile joined with organization
  const { data: profile } = await supabase
    .from("users")
    .select("*, organizations(*)")
    .eq("id", authUser.id)
    .single();

  // Fallback: try profiles table if users table doesn't exist yet
  const org = profile?.organizations ?? {
    id: profile?.organization_id ?? authUser.id,
    name: profile?.company_name ?? authUser.email?.split("@")[0] ?? "Company",
    uei: null,
    cage_code: null,
    certifications: profile?.certifications ?? [],
    naics_codes: profile?.naics_codes ?? [],
    address: null,
    plan: profile?.plan ?? "discovery",
    subscription_status: profile?.subscription_status ?? "trialing",
    subscription_tier: profile?.subscription_tier ?? "discovery",
    trial_ends_at: profile?.trial_ends_at ?? null,
    stripe_customer_id: null,
    created_at: profile?.created_at ?? new Date().toISOString(),
  };

  const userProfile = {
    id: authUser.id,
    email: authUser.email ?? "",
    full_name: profile?.full_name ?? authUser.user_metadata?.full_name ?? null,
    organization_id: org.id,
    role: profile?.role ?? "owner",
    created_at: profile?.created_at ?? new Date().toISOString(),
  };

  return (
    <DashboardProvider user={userProfile} organization={org}>
      <div className="min-h-screen bg-[#080a0f]">
        <TopNav companyName={org.name} userEmail={authUser.email ?? ""} userName={userProfile.full_name} />
        <div className="flex pt-16">
          <Sidebar plan={org.plan} />
          <main className="flex-1 ml-[220px] p-8">
            <div className="max-w-dashboard mx-auto">{children}</div>
          </main>
          <TourWrapper />
        </div>
      </div>
    </DashboardProvider>
  );
}
