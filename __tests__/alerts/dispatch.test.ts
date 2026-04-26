/**
 * Tests for lib/alerts/dispatch.ts.
 *
 * - groupForSend mode selection
 * - fetchPending: anti-loop filter, severity filter, cursor
 * - sendWithRetry: retry-once semantics
 */

import { test } from "node:test";
import assert from "node:assert/strict";

process.env.ALERT_ACK_SECRET = "test-ack-secret-do-not-use-in-prod";

import {
  DISPATCHER_SOURCE,
  fetchPending,
  groupForSend,
  renderForMode,
  sendWithRetry,
} from "../../lib/alerts/dispatch";
import type { PendingAlert } from "../../lib/alerts/types";

/* ===================== mocks ===================== */

interface QueryCall {
  table: string;
  filters: Record<string, unknown>;
}

function mockSupabase(opts: {
  cursorRows?: Array<{ created_at: string }>;
  pendingRows?: PendingAlert[];
  recordedFilters?: QueryCall[];
}): any {
  return {
    from(table: string) {
      const filters: Record<string, unknown> = {};
      const call: QueryCall = { table, filters };
      opts.recordedFilters?.push(call);
      const builder: any = {
        select() { return builder; },
        eq(k: string, v: unknown) { filters[`eq:${k}`] = v; return builder; },
        neq(k: string, v: unknown) { filters[`neq:${k}`] = v; return builder; },
        in(k: string, v: unknown) { filters[`in:${k}`] = v; return builder; },
        is(k: string, v: unknown) { filters[`is:${k}`] = v; return builder; },
        gt(k: string, v: unknown) { filters[`gt:${k}`] = v; return builder; },
        order() { return builder; },
        async limit() {
          if (table === "alert_dispatches") {
            return { data: opts.cursorRows ?? [], error: null };
          }
          if (table === "cron_alerts") {
            return { data: opts.pendingRows ?? [], error: null };
          }
          return { data: [], error: null };
        },
      };
      return builder;
    },
  };
}

function mkAlert(overrides: Partial<PendingAlert> = {}): PendingAlert {
  return {
    id: 1,
    created_at: "2026-04-24T12:00:00Z",
    severity: "critical",
    source: "scrape-states",
    message: "msg",
    context: null,
    run_id: null,
    acked_at: null,
    ...overrides,
  };
}

/* ===================== groupForSend ===================== */

test("groupForSend: 0 → null", () => assert.equal(groupForSend([]), null));
test("groupForSend: 1 → single", () => assert.equal(groupForSend([mkAlert()]), "single"));
test("groupForSend: 5 → batched", () => {
  const a = Array.from({ length: 5 }, (_, i) => mkAlert({ id: i + 1 }));
  assert.equal(groupForSend(a), "batched");
});
test("groupForSend: 10 → batched (boundary)", () => {
  const a = Array.from({ length: 10 }, (_, i) => mkAlert({ id: i + 1 }));
  assert.equal(groupForSend(a), "batched");
});
test("groupForSend: 11 → storm-summary", () => {
  const a = Array.from({ length: 11 }, (_, i) => mkAlert({ id: i + 1 }));
  assert.equal(groupForSend(a), "storm-summary");
});
test("groupForSend: 60 → storm-summary", () => {
  const a = Array.from({ length: 60 }, (_, i) => mkAlert({ id: i + 1 }));
  assert.equal(groupForSend(a), "storm-summary");
});

/* ===================== fetchPending ===================== */

test("fetchPending: empty cursor + empty alerts → []", async () => {
  const sb = mockSupabase({});
  const out = await fetchPending(sb);
  assert.deepEqual(out, []);
});

