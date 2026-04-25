/**
 * Tests for lib/digest/fetch.ts.
 *
 * Mocked supabase client; assert exact .from() table targets and that
 * each per-section helper produces the expected shape.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  fetchHealthHeader,
  fetchCriticalItems,
  fetchScrapingSummary,
} from "../../lib/digest/fetch";

interface Call {
  table: string;
  ops: Array<{ op: string; args: unknown[] }>;
}

function recorderClient(scripted: Record<string, unknown>): { client: any; calls: Call[] } {
  const calls: Call[] = [];

  function builderFor(table: string): any {
    const call: Call = { table, ops: [] };
    calls.push(call);
    const data = scripted[table];
    const chain: any = {
      _data: data,
    };
    const ops = ["select", "eq", "neq", "gte", "lt", "gt", "in", "is", "order", "limit"];
    for (const op of ops) {
      chain[op] = (...args: unknown[]) => {
        call.ops.push({ op, args });
        return chain;
      };
    }
    chain.maybeSingle = async () => {
      const arr = Array.isArray(data) ? data : [];
      return { data: arr[0] ?? null, error: null };
    };
    chain.single = async () => {
      const arr = Array.isArray(data) ? data : [];
      return { data: arr[0] ?? null, error: null };
    };
    chain.then = (resolve: (v: any) => void) => {
      const arr = Array.isArray(data) ? data : [];
      resolve({ data: arr, error: null, count: arr.length });
    };
    return chain;
  }
  return {
    calls,
    client: { from: (table: string) => builderFor(table) },
  };
}

test("fetchHealthHeader: today rows present → not stale, picks latest run_id", async () => {
  const now = new Date("2026-04-24T13:00:00Z");
  const rows = [
    { run_id: "r2", check_name: "cron_coverage", status: "green", metric: 0, threshold: 0, details: null, created_at: "2026-04-24T12:00:00Z" },
    { run_id: "r2", check_name: "p_route_timeouts", status: "green", metric: 0, threshold: 0.1, details: null, created_at: "2026-04-24T12:00:00Z" },
    { run_id: "r1", check_name: "cron_coverage", status: "yellow", metric: 1, threshold: 0, details: null, created_at: "2026-04-24T11:00:00Z" },
  ];
  const { client, calls } = recorderClient({ health_checks: rows });
  const h = await fetchHealthHeader(client, now);
  assert.equal(h.stale, false);
  assert.equal(h.runId, "r2");
  assert.equal(h.checks.length, 2);
  assert.equal(h.greenCount, 2);
  assert.equal(h.rollup, "green");
  assert.equal(calls[0].table, "health_checks");
  // Should at least call .gte() for the day boundary.
  assert.ok(calls[0].ops.some((o) => o.op === "gte"));
});

test("fetchHealthHeader: empty today triggers fallback path (stale)", async () => {
  const now = new Date("2026-04-24T13:00:00Z");
  // First call returns empty; second call (fallback) returns yesterday data.
  // Our recorder gives same data for every from('health_checks'). So return [].
  const { client } = recorderClient({ health_checks: [] });
  const h = await fetchHealthHeader(client, now);
  assert.equal(h.stale, true);
  assert.equal(h.rollup, "stale");
  assert.equal(h.checks.length, 0);
});

test("fetchCriticalItems: queries cron_alerts with severity in [error,critical] and acked_at IS NULL", async () => {
  const now = new Date("2026-04-24T13:00:00Z");
  const alerts = [
    { id: 41, severity: "error", source: "scrape-states", message: "warn", created_at: "2026-04-23T10:00:00Z", run_id: "x" },
  ];
  const { client, calls } = recorderClient({ cron_alerts: alerts });
  const out = await fetchCriticalItems(client, now, [
    { name: "cron_coverage", status: "red", metric: 1, threshold: 0, details: null, created_at: "2026-04-24T12:00:00Z" } as any,
  ]);
  assert.equal(out.alerts.length, 1);
  assert.equal(out.alerts[0].id, 41);
  assert.equal(out.reds.length, 1);
  assert.equal(out.capped, false);
  assert.equal(calls[0].table, "cron_alerts");
  assert.ok(calls[0].ops.some((o) => o.op === "in" && Array.isArray(o.args[1])));
  assert.ok(calls[0].ops.some((o) => o.op === "is"));
  assert.ok(calls[0].ops.some((o) => o.op === "gte"));
});

test("fetchScrapingSummary: aggregates by source, sorts failures-desc", async () => {
  const now = new Date("2026-04-24T13:00:00Z");
  const runs = [
    { source: "a", status: "success", opportunities_found: 10, matches_created: 1, started_at: "2026-04-23T10:00:00Z" },
    { source: "a", status: "failed", opportunities_found: 0, matches_created: 0, started_at: "2026-04-23T11:00:00Z" },
    { source: "b", status: "success", opportunities_found: 5, matches_created: 0, started_at: "2026-04-23T12:00:00Z" },
    { source: "b", status: "failed", opportunities_found: 0, matches_created: 0, started_at: "2026-04-23T12:30:00Z" },
    { source: "b", status: "failed", opportunities_found: 0, matches_created: 0, started_at: "2026-04-23T13:00:00Z" },
  ];
  const { client, calls } = recorderClient({ scraper_runs: runs });
  const s = await fetchScrapingSummary(client, now);
  assert.equal(calls[0].table, "scraper_runs");
  assert.equal(s.rows.length, 2);
  // b has more failures so should sort first
  assert.equal(s.rows[0].source, "b");
  assert.equal(s.rows[0].fail, 2);
  assert.equal(s.rows[0].ok, 1);
  assert.equal(s.totalRuns, 5);
  assert.equal(s.totalOpps, 15);
  assert.equal(s.totalMatches, 1);
});

test("fetchScrapingSummary: returns empty totals when no runs", async () => {
  const now = new Date("2026-04-24T13:00:00Z");
  const { client } = recorderClient({ scraper_runs: [] });
  const s = await fetchScrapingSummary(client, now);
  assert.equal(s.rows.length, 0);
  assert.equal(s.totalRuns, 0);
});
