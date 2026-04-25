/**
 * Tests for lib/health/checks/p-route-timeouts.ts.
 *
 * Covers the classifier (pure) and the runner with mocked supabase.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  runPRouteTimeouts,
  classifyTimeoutRate,
} from "../../../lib/health/checks/p-route-timeouts";
import type { HealthRunContext } from "../../../lib/health/types";

function mkSupabase(rows: Array<{ source: string; status: string }>): any {
  return {
    from: () => ({
      select: () => ({
        or: () => ({
          gte: () => Promise.resolve({ data: rows, error: null }),
        }),
      }),
    }),
  };
}

test("classifyTimeoutRate: thresholds", () => {
  const t = { red: 30, yellow: 10 };
  assert.equal(classifyTimeoutRate(0, t), "green");
  assert.equal(classifyTimeoutRate(10, t), "green"); // exactly 10 → green
  assert.equal(classifyTimeoutRate(10.01, t), "yellow");
  assert.equal(classifyTimeoutRate(30, t), "yellow"); // exactly 30 → yellow
  assert.equal(classifyTimeoutRate(30.01, t), "red");
});

test("p_route_timeouts: empty data → yellow with no_data reason", async () => {
  const ctx: HealthRunContext = { supabase: mkSupabase([]), runId: "t" };
  const r = await runPRouteTimeouts(ctx);
  assert.equal(r.status, "yellow");
  assert.equal((r.details as { reason: string }).reason, "no_data");
});

test("p_route_timeouts: all success → green", async () => {
  const rows = Array(20).fill({ source: "scrape-grants-p1", status: "success" });
  const ctx: HealthRunContext = { supabase: mkSupabase(rows), runId: "t" };
  const r = await runPRouteTimeouts(ctx);
  assert.equal(r.status, "green");
  assert.equal(r.metric, 0);
});

test("p_route_timeouts: 50% failure → red (default red=30)", async () => {
  const rows = [
    ...Array(5).fill({ source: "scrape-usa-p1", status: "success" }),
    ...Array(5).fill({ source: "scrape-usa-p1", status: "error" }),
  ];
  const ctx: HealthRunContext = { supabase: mkSupabase(rows), runId: "t" };
  const r = await runPRouteTimeouts(ctx);
  assert.equal(r.status, "red");
  assert.equal(r.metric, 50);
});

test("p_route_timeouts: 15% failure → yellow", async () => {
  const rows = [
    ...Array(85).fill({ source: "scrape-grants-p2", status: "success" }),
    ...Array(15).fill({ source: "scrape-grants-p2", status: "error" }),
  ];
  const ctx: HealthRunContext = { supabase: mkSupabase(rows), runId: "t" };
  const r = await runPRouteTimeouts(ctx);
  assert.equal(r.status, "yellow");
  assert.equal(r.metric, 15);
});
