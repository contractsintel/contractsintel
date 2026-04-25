/**
 * Tests for lib/health/checks/supabase-health.ts.
 *
 * The runner does insert-then-select-then-delete on health_checks itself.
 * We mock those three calls and verify the classifier separately.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  runSupabaseHealth,
  classifySupabaseLatency,
} from "../../../lib/health/checks/supabase-health";
import type { HealthRunContext } from "../../../lib/health/types";

function mkSupabase(opts: { insertOk: boolean; readOk: boolean }): any {
  return {
    from: (_t: string) => ({
      insert: (_row: unknown) => ({
        select: (_: string) => ({
          single: () =>
            Promise.resolve(
              opts.insertOk
                ? { data: { id: 42 }, error: null }
                : { data: null, error: { message: "boom" } },
            ),
        }),
      }),
      select: (_: string) => ({
        eq: () => ({
          single: () =>
            Promise.resolve(
              opts.readOk
                ? { data: { id: 42 }, error: null }
                : { data: null, error: { message: "read-fail" } },
            ),
        }),
      }),
      delete: () => ({
        eq: () => Promise.resolve({ error: null }),
      }),
    }),
  };
}

test("classifySupabaseLatency: thresholds", () => {
  const t = { red: 2000, yellow: 800 };
  assert.equal(classifySupabaseLatency(0, t), "green");
  assert.equal(classifySupabaseLatency(800, t), "green");
  assert.equal(classifySupabaseLatency(801, t), "yellow");
  assert.equal(classifySupabaseLatency(2000, t), "yellow");
  assert.equal(classifySupabaseLatency(2001, t), "red");
});

test("supabase_health: insert+read succeed → green or yellow (low latency)", async () => {
  const ctx: HealthRunContext = {
    supabase: mkSupabase({ insertOk: true, readOk: true }),
    runId: "t",
  };
  const r = await runSupabaseHealth(ctx);
  // In tests latency is tiny, so green.
  assert.equal(r.status, "green");
  assert.equal(r.name, "supabase_health");
});

test("supabase_health: insert fails → throws (caller wraps to status='error')", async () => {
  const ctx: HealthRunContext = {
    supabase: mkSupabase({ insertOk: false, readOk: true }),
    runId: "t",
  };
  await assert.rejects(() => runSupabaseHealth(ctx), /probe insert failed/);
});

test("supabase_health: read fails → throws", async () => {
  const ctx: HealthRunContext = {
    supabase: mkSupabase({ insertOk: true, readOk: false }),
    runId: "t",
  };
  await assert.rejects(() => runSupabaseHealth(ctx), /probe read failed/);
});
