/**
 * sam_sbs_failures check — non-success rate over last 24h on the SAM.gov
 * + DSBS scrapers (the ones most prone to upstream rate-limiting).
 *
 * Thresholds (plan §4):
 *   red    if rate > HEALTH_SAM_SBS_RED_PCT    (default 25)
 *   yellow if rate > HEALTH_SAM_SBS_YELLOW_PCT (default 10)
 */

import type {
  HealthCheck,
  HealthCheckResult,
  HealthRunContext,
  HealthStatus,
} from "../types";

const HOUR_MS = 60 * 60 * 1000;
const SOURCES = ["sam_gov", "dsbs", "dsbs-delta", "dsbs-weekly-sweep"] as const;

export function classifySamSbsRate(
  ratePct: number,
  thresholds: { red: number; yellow: number },
): HealthStatus {
  if (ratePct > thresholds.red) return "red";
  if (ratePct > thresholds.yellow) return "yellow";
  return "green";
}

export async function runSamSbsFailures(
  ctx: HealthRunContext,
): Promise<HealthCheckResult> {
  const start = Date.now();
  const since = new Date(Date.now() - 24 * HOUR_MS).toISOString();

  const red = parseInt(process.env.HEALTH_SAM_SBS_RED_PCT || "25", 10);
  const yellow = parseInt(process.env.HEALTH_SAM_SBS_YELLOW_PCT || "10", 10);

  const { data, error } = await ctx.supabase
    .from("scraper_runs")
    .select("source,status")
    .in("source", SOURCES as unknown as string[])
    .gte("started_at", since);
  if (error) throw new Error(`scraper_runs query failed: ${error.message}`);

  const rows = (data ?? []) as Array<{ source: string; status: string }>;
  const total = rows.length;

  if (total === 0) {
    return {
      name: "sam_sbs_failures",
      status: "yellow",
      metric: 0,
      threshold: yellow,
      details: { reason: "no_data", window_hours: 24, sources: SOURCES },
      errorMessage: null,
      durationMs: Date.now() - start,
    };
  }

  const failures = rows.filter((r) => r.status !== "success").length;
  const ratePct = (failures / total) * 100;
  const status = classifySamSbsRate(ratePct, { red, yellow });

  return {
    name: "sam_sbs_failures",
    status,
    metric: Number(ratePct.toFixed(2)),
    threshold: red,
    details: {
      window_hours: 24,
      total_runs: total,
      failures,
      yellow_pct: yellow,
      red_pct: red,
      sources: SOURCES,
    },
    errorMessage: null,
    durationMs: Date.now() - start,
  };
}

export const samSbsFailuresCheck: HealthCheck = {
  name: "sam_sbs_failures",
  run: runSamSbsFailures,
};
