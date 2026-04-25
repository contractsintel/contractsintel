/**
 * Tests for lib/health/checks/sam-sbs-failures.ts.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  runSamSbsFailures,
  classifySamSbsRate,
} from "../../../lib/health/checks/sam-sbs-failures";
import type { HealthRunContext } from "../../../lib/health/types";

function mkSupabase(rows: Array<{ source: string; status: string }>): any {
  return {
    from: () => ({
      select: () => ({
        in: () => ({
          gte: () => Promise.resolve({ data: rows, error: null }),
        }),
      }),
    }),
  };
}

test("classifySamSbsRate: thresholds", () => {
  const t = { red: 25, yellow: 10 };
  assert.equal(classifySamSbsRate(0, t), "green");
  assert.equal(classifySamSbsRate(10, t), "green");
  assert.equal(classifySamSbsRate(11, t), "yellow");
  assert.equal(classifySamSbsRate(25, t), "yellow");
  assert.equal(classifySamSbsRate(26, t), "red");
});

test("sam_sbs_failures: empty → yellow no_data", async () => {
  const ctx: HealthRunContext = { supabase: mkSupabase([]), runId: "t" };
  const r = await runSamSbsFailures(ctx);
  assert.equal(r.status, "yellow");
  assert.equal((r.details as { reason: string }).reason, "no_data");
});

test("sam_sbs_failures: all success → green", async () => {
  const rows = Array(10).fill({ source: "sam_gov", status: "success" });
  const ctx: HealthRunContext = { supabase: mkSupabase(rows), runId: "t" };
  const r = await runSamSbsFailures(ctx);
  assert.equal(r.status, "green");
  assert.equal(r.metric, 0);
});

test("sam_sbs_failures: 30% failure (>25) → red", async () => {
  const rows = [
    ...Array(7).fill({ source: "dsbs", status: "success" }),
    ...Array(3).fill({ source: "dsbs", status: "error" }),
  ];
  const ctx: HealthRunContext = { supabase: mkSupabase(rows), runId: "t" };
  const r = await runSamSbsFailures(ctx);
  assert.equal(r.status, "red");
  assert.equal(r.metric, 30);
});
