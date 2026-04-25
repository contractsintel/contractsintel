/**
 * Tests for lib/health/checks/unacked-cron-alerts.ts.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { runUnackedCronAlerts } from "../../../lib/health/checks/unacked-cron-alerts";
import type { HealthRunContext } from "../../../lib/health/types";

function mkSupabase(
  rows: Array<{ id: number; severity: string; source: string; created_at: string }>,
): any {
  return {
    from: () => ({
      select: () => ({
        in: () => ({
          is: () => ({
            lt: () => ({
              neq: () => Promise.resolve({ data: rows, error: null }),
            }),
          }),
        }),
      }),
    }),
  };
}

test("unacked_cron_alerts: no rows → green", async () => {
  const ctx: HealthRunContext = { supabase: mkSupabase([]), runId: "t" };
  const r = await runUnackedCronAlerts(ctx);
  assert.equal(r.status, "green");
  assert.equal(r.metric, 0);
});

test("unacked_cron_alerts: error-severity row → yellow", async () => {
  const ctx: HealthRunContext = {
    supabase: mkSupabase([
      {
        id: 1,
        severity: "error",
        source: "scrape-federal",
        created_at: "2026-04-23T00:00:00Z",
      },
    ]),
    runId: "t",
  };
  const r = await runUnackedCronAlerts(ctx);
  assert.equal(r.status, "yellow");
  assert.equal(r.metric, 1);
});

test("unacked_cron_alerts: critical-severity row → red", async () => {
  const ctx: HealthRunContext = {
    supabase: mkSupabase([
      {
        id: 2,
        severity: "critical",
        source: "verify-poll",
        created_at: "2026-04-23T00:00:00Z",
      },
    ]),
    runId: "t",
  };
  const r = await runUnackedCronAlerts(ctx);
  assert.equal(r.status, "red");
  assert.equal(r.metric, 1);
});

test("unacked_cron_alerts: details include sample with severity/source", async () => {
  const rows = [
    {
      id: 5,
      severity: "error",
      source: "scrape-grants-p3",
      created_at: "2026-04-23T00:00:00Z",
    },
  ];
  const ctx: HealthRunContext = { supabase: mkSupabase(rows), runId: "t" };
  const r = await runUnackedCronAlerts(ctx);
  const d = r.details as { error_count: number; sample: unknown[] };
  assert.equal(d.error_count, 1);
  assert.equal(d.sample.length, 1);
});
