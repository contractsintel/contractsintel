/**
 * cron_coverage check — verify every cron in vercel.json fired at least
 * once in the per-cron lookback window. See plan §5 E8.
 *
 * Lookback windows:
 *   default:  HEALTH_CRON_LOOKBACK_HOURS (48h)
 *   weekly:   8d
 *   monthly:  35d
 */

import vercelJson from "@/vercel.json";
import type {
  HealthCheck,
  HealthCheckResult,
  HealthRunContext,
} from "../types";

interface CronEntry {
  path: string;
  schedule: string;
}

// Crons whose schedule fires less than daily — need a longer lookback.
const WEEKLY_CRONS: ReadonlySet<string> = new Set([
  "scrape-usaspending-backfill",
  "dsbs-weekly-sweep",
  "owner-report",
]);
const MONTHLY_CRONS: ReadonlySet<string> = new Set(["performance-prompts"]);

const HOUR_MS = 60 * 60 * 1000;

/**
 * Map a cron path (e.g. "/api/cron/scrape-grants-p1") to the matching
 * `scraper_runs.source` values to look for. The mapping is conservative:
 * cron path → list of plausible source strings. If any source has at least
 * one row in the window, the cron is considered "fired".
 *
 * Most scrapers store the cron path's last segment, but a handful use a
 * different convention (e.g. `dsbs` vs `/api/cron/dsbs-delta`).
 */
function sourcesForPath(path: string): string[] {
  const last = path.split("/").pop() ?? path;
  // Always try the last-segment match first, plus any aliases.
  const aliases: Record<string, string[]> = {
    "dsbs-delta": ["dsbs-delta", "dsbs"],
    "dsbs-weekly-sweep": ["dsbs-weekly-sweep", "dsbs"],
    "scrape-federal": ["scrape-federal", "sam_gov", "sam-gov"],
  };
  return aliases[last] ?? [last];
}

function lookbackHoursFor(path: string): number {
  const last = path.split("/").pop() ?? path;
  if (MONTHLY_CRONS.has(last)) return 35 * 24;
  if (WEEKLY_CRONS.has(last)) return 8 * 24;
  const env = parseInt(process.env.HEALTH_CRON_LOOKBACK_HOURS || "", 10);
  return Number.isFinite(env) && env > 0 ? env : 48;
}

interface PerCron {
  path: string;
  schedule: string;
  lookback_hours: number;
  fired: boolean;
  matched_sources: string[];
}

export async function runCronCoverage(
  ctx: HealthRunContext,
): Promise<HealthCheckResult> {
  const start = Date.now();
  const crons = ((vercelJson as { crons?: CronEntry[] }).crons ?? []) as CronEntry[];
  // Skip the health-check cron itself — its evidence is the run we're in.
  const targets = crons.filter((c) => c.path !== "/api/cron/health-check");

  const now = Date.now();
  const perCron: PerCron[] = [];

  for (const c of targets) {
    const lookback = lookbackHoursFor(c.path);
    const since = new Date(now - lookback * HOUR_MS).toISOString();
    const sources = sourcesForPath(c.path);
    const matched: string[] = [];
    for (const src of sources) {
      const { data, error } = await ctx.supabase
        .from("scraper_runs")
        .select("source")
        .eq("source", src)
        .gte("started_at", since)
        .limit(1);
      if (error) {
        // Don't kill the whole check for one row error; record as no-match.
        continue;
      }
      if (data && data.length > 0) {
        matched.push(src);
      }
    }
    perCron.push({
      path: c.path,
      schedule: c.schedule,
      lookback_hours: lookback,
      fired: matched.length > 0,
      matched_sources: matched,
    });
  }

  const missing = perCron.filter((p) => !p.fired);
  const total = perCron.length;
  const status =
    missing.length === 0 ? "green" : missing.length <= 2 ? "yellow" : "red";

  return {
    name: "cron_coverage",
    status,
    metric: missing.length,
    threshold: 0,
    details: {
      total_crons: total,
      missing_count: missing.length,
      missing: missing.map((m) => ({
        path: m.path,
        schedule: m.schedule,
        lookback_hours: m.lookback_hours,
      })),
    },
    errorMessage: null,
    durationMs: Date.now() - start,
  };
}

export const cronCoverageCheck: HealthCheck = {
  name: "cron_coverage",
  run: runCronCoverage,
};
