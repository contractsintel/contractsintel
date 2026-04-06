import type { ScraperResult } from "./index";

// Procurement forecast and intelligence sources require HTML scraping configuration.

const FORECAST_SOURCES = [
  { id: "usaspending_explorer", name: "USASpending Contract Explorer", url: "https://www.usaspending.gov/explorer/contract" },
  { id: "fsrs", name: "FSRS (Subaward Reporting)", url: "https://www.fsrs.gov/" },
  { id: "sam_forecasts", name: "SAM.gov Procurement Forecasts", url: "https://sam.gov/search?index=fpf" },
  { id: "fpds", name: "FPDS Reports", url: "https://www.fpds.gov/" },
  { id: "govtribe", name: "GovTribe (public data)", url: "https://govtribe.com/" },
];

export { FORECAST_SOURCES };

export async function scrapeForecasts(_supabase: any): Promise<ScraperResult> {
  const startedAt = new Date().toISOString();

  console.log(
    `[forecasts] ${FORECAST_SOURCES.length} forecast/intelligence sources registered. ` +
    `These sources require manual HTML scraping configuration. ` +
    `Source requires manual configuration.`
  );

  return {
    source: "forecasts",
    status: "stub",
    opportunities_found: 0,
    matches_created: 0,
    error_message:
      `Forecast and intelligence sources require per-source configuration. ` +
      `${FORECAST_SOURCES.length} sources registered but not yet active.`,
    started_at: startedAt,
    completed_at: new Date().toISOString(),
  };
}
