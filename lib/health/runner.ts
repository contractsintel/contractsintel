/**
 * runCheck() — wrapper that catches throws, times execution, and returns
 * a HealthCheckResult with status='error' on failure.
 *
 * See plan §5 E1 and E3.
 */

import type {
  HealthCheck,
  HealthCheckResult,
  HealthRunContext,
  HealthStatus,
} from "./types";

export async function runCheck(
  check: HealthCheck,
  ctx: HealthRunContext,
): Promise<HealthCheckResult> {
  const start = Date.now();
  try {
    const result = await check.run(ctx);
    // Make sure durationMs is populated even if the check forgot.
    if (typeof result.durationMs !== "number") {
      return { ...result, durationMs: Date.now() - start };
    }
    return result;
  } catch (e: unknown) {
    const err = e instanceof Error ? e : new Error(String(e));
    return {
      name: check.name,
      status: "error",
      metric: null,
      threshold: null,
      details: { stack: err.stack ?? null, criticalOnError: !!check.criticalOnError },
      errorMessage: err.message,
      durationMs: Date.now() - start,
    };
  }
}

/**
 * Rollup logic — see plan §5 E3.
 *   any red               → red
 *   any error w/ critical → red
 *   any error or yellow   → yellow
 *   else                  → green
 */
export function rollup(
  results: readonly HealthCheckResult[],
  checks: readonly HealthCheck[],
): HealthStatus {
  const criticalSet = new Set(
    checks.filter((c) => c.criticalOnError).map((c) => c.name),
  );

  let sawError = false;
  let sawYellow = false;

  for (const r of results) {
    if (r.status === "red") return "red";
    if (r.status === "error") {
      if (criticalSet.has(r.name)) return "red";
      sawError = true;
    } else if (r.status === "yellow") {
      sawYellow = true;
    }
  }

  if (sawError || sawYellow) return "yellow";
  return "green";
}
