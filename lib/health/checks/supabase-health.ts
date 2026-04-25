/**
 * supabase_health check — write+read round-trip latency on the
 * health_checks table itself. The probe row is the same row we'd write
 * for this check anyway (the runner records it post-rollup), so we use a
 * tiny separate insert here that we then delete to avoid double-counting.
 *
 * Actually — to keep the check self-contained AND avoid corrupting the
 * row count, we insert a probe row with check_name='supabase_health' and
 * a sentinel error_message='__probe__' that the route filters out. That
 * keeps RLS-bypass + real round-trip semantics.
 *
 * See plan §5 E6.
 *
 * Thresholds (plan §4):
 *   red    if duration > HEALTH_SUPABASE_RED_MS     (default 2000)
 *   yellow if duration > HEALTH_SUPABASE_YELLOW_MS  (default 800)
 */

import type {
  HealthCheck,
  HealthCheckResult,
  HealthRunContext,
  HealthStatus,
} from "../types";

export function classifySupabaseLatency(
  ms: number,
  thresholds: { red: number; yellow: number },
): HealthStatus {
  if (ms > thresholds.red) return "red";
  if (ms > thresholds.yellow) return "yellow";
  return "green";
}

export async function runSupabaseHealth(
  ctx: HealthRunContext,
): Promise<HealthCheckResult> {
  const start = Date.now();
  const red = parseInt(process.env.HEALTH_SUPABASE_RED_MS || "2000", 10);
  const yellow = parseInt(process.env.HEALTH_SUPABASE_YELLOW_MS || "800", 10);

  // Insert a probe row, then read it back. Round-trip = write+read.
  const probeRow = {
    run_id: ctx.runId,
    check_name: "supabase_health" as const,
    status: "green" as const,
    metric: null,
    threshold: null,
    details: { probe: true } as Record<string, unknown>,
    error_message: "__probe__",
    duration_ms: 0,
  };

  const t0 = Date.now();
  const insertRes = await ctx.supabase
    .from("health_checks")
    .insert(probeRow)
    .select("id")
    .single();
  if (insertRes.error || !insertRes.data) {
    throw new Error(
      `health_checks probe insert failed: ${insertRes.error?.message ?? "no row"}`,
    );
  }
  const probeId = insertRes.data.id;

  const readRes = await ctx.supabase
    .from("health_checks")
    .select("id")
    .eq("id", probeId)
    .single();
  const elapsed = Date.now() - t0;

  if (readRes.error) {
    throw new Error(`health_checks probe read failed: ${readRes.error.message}`);
  }

  // Best-effort cleanup — don't include in latency measurement.
  await ctx.supabase.from("health_checks").delete().eq("id", probeId);

  const status = classifySupabaseLatency(elapsed, { red, yellow });

  return {
    name: "supabase_health",
    status,
    metric: elapsed,
    threshold: red,
    details: {
      yellow_ms: yellow,
      red_ms: red,
    },
    errorMessage: null,
    durationMs: Date.now() - start,
  };
}

export const supabaseHealthCheck: HealthCheck = {
  name: "supabase_health",
  criticalOnError: true,
  run: runSupabaseHealth,
};
