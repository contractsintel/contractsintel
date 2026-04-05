export type Tier = "discovery" | "bd_pro" | "team";

export type Feature =
  | 'opportunity_intelligence'
  | 'daily_digest'
  | 'pipeline_tracker'
  | 'basic_compliance'
  | 'calendar_sync'
  | 'sam_audit'
  | 'proposal_drafts'
  | 'full_compliance'
  | 'past_performance'
  | 'contract_delivery'
  | 'state_local_monitoring'
  | 'agency_mapping'
  | 'weekly_report'
  | 'team_users'
  | 'api_access'
  | 'cpars_monitor'
  | 'subcontracting_network'
  | 'vehicle_alerts'
  | 'prompt_payment_enforcement'
  | 'competitor_intelligence'
  | 'loss_analysis'
  | 'agency_heat_maps';

const TIER_ACCESS: Record<string, Feature[]> = {
  discovery: [
    'opportunity_intelligence', 'daily_digest', 'pipeline_tracker',
    'basic_compliance', 'calendar_sync', 'sam_audit'
  ],
  bd_pro: [
    'opportunity_intelligence', 'daily_digest', 'pipeline_tracker',
    'basic_compliance', 'calendar_sync', 'sam_audit',
    'proposal_drafts', 'full_compliance', 'past_performance',
    'contract_delivery', 'state_local_monitoring', 'agency_mapping',
    'weekly_report'
  ],
  team: [
    'opportunity_intelligence', 'daily_digest', 'pipeline_tracker',
    'basic_compliance', 'calendar_sync', 'sam_audit',
    'proposal_drafts', 'full_compliance', 'past_performance',
    'contract_delivery', 'state_local_monitoring', 'agency_mapping',
    'weekly_report',
    'team_users', 'api_access', 'cpars_monitor',
    'subcontracting_network', 'vehicle_alerts',
    'prompt_payment_enforcement', 'competitor_intelligence',
    'loss_analysis', 'agency_heat_maps'
  ]
};

const TIER_LEVELS: Record<Tier, number> = {
  discovery: 0,
  bd_pro: 1,
  team: 2,
};

export function canAccess(tier: string, feature: Feature, trialActive: boolean = false): boolean {
  if (trialActive) return true;
  return TIER_ACCESS[tier]?.includes(feature) ?? false;
}

export function hasAccess(userTier: Tier | string, requiredTier: Tier): boolean {
  const userLevel = TIER_LEVELS[userTier as Tier] ?? 0;
  const requiredLevel = TIER_LEVELS[requiredTier] ?? 0;
  return userLevel >= requiredLevel;
}

export function isDiscovery(tier: string | undefined): boolean {
  return !tier || tier === "discovery" || tier === "trial";
}

export function isBdProOrHigher(tier: string | undefined): boolean {
  return tier === "bd_pro" || tier === "team";
}

export function isTeam(tier: string | undefined): boolean {
  return tier === "team";
}

export function tierLabel(tier: string | undefined): string {
  switch (tier) {
    case "bd_pro": return "BD Pro";
    case "team": return "Team";
    case "discovery": return "Discovery";
    case "trial": return "Free Trial";
    default: return "Discovery";
  }
}

export function getUpgradeTier(currentTier: string): { name: string; price: string; features: string[] } | null {
  if (currentTier === 'team') return null;
  if (currentTier === 'bd_pro') return {
    name: 'Team',
    price: '$2,500/mo',
    features: ['CPARS Monitor', 'Subcontracting Network', 'Competitor Intelligence', 'Loss Analysis', 'Agency Heat Maps', 'Contract Vehicle Alerts', 'Unlimited team users', 'API access']
  };
  return {
    name: 'BD Pro',
    price: '$999/mo',
    features: ['AI Proposal Drafts', 'Full Compliance Monitor', 'Past Performance Builder', 'Contract Delivery Dashboard', 'Agency Relationship Mapping', 'Weekly Pipeline Report']
  };
}
