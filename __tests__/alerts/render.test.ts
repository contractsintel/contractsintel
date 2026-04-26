/**
 * Tests for lib/alerts/render.ts.
 *
 * Single, batched, storm-summary, HTML escape, null context, footer present.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

process.env.ALERT_ACK_SECRET = "test-ack-secret-do-not-use-in-prod";

import { renderBatched, renderSingle, renderStormSummary } from "../../lib/alerts/render";
import type { PendingAlert } from "../../lib/alerts/types";

const DISPATCHER_RUN = "abcd1234-5678-9abc-def0-1234567890ab";
const BASE = "https://contractsintel.com";
const TS = 1_745_510_400;

function mkAlert(overrides: Partial<PendingAlert> = {}): PendingAlert {
  return {
    id: 41,
    created_at: "2026-04-24T14:08:21Z",
    severity: "critical",
    source: "scrape-states",
    message: "still silent — 0 rows in 24h",
    context: { rows_24h: 0, last_run: "2026-04-23T14:00:00Z" },
    run_id: "run-aabbccdd",
    acked_at: null,
    ...overrides,
  };
}

/* ===================== single ===================== */

test("single: subject prefix and shape", () => {
  const r = renderSingle({ alerts: [mkAlert()], dispatcherRunId: DISPATCHER_RUN, baseUrl: BASE, ts: TS });
  assert.equal(r.mode, "single");
  assert.match(r.subject, /^\[CI-ALERT\] critical · scrape-states · /);
  assert.ok(r.subject.length <= 78, `subject too long: ${r.subject.length}`);
});

test("single: subject truncates long messages to ~60 chars", () => {
  const long = "x".repeat(200);
  const r = renderSingle({
    alerts: [mkAlert({ message: long })],
    dispatcherRunId: DISPATCHER_RUN,
    baseUrl: BASE,
    ts: TS,
  });
  assert.ok(r.subject.length <= 78);
});

test("single: ack url contains id, ts, r, sig", () => {
  const r = renderSingle({ alerts: [mkAlert()], dispatcherRunId: DISPATCHER_RUN, baseUrl: BASE, ts: TS });
  assert.match(r.ackUrl, /\/api\/alerts\/ack\?id=41&ts=1745510400&r=abcd1234&sig=[0-9a-f]{64}$/);
});

test("single: html contains severity badge red and ack button", () => {
  const r = renderSingle({ alerts: [mkAlert()], dispatcherRunId: DISPATCHER_RUN, baseUrl: BASE, ts: TS });
  assert.match(r.html, /background:#dc2626/);
  assert.match(r.html, /Acknowledge/);
});

test("single: footer mentions 7-day expiry + SQL fallback in HTML", () => {
  const r = renderSingle({ alerts: [mkAlert()], dispatcherRunId: DISPATCHER_RUN, baseUrl: BASE, ts: TS });
  assert.match(r.html, /Ack links expire after 7 days/);
  assert.match(r.html, /UPDATE cron_alerts SET acked_at = now\(\) WHERE id IN/);
});

test("single: footer present in plain text", () => {
  const r = renderSingle({ alerts: [mkAlert()], dispatcherRunId: DISPATCHER_RUN, baseUrl: BASE, ts: TS });
  assert.match(r.text, /Ack links expire after 7 days/);
  assert.match(r.text, /UPDATE cron_alerts SET acked_at = now\(\) WHERE id IN/);
});

test("single: HTML-escapes adversarial message", () => {
  const r = renderSingle({
    alerts: [mkAlert({ message: '<script>alert("x")</script> & friends' })],
    dispatcherRunId: DISPATCHER_RUN,
    baseUrl: BASE,
    ts: TS,
  });
  assert.doesNotMatch(r.html, /<script>/);
  assert.match(r.html, /&lt;script&gt;/);
  assert.match(r.html, /&amp; friends/);
});

test("single: null context renders without context block", () => {
  const r = renderSingle({
    alerts: [mkAlert({ context: null })],
    dispatcherRunId: DISPATCHER_RUN,
    baseUrl: BASE,
    ts: TS,
  });
  assert.doesNotMatch(r.html, /Context preview/);
});

test("single: dispatcher run id (first 8) appears in body", () => {
  const r = renderSingle({ alerts: [mkAlert()], dispatcherRunId: DISPATCHER_RUN, baseUrl: BASE, ts: TS });
  assert.match(r.html, /abcd1234/);
});

/* ===================== batched ===================== */

test("batched: 3 alerts produces table + ack-all", () => {
  const alerts = [mkAlert({ id: 41 }), mkAlert({ id: 42, severity: "error" }), mkAlert({ id: 43 })];
  const r = renderBatched({ alerts, dispatcherRunId: DISPATCHER_RUN, baseUrl: BASE, ts: TS });
  assert.equal(r.mode, "batched");
  assert.equal(r.subject, "[CI-ALERT] 3 critical/error events in last 5 min");
  assert.match(r.ackUrl, /ids=41,42,43/);
  assert.deepEqual(r.alertIds, [41, 42, 43]);
  assert.match(r.html, /#41/);
  assert.match(r.html, /#42/);
  assert.match(r.html, /#43/);
});

test("batched: footer present", () => {
  const r = renderBatched({
    alerts: [mkAlert({ id: 41 }), mkAlert({ id: 42 })],
    dispatcherRunId: DISPATCHER_RUN,
    baseUrl: BASE,
    ts: TS,
  });
  assert.match(r.html, /Ack links expire after 7 days/);
  assert.match(r.text, /Ack links expire after 7 days/);
});

test("batched: HTML escape applies to source/message in table rows", () => {
  const r = renderBatched({
    alerts: [
      mkAlert({ id: 41, source: "<evil>", message: "<x>" }),
      mkAlert({ id: 42, source: "ok", message: "ok" }),
    ],
    dispatcherRunId: DISPATCHER_RUN,
    baseUrl: BASE,
    ts: TS,
  });
  assert.doesNotMatch(r.html, /<evil>/);
  assert.match(r.html, /&lt;evil&gt;/);
});

/* ===================== storm ===================== */

test("storm: 15 alerts subject + top-10 cap", () => {
  const alerts = Array.from({ length: 15 }, (_, i) => mkAlert({ id: 100 + i }));
  const r = renderStormSummary({ alerts, dispatcherRunId: DISPATCHER_RUN, baseUrl: BASE, ts: TS });
  assert.equal(r.mode, "storm-summary");
  assert.equal(r.subject, "[CI-ALERT] STORM — 15 events in last 5 min (showing top 10)");
  assert.equal(r.alertIds.length, 15);
  // Top 10 ids #100..#109 present, #110+ trailing copy mentions remainder.
  assert.match(r.html, /#100/);
  assert.match(r.html, /#109/);
  assert.match(r.html, /…and 5 more/);
});

test("storm: throws when called with ≤10 alerts", () => {
  const alerts = Array.from({ length: 5 }, (_, i) => mkAlert({ id: i + 1 }));
  assert.throws(() =>
    renderStormSummary({ alerts, dispatcherRunId: DISPATCHER_RUN, baseUrl: BASE, ts: TS }),
  );
});

test("renderSingle throws when count ≠ 1", () => {
  assert.throws(() =>
    renderSingle({ alerts: [mkAlert(), mkAlert({ id: 2 })], dispatcherRunId: DISPATCHER_RUN, baseUrl: BASE, ts: TS }),
  );
});

test("renderBatched throws when count < 2", () => {
  assert.throws(() =>
    renderBatched({ alerts: [mkAlert()], dispatcherRunId: DISPATCHER_RUN, baseUrl: BASE, ts: TS }),
  );
});
