import type { SupabaseClient } from "@supabase/supabase-js";

export async function cleanupDemoData(
  supabase: SupabaseClient,
  orgId: string
): Promise<void> {
  // Delete in dependency order: children first, then parents

  // Delete demo invoices
  await supabase
    .from("invoices")
    .delete()
    .eq("organization_id", orgId)
    .eq("is_demo", true);

  // Delete demo contract milestones
  await supabase
    .from("contract_milestones")
    .delete()
    .eq("organization_id", orgId)
    .eq("is_demo", true);

  // Delete demo contracts
  await supabase
    .from("contracts")
    .delete()
    .eq("organization_id", orgId)
    .eq("is_demo", true);

  // Delete demo performance logs
  await supabase
    .from("performance_logs")
    .delete()
    .eq("organization_id", orgId)
    .eq("is_demo", true);

  // Delete demo past performance
  await supabase
    .from("past_performance")
    .delete()
    .eq("organization_id", orgId)
    .eq("is_demo", true);

  // Delete demo opportunity matches
  await supabase
    .from("opportunity_matches")
    .delete()
    .eq("organization_id", orgId)
    .eq("is_demo", true);

  // Delete demo opportunities (find via solicitation number prefix)
  await supabase
    .from("opportunities")
    .delete()
    .eq("is_demo", true);
}
