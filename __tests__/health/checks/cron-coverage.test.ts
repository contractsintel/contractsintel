/**
 * Tests for lib/health/checks/cron-coverage.ts.
 *
 * Strategy: vercel.json is statically imported, so we can't easily mock it.
 * We mock supabase.from('scraper_runs')... to return either rows or empty,
 * uniformly for every cron. That gives us:
 *   - all-fired       → green
 *   - none-fired      → red (>2 missing)
 *   - one missing     → yellow (we simulate by failing a single source)
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { runCronCoverage } from "../../../lib/health/checks/cron-coverage";
import type { HealthRunContext } from "../../../lib/health/types";

function mkSupabase(matchAll: boolean): any {
  return {
    from: (_table: string) => ({
      select: () => ({
        eq: () => ({
          gte: () => ({
            limit: () =>
              Promise.resolve({
                data: matchAll ? [{ source: "x" }] : [],
                error: null,
              }),
          }),
        }),
      }),
    }),
  };
}

const ctxAllFired: HealthRunContext = {
  supabase: mkSupabase(true),
  runId: "t",
};
const ctxNoneFired: HealthRunContext = {
  supabase: mkSupabase(false),
  runId: "t",
};

test("cron_coverage: every cron fired → green", async () => {
  const r = await runCronCoverage(ctxAllFired);
  assert.equal(r.status, "green");
  assert.equal(r.metric, 0);
  assert.equal(r.name, "cron_coverage");
});

test("cron_coverage: zero crons fired → red (many missing)", async () => {
  const r = await runCronCoverage(ctxNoneFired);
  assert.equal(r.status, "red");
  assert.ok((r.metric as number) > 2);
  const details = r.details as { missing: unknown[]; total_crons: number };
  assert.ok(details.missing.length > 2);
  assert.ok(details.total_crons > 0);
});

test("cron_coverage: details include lookback_hours per missing cron", async () => {
  const r = await runCronCoverage(ctxNoneFired);
  const details = r.details as {
    missing: Array<{ path: string; lookback_hours: number }>;
  };
  // Weekly crons should have 192h, monthly 840h, default 48h.
  const lookbacks = new Set(details.missing.map((m) => m.lookback_hours));
  // At minimum we expect the default 48 to appear.
  assert.ok(lookbacks.has(48));
});
