/**
 * Tests for lib/digest/sparkline.ts.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { statusToSparkChar, renderSparkline } from "../../lib/digest/sparkline";

test("statusToSparkChar: maps statuses to characters", () => {
  assert.equal(statusToSparkChar("green"), "▁");
  assert.equal(statusToSparkChar("yellow"), "▄");
  assert.equal(statusToSparkChar("red"), "█");
  assert.equal(statusToSparkChar("error"), "?");
  assert.equal(statusToSparkChar(null), " ");
  assert.equal(statusToSparkChar(undefined), " ");
});

test("renderSparkline: emits 7-char strip aligned to today UTC, oldest left", () => {
  const now = new Date("2026-04-24T15:00:00Z");
  // Day 0 = 6 days ago = 2026-04-18
  // Day 6 = today        = 2026-04-24
  const rows = [
    { check_name: "cron_coverage", status: "green" as const, created_at: "2026-04-18T11:00:00Z" },
    { check_name: "cron_coverage", status: "green" as const, created_at: "2026-04-19T11:00:00Z" },
    // Skip 04-20 (gap)
    { check_name: "cron_coverage", status: "yellow" as const, created_at: "2026-04-21T11:00:00Z" },
    { check_name: "cron_coverage", status: "red" as const, created_at: "2026-04-22T11:00:00Z" },
    { check_name: "cron_coverage", status: "green" as const, created_at: "2026-04-23T11:00:00Z" },
    { check_name: "cron_coverage", status: "green" as const, created_at: "2026-04-24T11:00:00Z" },
  ];
  const out = renderSparkline(rows, 7, now);
  // Expected: ▁▁ ▄█▁▁ — but actual char at gap index is space (' ').
  assert.equal(out.get("cron_coverage"), "▁▁ ▄█▁▁");
});

test("renderSparkline: latest sample within a day wins", () => {
  const now = new Date("2026-04-24T15:00:00Z");
  const rows = [
    { check_name: "x", status: "green" as const, created_at: "2026-04-24T05:00:00Z" },
    { check_name: "x", status: "red" as const, created_at: "2026-04-24T14:00:00Z" },
  ];
  const out = renderSparkline(rows, 7, now);
  const s = out.get("x")!;
  assert.equal(s.length, 7);
  assert.equal(s[6], "█");
});

test("renderSparkline: drops rows outside window", () => {
  const now = new Date("2026-04-24T15:00:00Z");
  const rows = [
    { check_name: "x", status: "green" as const, created_at: "2026-01-01T00:00:00Z" },
  ];
  const out = renderSparkline(rows, 7, now);
  assert.equal(out.has("x"), false);
});
