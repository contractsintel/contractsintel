/**
 * Sparkline rendering — text-only 7-day strip per check.
 *
 * Mapping:
 *   green   → ▁
 *   yellow  → ▄
 *   red     → █
 *   error   → ?
 *   missing → ' ' (space)
 */

import type { HealthStatus } from "@/lib/health/types";

export function statusToSparkChar(status: HealthStatus | null | undefined): string {
  switch (status) {
    case "green":
      return "▁";
    case "yellow":
      return "▄";
    case "red":
      return "█";
    case "error":
      return "?";
    default:
      return " ";
  }
}

export interface SparkInputRow {
  check_name: string;
  status: HealthStatus;
  created_at: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Bucket rows by (check_name, UTC day) and emit a 7-char strip per check.
 * `days` = number of days back, default 7.  Strip is oldest-on-left.
 * For each (check, day) pair we keep the LATEST status that day.
 */
export function renderSparkline(
  rows: readonly SparkInputRow[],
  days: number = 7,
  now: Date = new Date(),
): Map<string, string> {
  // Bucket "today" UTC-midnight as the rightmost slot.
  const todayUtc = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const startBucket = todayUtc.getTime() - (days - 1) * DAY_MS;

  // Key: check_name → array length=days of latest HealthStatus | null.
  const buckets = new Map<string, (HealthStatus | null)[]>();
  // Key: check_name|dayIdx → ts of selected sample (latest within the day).
  const lastTs = new Map<string, number>();

  for (const r of rows) {
    const ts = new Date(r.created_at).getTime();
    if (Number.isNaN(ts)) continue;
    const dayIdx = Math.floor((ts - startBucket) / DAY_MS);
    if (dayIdx < 0 || dayIdx >= days) continue;
    let arr = buckets.get(r.check_name);
    if (!arr) {
      arr = new Array(days).fill(null);
      buckets.set(r.check_name, arr);
    }
    const k = `${r.check_name}|${dayIdx}`;
    const prev = lastTs.get(k);
    if (prev === undefined || ts >= prev) {
      arr[dayIdx] = r.status;
      lastTs.set(k, ts);
    }
  }

  const out = new Map<string, string>();
  buckets.forEach((arr, name) => {
    out.set(name, arr.map((s: HealthStatus | null) => statusToSparkChar(s)).join(""));
  });
  return out;
}
