/**
 * Tests for lib/health/checks/pipeline-stalls.ts.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  runPipelineStalls,
  classifyStallHours,
} from "../../../lib/health/checks/pipeline-stalls";
import type { HealthRunContext } from "../../../lib/health/types";

function mkSupabase(
  rows: Array<{ cert: string; stage: string; stage_started_at: string | null }>,
): any {
  return {
    from: () => ({
      select: () => ({
        neq: () => Promise.resolve({ data: rows, error: null }),
      }),
    }),
  };
}

function hoursAgo(h: number): string {
  return new Date(Date.now() - h * 60 * 60 * 1000).toISOString();
}

test("classifyStallHours: thresholds", () => {
  const t = { red: 24, yellow: 6 };
  assert.equal(classifyStallHours(0, t), "green");
  assert.equal(classifyStallHours(5.99, t), "green");
  assert.equal(classifyStallHours(6, t), "yellow");
  assert.equal(classifyStallHours(23.99, t), "yellow");
  assert.equal(classifyStallHours(24, t), "red");
  assert.equal(classifyStallHours(48, t), "red");
});

test("pipeline_stalls: no non-done rows → green", async () => {
  const ctx: HealthRunContext = { supabase: mkSupabase([]), runId: "t" };
  const r = await runPipelineStalls(ctx);
  assert.equal(r.status, "green");
  assert.equal(r.metric, 0);
});

test("pipeline_stalls: all fresh (started <6h ago) → green", async () => {
  const ctx: HealthRunContext = {
    supabase: mkSupabase([
      { cert: "hubzone", stage: "enrich", stage_started_at: hoursAgo(2) },
      { cert: "sdvosb", stage: "ingest", stage_started_at: hoursAgo(1) },
    ]),
    runId: "t",
  };
  const r = await runPipelineStalls(ctx);
  assert.equal(r.status, "green");
});

test("pipeline_stalls: one cert stuck 8h → yellow", async () => {
  const ctx: HealthRunContext = {
    supabase: mkSupabase([
      { cert: "hubzone", stage: "crawl", stage_started_at: hoursAgo(8) },
    ]),
    runId: "t",
  };
  const r = await runPipelineStalls(ctx);
  assert.equal(r.status, "yellow");
  assert.ok((r.metric as number) >= 6 && (r.metric as number) < 24);
});

test("pipeline_stalls: cert stuck 30h → red", async () => {
  const ctx: HealthRunContext = {
    supabase: mkSupabase([
      { cert: "wosb", stage: "verify_submit", stage_started_at: hoursAgo(30) },
    ]),
    runId: "t",
  };
  const r = await runPipelineStalls(ctx);
  assert.equal(r.status, "red");
  const d = r.details as { stalled: Array<{ cert: string }> };
  assert.equal(d.stalled[0].cert, "wosb");
});
