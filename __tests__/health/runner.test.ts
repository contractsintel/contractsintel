/**
 * Tests for lib/health/runner.ts.
 *
 * Verify:
 *   - runCheck captures throws → status='error', errorMessage set
 *   - runCheck records durationMs even on success
 *   - rollup() honors the precedence: red > critical-error > error/yellow > green
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { runCheck, rollup } from "../../lib/health/runner";
import type {
  HealthCheck,
  HealthCheckResult,
  HealthRunContext,
} from "../../lib/health/types";

const dummyCtx: HealthRunContext = {
  supabase: {} as any,
  runId: "test-run",
};

test("runCheck: returns the check's result on success", async () => {
  const check: HealthCheck = {
    name: "cron_coverage",
    run: async (): Promise<HealthCheckResult> => ({
      name: "cron_coverage",
      status: "green",
      metric: 0,
      threshold: 0,
      details: { ok: true },
      errorMessage: null,
      durationMs: 5,
    }),
  };
  const r = await runCheck(check, dummyCtx);
  assert.equal(r.status, "green");
  assert.equal(r.name, "cron_coverage");
  assert.equal(typeof r.durationMs, "number");
});

test("runCheck: captures thrown Error → status='error', errorMessage set", async () => {
  const check: HealthCheck = {
    name: "p_route_timeouts",
    run: async () => {
      throw new Error("kaboom");
    },
  };
  const r = await runCheck(check, dummyCtx);
  assert.equal(r.status, "error");
  assert.equal(r.name, "p_route_timeouts");
  assert.equal(r.errorMessage, "kaboom");
  assert.ok(typeof r.durationMs === "number" && r.durationMs >= 0);
});

test("runCheck: captures non-Error throw and stringifies", async () => {
  const check: HealthCheck = {
    name: "supabase_health",
    run: async () => {
      throw "string-thrown";
    },
  };
  const r = await runCheck(check, dummyCtx);
  assert.equal(r.status, "error");
  assert.equal(r.errorMessage, "string-thrown");
});

test("runCheck: backfills durationMs if check forgot", async () => {
  const check: HealthCheck = {
    name: "neverbounce_credits",
    run: async (): Promise<HealthCheckResult> =>
      ({
        name: "neverbounce_credits",
        status: "green",
        metric: 100000,
        threshold: 5000,
        details: null,
        errorMessage: null,
      }) as unknown as HealthCheckResult, // simulate forgetting durationMs
  };
  const r = await runCheck(check, dummyCtx);
  assert.equal(typeof r.durationMs, "number");
});

function res(
  name: HealthCheckResult["name"],
  status: HealthCheckResult["status"],
): HealthCheckResult {
  return {
    name,
    status,
    metric: 0,
    threshold: 0,
    details: null,
    errorMessage: null,
    durationMs: 1,
  };
}

const fakeChecks: HealthCheck[] = [
  { name: "cron_coverage", run: async () => res("cron_coverage", "green") },
  {
    name: "supabase_health",
    criticalOnError: true,
    run: async () => res("supabase_health", "green"),
  },
  {
    name: "neverbounce_credits",
    criticalOnError: true,
    run: async () => res("neverbounce_credits", "green"),
  },
];

test("rollup: all green → green", () => {
  const r = rollup(
    [
      res("cron_coverage", "green"),
      res("supabase_health", "green"),
      res("neverbounce_credits", "green"),
    ],
    fakeChecks,
  );
  assert.equal(r, "green");
});

test("rollup: any red → red", () => {
  const r = rollup(
    [res("cron_coverage", "red"), res("supabase_health", "green")],
    fakeChecks,
  );
  assert.equal(r, "red");
});

test("rollup: error on critical check → red", () => {
  const r = rollup(
    [res("cron_coverage", "green"), res("supabase_health", "error")],
    fakeChecks,
  );
  assert.equal(r, "red");
});

test("rollup: error on non-critical check → yellow", () => {
  const r = rollup(
    [res("cron_coverage", "error"), res("supabase_health", "green")],
    fakeChecks,
  );
  assert.equal(r, "yellow");
});

test("rollup: any yellow with no red → yellow", () => {
  const r = rollup(
    [res("cron_coverage", "yellow"), res("supabase_health", "green")],
    fakeChecks,
  );
  assert.equal(r, "yellow");
});
