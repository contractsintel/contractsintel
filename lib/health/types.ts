/**
 * Shared types for the health-check cron (PR 3).
 *
 * See docs/architecture/pr3-health-check-plan.md §3.1.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type HealthStatus = "green" | "yellow" | "red" | "error";

export type HealthCheckName =
  | "cron_coverage"
  | "p_route_timeouts"
  | "sam_sbs_failures"
  | "supabase_health"
  | "unacked_cron_alerts"
  | "neverbounce_credits"
  | "pipeline_stalls";

export interface HealthCheckResult {
  name: HealthCheckName;
  status: HealthStatus;
  metric?: number | null;
  threshold?: number | null;
  details?: Record<string, unknown> | null;
  errorMessage?: string | null;
  durationMs: number;
}

export interface HealthRunContext {
  supabase: SupabaseClient;
  runId: string;
}

/**
 * A check is a pure async function from context to result. Per-check
 * `criticalOnError` flag set on the function itself (see runner.ts §E3).
 */
export interface HealthCheck {
  name: HealthCheckName;
  criticalOnError?: boolean;
  run: (ctx: HealthRunContext) => Promise<HealthCheckResult>;
}
