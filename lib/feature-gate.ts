export type Tier = "discovery" | "bd_pro" | "team";

const TIER_LEVELS: Record<Tier, number> = {
  discovery: 0,
  bd_pro: 1,
  team: 2,
};

export function hasAccess(userTier: Tier | string, requiredTier: Tier): boolean {
  const userLevel = TIER_LEVELS[userTier as Tier] ?? 0;
  const requiredLevel = TIER_LEVELS[requiredTier] ?? 0;
  return userLevel >= requiredLevel;
}

export function isDiscovery(tier: string | undefined): boolean {
  return !tier || tier === "discovery" || tier === "trial";
}

export function tierLabel(tier: string | undefined): string {
  switch (tier) {
    case "bd_pro":
      return "BD Pro";
    case "team":
      return "Team";
    case "discovery":
      return "Discovery";
    case "trial":
      return "Free Trial";
    default:
      return "Discovery";
  }
}
