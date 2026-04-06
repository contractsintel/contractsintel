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

// Features exclusive to BD Pro (not in Discovery)
const BD_PRO_FEATURES: Feature[] = [
  'proposal_drafts', 'full_compliance', 'past_performance',
  'contract_delivery', 'state_local_monitoring', 'agency_mapping', 'weekly_report'
];

// Features exclusive to Team (not in BD Pro)
const TEAM_FEATURES: Feature[] = [
  'team_users', 'api_access', 'cpars_monitor', 'subcontracting_network',
  'vehicle_alerts', 'prompt_payment_enforcement', 'competitor_intelligence',
  'loss_analysis', 'agency_heat_maps'
];

const TIER_LEVELS: Record<Tier, number> = {
  discovery: 0,
  bd_pro: 1,
  team: 2,
};

export function isTrialActive(org: any): boolean {
  if (!org) return false;
  if (org.subscription_status !== "trialing") return false;
  if (!org.trial_ends_at) return false;
  return new Date(org.trial_ends_at) > new Date();
}

export function canAccess(tier: string, feature: Feature, trialActive: boolean = false): boolean {
  // During active trial, ALL features are unlocked
  if (trialActive) return true;
  return TIER_ACCESS[tier]?.includes(feature) ?? false;
}

export function hasAccess(userTier: Tier | string, requiredTier: Tier): boolean {
  const userLevel = TIER_LEVELS[userTier as Tier] ?? 0;
  const requiredLevel = TIER_LEVELS[requiredTier] ?? 0;
  return userLevel >= requiredLevel;
}

export function isDiscovery(tier: string | undefined, org?: any): boolean {
  // During trial, nothing is locked
  if (org && isTrialActive(org)) return false;
  return !tier || tier === "discovery" || tier === "trial";
}

export function isTeam(tier: string | undefined, org?: any): boolean {
  if (org && isTrialActive(org)) return true; // During trial, Team features are unlocked
  return tier === "team";
}

export function isBdProOrHigher(tier: string | undefined, org?: any): boolean {
  if (org && isTrialActive(org)) return true;
  return tier === "bd_pro" || tier === "team";
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

export function getFeatureTier(feature: Feature | string): "discovery" | "bd_pro" | "team" {
  if (TEAM_FEATURES.includes(feature as Feature)) return "team";
  if (BD_PRO_FEATURES.includes(feature as Feature)) return "bd_pro";
  return "discovery";
}

// Map page names to their feature tier
export function getPageTier(page: string): "discovery" | "bd_pro" | "team" {
  const PAGE_TIERS: Record<string, "discovery" | "bd_pro" | "team"> = {
    dashboard: "discovery",
    pipeline: "discovery",
    compliance: "discovery",
    settings: "discovery",
    "get-started": "discovery",
    proposals: "bd_pro",
    "past-performance": "bd_pro",
    contracts: "bd_pro",
    cpars: "team",
    network: "team",
    competitors: "team",
    analytics: "team",
  };
  return PAGE_TIERS[page] || "discovery";
}

export function getUpgradeTier(currentTier: string): { name: string; price: string; features: string[] } | null {
  if (currentTier === 'team') return null;
  if (currentTier === 'bd_pro') return {
    name: 'Team',
    price: '$2,499/mo',
    features: ['CPARS Monitor', 'Subcontracting Network', 'Competitor Intelligence', 'Loss Analysis', 'Agency Heat Maps', 'Contract Vehicle Alerts', 'Unlimited team users', 'API access']
  };
  return {
    name: 'BD Pro',
    price: '$999/mo',
    features: ['AI Proposal Drafts', 'Full Compliance Monitor', 'Past Performance Builder', 'Contract Delivery Dashboard', 'Agency Relationship Mapping', 'Weekly Pipeline Report']
  };
}
