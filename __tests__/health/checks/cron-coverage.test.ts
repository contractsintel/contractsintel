/**
 * Tests for lib/health/checks/cron-coverage.ts.
 *
 * vercel.json is statically imported; we mock the supabase query
 * builder uniformly for every cron in the file. With the new allowlist
 * (PR fix/health-check-tuning), most non-scraper crons are skipped
 * rather than queried, so the green/red boundaries are based on the
 * subset of allowlist entries with non-null evidence config.
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
        gte: () => ({
          limit: () =>
            Promise.resolve({
              data: matchAll ? [{ x: 1 }] : [],
              error: null,
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

test("cron_coverage: every checked cron fired → green", async () => {
  const r = await runCronCoverage(ctxAllFired);
  assert.equal(r.status, "green");
  assert.equal(r.metric, 0);
  assert.equal(r.name, "cron_coverage");
});

test("cron_coverage: zero rows for any checked cron → red", async () => {
  const r = await runCronCoverage(ctxNoneFired);
  assert.equal(r.status, "red");
  const details = r.details as {
    missing: unknown[];
    total_crons: number;
    checked: number;
    skipped_count: number;
  };
  assert.ok(details.missing.length > 0);
  assert.ok(details.checked > 0);
  // Skipped should be substantially larger than checked (most crons
  // are out_of_scope or self).
  assert.ok(details.skipped_count > details.checked);
  assert.ok(details.total_crons > 0);
});

test("cron_coverage: skipped crons (null evidence) are NOT flagged missing", async () => {
  const r = await runCronCoverage(ctxNoneFired);
  const details = r.details as {
    skipped: Array<{ path: string; reason: string }>;
    missing: Array<{ path: string }>;
  };
  // Sanity: send-digests and health-check itself must be in skipped,
  // never in missing.
  const skippedPaths = new Set(details.skipped.map((s) => s.path));
  const missingPaths = new Set(details.missing.map((m) => m.path));

  assert.ok(skippedPaths.has("/api/cron/send-digests"));
  assert.ok(skippedPaths.has("/api/cron/health-check"));
  assert.ok(skippedPaths.has("/api/cron/compliance-alerts"));
  assert.ok(skippedPaths.has("/api/cron/owner-report"));
  assert.ok(skippedPaths.has("/api/cron/cert-pipeline"));
  // Paginated grants/usaspending pages are skipped too.
  assert.ok(skippedPaths.has("/api/cron/scrape-grants-p1"));
  assert.ok(skippedPaths.has("/api/cron/scrape-usa-p15"));

  assert.ok(!missingPaths.has("/api/cron/send-digests"));
  assert.ok(!missingPaths.has("/api/cron/health-check"));

  // health-check should be marked self.
  const self = details.skipped.find(
    (s) => s.path === "/api/cron/health-check",
  );
  assert.equal(self?.reason, "self");
});

test("cron_coverage: cron with evidence config and rows in window → fired (green)", async () => {
  const r = await runCronCoverage(ctxAllFired);
  const details = r.details as {
    checked: number;
    green_count: number;
    missing_count: number;
  };
  // When everything fires, every checked cron is green.
  assert.equal(details.green_count, details.checked);
  assert.equal(details.missing_count, 0);
  // Allowlist has 7 non-null evidence entries (scrape-federal,
  // scrape-military, scrape-states, scrape-sbir, scrape-forecasts,
  // dsbs-delta, dsbs-weekly-sweep). All should be checked.
  assert.equal(details.checked, 7);
});

test("cron_coverage: missing entries include evidence_table + sources", async () => {
  const r = await runCronCoverage(ctxNoneFired);
  const details = r.details as {
    missing: Array<{
      path: string;
      evidence_table: string;
      evidence_source: string[];
      lookback_hours: number;
    }>;
  };
  for (const m of details.missing) {
    assert.equal(typeof m.evidence_table, "string");
    assert.ok(Array.isArray(m.evidence_source));
    assert.ok(m.lookback_hours > 0);
  }
  // dsbs-weekly-sweep, if missing, must have a 192h lookback (8d
  // override).
  const weekly = details.missing.find(
    (m) => m.path === "/api/cron/dsbs-weekly-sweep",
  );
  if (weekly) {
    assert.equal(weekly.lookback_hours, 8 * 24);
  }
});
