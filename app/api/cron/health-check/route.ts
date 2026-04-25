/**
 * /api/cron/health-check — daily health monitoring cron (PR 3).
 *
 * Schedule: 0 11 * * * UTC (07:00 EDT / 06:00 EST). See plan §0 / §5 E5.
 *
 * Runs 7 independent checks against existing telemetry tables:
 *   1. cron_coverage         — every cron in vercel.json fired in window
 *   2. p_route_timeouts      — p-route non-success rate
 *   3. sam_sbs_failures      — SAM/DSBS non-success rate
 *   4. supabase_health       — write+read round-trip latency
 *   5. unacked_cron_alerts   — stale operator-actionable alerts
 *   6. neverbounce_credits   — NB balance vs floor
 *   7. pipeline_stalls       — cert_queue_state stuck on a stage
 *
 * Each check is wrapped by runCheck() which catches throws → status='error'.
 * Rollup logic in lib/health/runner.ts §rollup. On red rollup we escalate
 * once to cron_alerts (anti-loop guard inside unacked-cron-alerts.ts).
 *
 * Query params:
 *   ?dry=1            — execute checks but skip INSERT + alert
 *   ?suppress_alert=1 — execute and INSERT but skip cron_alerts escalation
 *
 * Auth: Authorization: Bearer ${CRON_SECRET} (matches scrape-federal pattern).
 */

import { NextRequest, NextResponse } from "next/server";
import { pipelineSupabase } from "@/lib/pipeline/supabase";
import { alert } from "@/lib/pipeline/alerts";
import { runCheck, rollup } from "@/lib/health/runner";
import type { HealthCheck, HealthCheckResult } from "@/lib/health/types";
import { cronCoverageCheck } from "@/lib/health/checks/cron-coverage";
import { pRouteTimeoutsCheck } from "@/lib/health/checks/p-route-timeouts";
import { samSbsFailuresCheck } from "@/lib/health/checks/sam-sbs-failures";
import { supabaseHealthCheck } from "@/lib/health/checks/supabase-health";
import { unackedCronAlertsCheck } from "@/lib/health/checks/unacked-cron-alerts";
import { neverbounceCreditsCheck } from "@/lib/health/checks/neverbounce-credits";
import { pipelineStallsCheck } from "@/lib/health/checks/pipeline-stalls";

const DAY_MS = 24 * 60 * 60 * 1000;
const RETENTION_DAYS = 90;

const CHECKS: readonly HealthCheck[] = [
  cronCoverageCheck,
  pRouteTimeoutsCheck,
  samSbsFailuresCheck,
  supabaseHealthCheck,
  unackedCronAlertsCheck,
  neverbounceCreditsCheck,
  pipelineStallsCheck,
];

function toRow(runId: string, r: HealthCheckResult): Record<string, unknown> {
  return {
    run_id: runId,
    check_name: r.name,
    status: r.status,
    metric: r.metric ?? null,
    threshold: r.threshold ?? null,
    details: r.details ?? null,
    error_message: r.errorMessage ?? null,
    duration_ms: r.durationMs,
  };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const dry = url.searchParams.get("dry") === "1";
  const suppressAlert = url.searchParams.get("suppress_alert") === "1";

  const runId = crypto.randomUUID();
  const supabase = pipelineSupabase();
  const ctx = { supabase, runId };

  // Run all checks in parallel; runCheck() never throws.
  const results: HealthCheckResult[] = await Promise.all(
    CHECKS.map((c) => runCheck(c, ctx)),
  );

  const overall = rollup(results, CHECKS);

  if (!dry) {
    // Persist results.
    const rows = results.map((r) => toRow(runId, r));
    const insertRes = await supabase.from("health_checks").insert(rows);
    if (insertRes.error) {
      console.log(
        `[${runId}] health_checks insert failed: ${insertRes.error.message}`,
      );
    }

    // Retention cleanup — piggyback on the daily run (plan §2.3).
    const cutoff = new Date(Date.now() - RETENTION_DAYS * DAY_MS).toISOString();
    const delRes = await supabase
      .from("health_checks")
      .delete()
      .lt("created_at", cutoff);
    if (delRes.error) {
      console.log(
        `[${runId}] health_checks retention delete failed: ${delRes.error.message}`,
      );
    }

    // Escalate red rollups to cron_alerts (severity='error' per open-question
    // decision #2). Anti-loop is enforced by unacked-cron-alerts filtering
    // out source='health-check'.
    if (overall === "red" && !suppressAlert) {
      const reds = results.filter(
        (r) => r.status === "red" || r.status === "error",
      );
      await alert(
        supabase,
        runId,
        "error",
        "health-check",
        `Health rollup is red — ${reds.length} check(s) failing`,
        {
          overall,
          failing: reds.map((r) => ({
            name: r.name,
            status: r.status,
            metric: r.metric,
            threshold: r.threshold,
            error_message: r.errorMessage,
          })),
        },
      );
    }
  }

  // External heartbeat — open-question #1 decision: include the line, env-
  // var-guarded so it's a no-op until the user sets HEALTHCHECKS_PING_URL.
  const pingUrl = process.env.HEALTHCHECKS_PING_URL;
  if (pingUrl && !dry) {
    try {
      await fetch(pingUrl, { method: "GET" });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`[${runId}] healthchecks.io ping failed: ${msg}`);
    }
  }

  return NextResponse.json({
    run_id: runId,
    overall,
    dry,
    suppress_alert: suppressAlert,
    checks: results.map((r) => ({
      name: r.name,
      status: r.status,
      metric: r.metric,
      threshold: r.threshold,
      duration_ms: r.durationMs,
      error_message: r.errorMessage,
      details: r.details,
    })),
  });
}
