/**
 * Tests for lib/digest/render.ts.
 *
 * Verify subject string, color codes, section headers present, sparkline mapping,
 * and edge cases (empty universe, empty actions, stale).
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { renderDigest } from "../../lib/digest/render";
import type { DigestData } from "../../lib/digest/types";

function baseData(overrides: Partial<DigestData> = {}): DigestData {
  return {
    runId: "test-run-id-1234567890",
    generatedAt: "2026-04-24T12:07:00Z",
    dateUtc: "2026-04-24",
    health: {
      rollup: "green",
      runId: "abc12345",
      date: "2026-04-24",
      greenCount: 7,
      totalCount: 7,
      stale: false,
      checks: [],
    },
    critical: { alerts: [], reds: [], capped: false },
    scraping: {
      rows: [],
      totalRuns: 0,
      totalOk: 0,
      totalFail: 0,
      totalOpps: 0,
      totalMatches: 0,
    },
    certs: [],
    resources: [],
    sparklines: [],
    links: {
      vercel: "https://vercel.com/x",
      supabase: "https://supabase.com/dashboard/project/abc",
      instantly: "https://app.instantly.ai/app/campaigns",
      audit: "https://contractsintel.com/api/audit",
      healthchecks: null,
    },
    errors: [],
    ...overrides,
  };
}

test("subject includes date and rollup color word", () => {
  const r = renderDigest(baseData());
  assert.equal(r.subject, "[ContractsIntel] Daily Digest — 2026-04-24 — green");
});

test("green rollup uses #16a34a banner color", () => {
  const r = renderDigest(baseData());
  assert.match(r.html, /background:#16a34a/);
  assert.match(r.html, /System Health: GREEN/);
});

test("yellow rollup uses #d97706 banner color", () => {
  const r = renderDigest(
    baseData({
      health: {
        rollup: "yellow",
        runId: null,
        date: "2026-04-24",
        greenCount: 5,
        totalCount: 7,
        stale: false,
        checks: [],
      },
    }),
  );
  assert.match(r.html, /background:#d97706/);
  assert.match(r.html, /YELLOW/);
});

test("red rollup uses #dc2626 banner color", () => {
  const r = renderDigest(
    baseData({
      health: {
        rollup: "red",
        runId: null,
        date: "2026-04-24",
        greenCount: 4,
        totalCount: 7,
        stale: false,
        checks: [],
      },
    }),
  );
  assert.match(r.html, /background:#dc2626/);
});

test("stale rollup shows stale banner color and message", () => {
  const r = renderDigest(
    baseData({
      health: {
        rollup: "stale",
        runId: null,
        date: "2026-04-24",
        greenCount: 0,
        totalCount: 7,
        stale: true,
        checks: [],
      },
    }),
  );
  assert.match(r.html, /background:#64748b/);
  assert.match(r.html, /stale data/);
});

test("empty critical items section shows 'None'", () => {
  const r = renderDigest(baseData());
  assert.match(r.html, /No critical items/);
  assert.match(r.text, /None\. All clear\./);
});

test("section headers are present in HTML", () => {
  const r = renderDigest(baseData());
  assert.match(r.html, /Critical items/);
  assert.match(r.html, /Yesterday's scraping/);
  assert.match(r.html, /Pipeline progress/);
  assert.match(r.html, /Resources/);
  assert.match(r.html, /7-day trend/);
});

test("empty universe renders 'No leads yet' instead of dividing by zero", () => {
  const r = renderDigest(
    baseData({
      certs: [
        {
          cert: "wosb",
          stage: "ingest",
          stageStartedAt: null,
          lastTickAt: null,
          mode: "delta",
          rowsThisStage: 0,
          lastError: null,
          verifiedYesterday: 0,
          cumulative: 0,
          universe: 0,
        },
      ],
    }),
  );
  assert.match(r.html, /No leads yet/);
  assert.match(r.text, /No leads yet/);
});

test("populated universe renders cumulative/universe with percent", () => {
  const r = renderDigest(
    baseData({
      certs: [
        {
          cert: "wosb",
          stage: "verify",
          stageStartedAt: null,
          lastTickAt: "2026-04-24T11:50:00Z",
          mode: "delta",
          rowsThisStage: 50,
          lastError: null,
          verifiedYesterday: 12,
          cumulative: 250,
          universe: 1000,
        },
      ],
    }),
  );
  assert.match(r.html, /250\/1000 \(25\.0%\)/);
});

test("sparklines render with monospace pre block in HTML", () => {
  const r = renderDigest(
    baseData({
      sparklines: [
        { name: "cron_coverage", chars: "▁▁▁▁▁▁▁" },
        { name: "p_route_timeouts", chars: "▁▁▄▁▁▁▁" },
      ],
    }),
  );
  assert.match(r.html, /<pre /);
  assert.match(r.html, /cron_coverage/);
  assert.match(r.html, /▁▁▄▁▁▁▁/);
});

test("footer includes run_id for traceability", () => {
  const r = renderDigest(baseData());
  assert.match(r.html, /run_id: test-run-id-1234567890/);
  assert.match(r.text, /run_id: test-run-id-1234567890/);
});

test("text twin contains all section markers", () => {
  const r = renderDigest(
    baseData({
      sparklines: [{ name: "cron_coverage", chars: "▁▁▁▁▁▁▁" }],
    }),
  );
  assert.match(r.text, /CRITICAL ITEMS/);
  assert.match(r.text, /YESTERDAY'S SCRAPING/);
  assert.match(r.text, /PIPELINE PROGRESS/);
  assert.match(r.text, /RESOURCES/);
  assert.match(r.text, /7-DAY TREND/);
});

test("all-sections-populated renders without error", () => {
  const r = renderDigest(
    baseData({
      health: {
        rollup: "yellow",
        runId: "run-y",
        date: "2026-04-24",
        greenCount: 5,
        totalCount: 7,
        stale: false,
        checks: [
          { name: "cron_coverage", status: "green", metric: 0, threshold: 0, details: null, created_at: "2026-04-24T11:00:00Z" },
        ],
      },
      critical: {
        alerts: [
          { id: 41, severity: "error", source: "scrape-states", message: "states scraper warn", created_at: "2026-04-24T08:00:00Z", run_id: "r1" },
        ],
        reds: [],
        capped: false,
      },
      scraping: {
        rows: [
          { source: "scrape-federal", runs: 24, ok: 23, fail: 1, opps: 1500, matches: 12 },
        ],
        totalRuns: 24, totalOk: 23, totalFail: 1, totalOpps: 1500, totalMatches: 12,
      },
      certs: [
        {
          cert: "8a", stage: "verify", stageStartedAt: null, lastTickAt: "2026-04-24T11:00:00Z",
          mode: "delta", rowsThisStage: 100, lastError: null, verifiedYesterday: 5, cumulative: 800, universe: 5000,
        },
      ],
      resources: [
        { label: "NeverBounce credits", value: "10,000", status: "green" },
      ],
      sparklines: [
        { name: "cron_coverage", chars: "▁▁▁▁▁▁▁" },
      ],
    }),
  );
  assert.ok(r.html.length > 1000);
  assert.match(r.html, /scrape-states/);
  assert.match(r.html, /scrape-federal/);
});
