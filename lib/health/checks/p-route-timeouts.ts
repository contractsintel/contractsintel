/**
 * p_route_timeouts check — non-success rate on the sliced p-routes
 * (scrape-grants-p* / scrape-usa-p*) over the last 24h.
 *
 * Thresholds (plan §4):
 *   red    if rate > HEALTH_P_TIMEOUT_RED_PCT     (default 30)
 *   yellow if rate > HEALTH_P_TIMEOUT_YELLOW_PCT  (default 10)
 */

import type {
  HealthCheck,
  HealthCheckResult,
  HealthRunContext,
  HealthStatus,
} from "../types";

const HOUR_MS = 60 * 60 * 1000;

export function classifyTimeoutRate(
  ratePct: number,
  thresholds: { red: number; yellow: number },
): HealthStatus {
  if (ratePct > thresholds.red) return "red";
  if (ratePct > thresholds.yellow) return "yellow";
  return "green";
}

export async function runPRouteTimeouts(
  ctx: HealthRunContext,
): Promise<HealthCheckResult> {
  const start = Date.now();
  const since = new Date(Date.now() - 24 * HOUR_MS).toISOString();

  const red = parseInt(process.env.HEALTH_P_TIMEOUT_RED_PCT || "30", 10);
  const yellow = parseInt(process.env.HEALTH_P_TIMEOUT_YELLOW_PCT || "10", 10);

  const { data, error } = await ctx.supabase
    .from("scraper_runs")
    .select("source,status")
    .or("source.ilike.scrape-grants-p%,source.ilike.scrape-usa-p%")
    .gte("started_at", since);
  if (error) throw new Error(`scraper_runs query failed: ${error.message}`);

  const rows = (data ?? []) as Array<{ source: string; status: string }>;
  const total = rows.length;

  if (total === 0) {
    return {
      name: "p_route_timeouts",
      status: "yellow",
      metric: 0,
      threshold: yellow,
      details: { reason: "no_data", window_hours: 24 },
      errorMessage: null,
      durationMs: Date.now() - start,
    };
  }

  const failures = rows.filter((r) => r.status !== "success").length;
  const ratePct = (failures / total) * 100;
  const status = classifyTimeoutRate(ratePct, { red, yellow });

  return {
    name: "p_route_timeouts",
    status,
    metric: Number(ratePct.toFixed(2)),
    threshold: red,
    details: {
      window_hours: 24,
      total_runs: total,
      failures,
      yellow_pct: yellow,
      red_pct: red,
    },
    errorMessage: null,
    durationMs: Date.now() - start,
  };
}

export const pRouteTimeoutsCheck: HealthCheck = {
  name: "p_route_timeouts",
  run: runPRouteTimeouts,
};
