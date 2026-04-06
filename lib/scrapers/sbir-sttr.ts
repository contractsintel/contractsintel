import type { ScraperResult } from "./index";

// SBIR/STTR program sites are HTML-based and require per-agency configuration.

const SBIR_SOURCES = [
  { id: "sbir_gov", name: "SBIR.gov", url: "https://www.sbir.gov/" },
  { id: "sbir_dod", name: "DoD SBIR", url: "https://www.defensesbirsttr.mil/" },
  { id: "sbir_nih", name: "NIH SBIR", url: "https://seed.nih.gov/" },
  { id: "sbir_nsf", name: "NSF SBIR", url: "https://seedfund.nsf.gov/" },
  { id: "sbir_doe", name: "DOE SBIR", url: "https://science.osti.gov/sbir" },
  { id: "sbir_nasa", name: "NASA SBIR", url: "https://sbir.nasa.gov/" },
  { id: "sbir_usda", name: "USDA SBIR", url: "https://www.nifa.usda.gov/grants/programs/sbir-program" },
];

export { SBIR_SOURCES };

export async function scrapeSbirSttr(_supabase: any): Promise<ScraperResult> {
  const startedAt = new Date().toISOString();

  console.log(
    `[sbir-sttr] ${SBIR_SOURCES.length} SBIR/STTR program sources registered. ` +
    `These sources require per-agency HTML scraping configuration. ` +
    `Source requires manual configuration.`
  );

  return {
    source: "sbir_sttr",
    status: "stub",
    opportunities_found: 0,
    matches_created: 0,
    error_message:
      `SBIR/STTR program sites require per-agency configuration. ` +
      `${SBIR_SOURCES.length} sources registered but not yet active.`,
    started_at: startedAt,
    completed_at: new Date().toISOString(),
  };
}
