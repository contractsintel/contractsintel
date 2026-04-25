/**
 * unacked_cron_alerts check — count cron_alerts rows where:
 *   severity IN ('error','critical')
 *   AND acked_at IS NULL
 *   AND created_at < now() - interval '1 hour'
 *   AND source <> 'health-check'   (ANTI-LOOP — see plan §5 E7)
 *
 * The source filter is critical: without it, this check's own escalation
 * to cron_alerts becomes its own input the next morning, and the system
 * permanently red-flags itself.
 *
 * Thresholds (plan §4):
 *   red    if any unacked critical >1h old
 *   yellow if any unacked error    >1h old
 */

import type {
  HealthCheck,
  HealthCheckResult,
  HealthRunContext,
} from "../types";

const HOUR_MS = 60 * 60 * 1000;

export async function runUnackedCronAlerts(
  ctx: HealthRunContext,
): Promise<HealthCheckResult> {
  const start = Date.now();
  const ageHours = parseInt(process.env.HEALTH_ALERT_AGE_HOURS || "1", 10);
  const cutoff = new Date(Date.now() - ageHours * HOUR_MS).toISOString();

  const { data, error } = await ctx.supabase
    .from("cron_alerts")
    .select("id,severity,source,created_at")
    .in("severity", ["error", "critical"])
    .is("acked_at", null)
    .lt("created_at", cutoff)
    .neq("source", "health-check");
  if (error) throw new Error(`cron_alerts query failed: ${error.message}`);

  const rows = (data ?? []) as Array<{
    id: number;
    severity: string;
    source: string;
    created_at: string;
  }>;
  const critical = rows.filter((r) => r.severity === "critical");
  const errors = rows.filter((r) => r.severity === "error");

  const status =
    critical.length > 0 ? "red" : errors.length > 0 ? "yellow" : "green";

  return {
    name: "unacked_cron_alerts",
    status,
    metric: rows.length,
    threshold: 0,
    details: {
      age_hours: ageHours,
      critical_count: critical.length,
      error_count: errors.length,
      sample: rows.slice(0, 5).map((r) => ({
        id: r.id,
        severity: r.severity,
        source: r.source,
        created_at: r.created_at,
      })),
    },
    errorMessage: null,
    durationMs: Date.now() - start,
  };
}

export const unackedCronAlertsCheck: HealthCheck = {
  name: "unacked_cron_alerts",
  run: runUnackedCronAlerts,
};
