import { scrapeSamGov } from "./sam-gov";
import { scrapeUsaspending } from "./usaspending";
import { scrapeGrantsGov } from "./grants-gov";
import { scrapeMilitaryDefense } from "./military-defense";
import { scrapeStateLocal } from "./state-local";
import { scrapeSbirSttr } from "./sbir-sttr";
import { scrapeForecasts } from "./forecasts";
import { scrapeSubcontracting } from "./subcontracting";
import { scrapeFederalCivilian } from "./federal-civilian";

export interface ScraperResult {
  source: string;
  status: "success" | "error" | "stub";
  opportunities_found: number;
  matches_created: number;
  error_message?: string;
  started_at: string;
  completed_at: string;
}

type ScraperFn = (supabase: any) => Promise<ScraperResult>;

const SCRAPER_CATEGORIES: Record<string, ScraperFn[]> = {
  federal: [scrapeSamGov, scrapeUsaspending, scrapeGrantsGov, scrapeFederalCivilian],
  military: [scrapeMilitaryDefense],
  states: [scrapeStateLocal],
  sbir: [scrapeSbirSttr],
  forecasts: [scrapeForecasts, scrapeSubcontracting],
};

async function logScraperRun(supabase: any, result: ScraperResult) {
  try {
    await supabase.from("scraper_runs").insert({
      source: result.source,
      status: result.status,
      opportunities_found: result.opportunities_found,
      matches_created: result.matches_created,
      error_message: result.error_message ?? null,
      started_at: result.started_at,
      completed_at: result.completed_at,
    });
  } catch (err) {
    console.error(`Failed to log scraper run for ${result.source}:`, err);
  }
}

export async function runScrapersByCategory(
  supabase: any,
  category: string
): Promise<ScraperResult[]> {
  const scrapers = SCRAPER_CATEGORIES[category];
  if (!scrapers) {
    console.error(`Unknown scraper category: ${category}`);
    return [];
  }

  const results: ScraperResult[] = [];

  for (const scraperFn of scrapers) {
    try {
      const result = await scraperFn(supabase);
      await logScraperRun(supabase, result);
      results.push(result);
    } catch (err) {
      const errorResult: ScraperResult = {
        source: scraperFn.name || "unknown",
        status: "error",
        opportunities_found: 0,
        matches_created: 0,
        error_message: err instanceof Error ? err.message : String(err),
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      };
      await logScraperRun(supabase, errorResult);
      results.push(errorResult);
    }
  }

  return results;
}

export async function runAllScrapers(
  supabase: any,
  category?: string
): Promise<ScraperResult[]> {
  if (category) {
    return runScrapersByCategory(supabase, category);
  }

  const allResults: ScraperResult[] = [];
  for (const cat of Object.keys(SCRAPER_CATEGORIES)) {
    const results = await runScrapersByCategory(supabase, cat);
    allResults.push(...results);
  }
  return allResults;
}