test("fetchPending: applies anti-loop + severity filters", async () => {
  const recorded: QueryCall[] = [];
  const sb = mockSupabase({
    cursorRows: [{ created_at: "2026-04-24T11:00:00Z" }],
    pendingRows: [mkAlert({ id: 41 })],
    recordedFilters: recorded,
  });
  const out = await fetchPending(sb);
  assert.equal(out.length, 1);
  assert.equal(out[0].id, 41);

  // Find the cron_alerts query.
  const cronCall = recorded.find((c) => c.table === "cron_alerts");
  assert.ok(cronCall, "expected a cron_alerts query");
  assert.deepEqual(cronCall!.filters["in:severity"], ["error", "critical"]);
  assert.equal(cronCall!.filters["neq:source"], DISPATCHER_SOURCE);
  assert.equal(cronCall!.filters["is:acked_at"], null);
  assert.equal(cronCall!.filters["gt:created_at"], "2026-04-24T11:00:00Z");
});

/* ===================== renderForMode ===================== */

test("renderForMode dispatches to single/batched/storm correctly", () => {
  const single = renderForMode({
    alerts: [mkAlert({ id: 1 })],
    dispatcherRunId: "abcd1234-0000-0000-0000-000000000000",
    baseUrl: "https://x.test",
    ts: 1745510400,
  });
  assert.equal(single.mode, "single");

  const batched = renderForMode({
    alerts: [mkAlert({ id: 1 }), mkAlert({ id: 2 })],
    dispatcherRunId: "abcd1234-0000-0000-0000-000000000000",
    baseUrl: "https://x.test",
    ts: 1745510400,
  });
  assert.equal(batched.mode, "batched");

  const stormAlerts = Array.from({ length: 12 }, (_, i) => mkAlert({ id: i + 1 }));
  const storm = renderForMode({
    alerts: stormAlerts,
    dispatcherRunId: "abcd1234-0000-0000-0000-000000000000",
    baseUrl: "https://x.test",
    ts: 1745510400,
  });
  assert.equal(storm.mode, "storm-summary");
});

test("renderForMode throws on empty", () => {
  assert.throws(() =>
    renderForMode({
      alerts: [],
      dispatcherRunId: "abcd1234-0000-0000-0000-000000000000",
      baseUrl: "https://x.test",
      ts: 1,
    }),
  );
});

/* ===================== sendWithRetry ===================== */

function fakeRendered(): any {
  return {
    subject: "[CI-ALERT] test",
    html: "<p>x</p>",
    text: "x",
    ackUrl: "https://x.test/ack",
    alertIds: [1],
    mode: "single",
  };
}

test("sendWithRetry: success on first try", async () => {
  let calls = 0;
  const resend: any = {
    emails: {
      async send() {
        calls++;
        return { data: { id: "rs-1" } };
      },
    },
  };
  const r = await sendWithRetry(resend, "from@x", "to@x", fakeRendered());
  assert.equal(r.ok, true);
  assert.equal(r.attempt, 1);
  assert.equal(r.resendId, "rs-1");
  assert.equal(calls, 1);
});

test("sendWithRetry: success on second try", async () => {
  let calls = 0;
  const resend: any = {
    emails: {
      async send() {
        calls++;
        if (calls === 1) return { error: { message: "transient" } };
        return { data: { id: "rs-2" } };
      },
    },
  };
  const r = await sendWithRetry(resend, "from@x", "to@x", fakeRendered());
  assert.equal(r.ok, true);
  assert.equal(r.attempt, 2);
  assert.equal(r.resendId, "rs-2");
  assert.equal(calls, 2);
});

test("sendWithRetry: failure after two attempts", async () => {
  let calls = 0;
  const resend: any = {
    emails: {
      async send() {
        calls++;
        return { error: { message: `boom-${calls}` } };
      },
    },
  };
  const r = await sendWithRetry(resend, "from@x", "to@x", fakeRendered());
  assert.equal(r.ok, false);
  assert.equal(r.attempt, 2);
  assert.equal(r.error, "boom-2");
  assert.equal(calls, 2);
});

test("sendWithRetry: thrown error counted as failure", async () => {
  let calls = 0;
  const resend: any = {
    emails: {
      async send() {
        calls++;
        throw new Error(`thrown-${calls}`);
      },
    },
  };
  const r = await sendWithRetry(resend, "from@x", "to@x", fakeRendered());
  assert.equal(r.ok, false);
  assert.equal(r.attempt, 2);
  assert.match(String(r.error), /thrown-2/);
});
