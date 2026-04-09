// Match-score weights used by the Network/Teaming page.
// Centralized so changes don't require touching the component.
export const TEAMING_WEIGHTS = {
  naicsMatch: 50,
  certMatch: 30,
  unrestrictedBonus: 40, // when the post lists no NAICS or certs at all
  baselineFloor: 20, // minimum score for any post
  maxScore: 100,
} as const;
