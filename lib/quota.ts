import type { SupabaseClient } from "@supabase/supabase-js";

// G24: Per-organization daily search quota.
// Free tier: 5 / day. Discovery and above: unlimited.

export const FREE_TIER = "free";
export const FREE_DAILY_QUOTA = 5;

export type QuotaResult = {
  allowed: boolean;
  limit: number | null; // null = unlimited
  used: number;
  remaining: number | null;
  reset_at: string | null;
  tier: string;
};

function nextUtcMidnight(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0));
}

export async function checkAndConsumeSearchQuota(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<QuotaResult> {
  const { data: org, error } = await supabase
    .from("organizations")
    .select("subscription_tier, daily_search_count, daily_search_reset_at")
    .eq("id", organizationId)
    .single();

  if (error || !org) {
    // Fail closed only for free; if we can't read, default to allowing.
    return { allowed: true, limit: null, used: 0, remaining: null, reset_at: null, tier: "unknown" };
  }

  const tier = org.subscription_tier ?? "discovery";

  // Non-free tiers are unlimited.
  if (tier !== FREE_TIER) {
    return { allowed: true, limit: null, used: 0, remaining: null, reset_at: null, tier };
  }

  const nowMs = Date.now();
  const resetAt = org.daily_search_reset_at ? new Date(org.daily_search_reset_at).getTime() : 0;
  let used: number = org.daily_search_count ?? 0;
  let resetIso: string;

  // Reset if we're past the reset point.
  if (!resetAt || resetAt <= nowMs) {
    used = 0;
    resetIso = nextUtcMidnight().toISOString();
  } else {
    resetIso = new Date(resetAt).toISOString();
  }

  if (used >= FREE_DAILY_QUOTA) {
    return {
      allowed: false,
      limit: FREE_DAILY_QUOTA,
      used,
      remaining: 0,
      reset_at: resetIso,
      tier,
    };
  }

  const newUsed = used + 1;
  await supabase
    .from("organizations")
    .update({
      daily_search_count: newUsed,
      daily_search_reset_at: resetIso,
    })
    .eq("id", organizationId);

  return {
    allowed: true,
    limit: FREE_DAILY_QUOTA,
    used: newUsed,
    remaining: FREE_DAILY_QUOTA - newUsed,
    reset_at: resetIso,
    tier,
  };
}

export async function getSearchQuota(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<QuotaResult> {
  const { data: org } = await supabase
    .from("organizations")
    .select("subscription_tier, daily_search_count, daily_search_reset_at")
    .eq("id", organizationId)
    .single();
  if (!org) {
    return { allowed: true, limit: null, used: 0, remaining: null, reset_at: null, tier: "unknown" };
  }
  const tier = org.subscription_tier ?? "discovery";
  if (tier !== FREE_TIER) {
    return { allowed: true, limit: null, used: 0, remaining: null, reset_at: null, tier };
  }
  const nowMs = Date.now();
  const resetAt = org.daily_search_reset_at ? new Date(org.daily_search_reset_at).getTime() : 0;
  let used: number = org.daily_search_count ?? 0;
  let resetIso: string;
  if (!resetAt || resetAt <= nowMs) {
    used = 0;
    resetIso = nextUtcMidnight().toISOString();
  } else {
    resetIso = new Date(resetAt).toISOString();
  }
  return {
    allowed: used < FREE_DAILY_QUOTA,
    limit: FREE_DAILY_QUOTA,
    used,
    remaining: Math.max(0, FREE_DAILY_QUOTA - used),
    reset_at: resetIso,
    tier,
  };
}
