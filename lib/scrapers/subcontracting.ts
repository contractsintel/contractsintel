import type { ScraperResult } from "./index";

// Subcontracting databases require HTML scraping configuration.

const SUBCONTRACTING_SOURCES = [
  { id: "sba_subnet", name: "SBA SubNet", url: "https://eweb.sba.gov/subnet/" },
  { id: "gsa_subcontracting", name: "GSA Subcontracting Directory", url: "https://www.gsa.gov/small-business/subcontracting-opportunities" },
];

export { SUBCONTRACTING_SOURCES };

export async function scrapeSubcontracting(_supabase: any): Promise<ScraperResult> {
  const startedAt = new Date().toISOString();

  console.log(
    `[subcontracting] ${SUBCONTRACTING_SOURCES.length} subcontracting sources registered. ` +
    `These sources require HTML scraping configuration. ` +
    `Source requires manual configuration.`
  );

  return {
    source: "subcontracting",
    status: "stub",
    opportunities_found: 0,
    matches_created: 0,
    error_message:
      `Subcontracting databases require per-source HTML scraping configuration. ` +
      `${SUBCONTRACTING_SOURCES.length} sources registered but not yet active.`,
    started_at: startedAt,
    completed_at: new Date().toISOString(),
  };
}
