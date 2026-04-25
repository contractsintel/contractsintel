/**
 * pipeline_stalls check — find cert_queue_state rows stuck on a stage
 * for too long.
 *
 * Thresholds (plan §4):
 *   red    if any non-done stage_started_at < now() - HEALTH_STALL_RED_HOURS    (24h)
 *   yellow if any non-done stage_started_at < now() - HEALTH_STALL_YELLOW_HOURS (6h)
 */

import type {
  HealthCheck,
  HealthCheckResult,
  HealthRunContext,
  HealthStatus,
} from "../types";

const HOUR_MS = 60 * 60 * 1000;

export function classifyStallHours(
  hoursStuck: number,
  thresholds: { red: number; yellow: number },
): HealthStatus {
  if (hoursStuck >= thresholds.red) return "red";
  if (hoursStuck >= thresholds.yellow) return "yellow";
  return "green";
}

export async function runPipelineStalls(
  ctx: HealthRunContext,
): Promise<HealthCheckResult> {
  const start = Date.now();
  const red = parseInt(process.env.HEALTH_STALL_RED_HOURS || "24", 10);
  const yellow = parseInt(process.env.HEALTH_STALL_YELLOW_HOURS || "6", 10);

  // Pull all non-done rows; filter and classify in JS so we report the
  // worst-stuck cert in details.
  const { data, error } = await ctx.supabase
    .from("cert_queue_state")
    .select("cert,stage,stage_started_at")
    .neq("stage", "done");
  if (error) throw new Error(`cert_queue_state query failed: ${error.message}`);

  const rows = (data ?? []) as Array<{
    cert: string;
    stage: string;
    stage_started_at: string | null;
  }>;
  const now = Date.now();
  const stalled = rows
    .map((r) => {
      const startedAt = r.stage_started_at ? Date.parse(r.stage_started_at) : NaN;
      const hours = Number.isFinite(startedAt) ? (now - startedAt) / HOUR_MS : 0;
      return { ...r, hours_stuck: hours };
    })
    .filter((r) => r.hours_stuck >= yellow)
    .sort((a, b) => b.hours_stuck - a.hours_stuck);

  const worst = stalled[0]?.hours_stuck ?? 0;
  const status = classifyStallHours(worst, { red, yellow });

  return {
    name: "pipeline_stalls",
    status,
    metric: Number(worst.toFixed(2)),
    threshold: red,
    details: {
      yellow_hours: yellow,
      red_hours: red,
      stalled_count: stalled.length,
      stalled: stalled.slice(0, 5).map((s) => ({
        cert: s.cert,
        stage: s.stage,
        hours_stuck: Number(s.hours_stuck.toFixed(2)),
      })),
    },
    errorMessage: null,
    durationMs: Date.now() - start,
  };
}

export const pipelineStallsCheck: HealthCheck = {
  name: "pipeline_stalls",
  run: runPipelineStalls,
};
