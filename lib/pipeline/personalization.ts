/**
 * Personalization helpers for Instantly cold-outbound custom variables.
 *
 * Kept intentionally small: the v2 HUBZone rewrite (docs/campaign-copy/
 * hubzone-personalized-v2.md) only needs `naics_label`. Earlier drafts
 * proposed years_in_business / capabilities_excerpt / keyword_first
 * custom variables, but those were cut per Raphael's review — mirroring
 * self-authored marketing text and firm-age framing are risk vectors
 * that weren't worth the upside for cold outbound.
 *
 * Add helpers here as later cert drafts (8a / SDVOSB / WOSB-EDWOSB) land
 * and introduce new per-lead merge tags.
 */

export { naicsLabel } from "./naics-labels";
