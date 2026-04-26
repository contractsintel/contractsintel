/**
 * HMAC-SHA256 sign/verify for one-click ack links (PR 5).
 *
 * Payload format: `{idsSorted.join(",")}.${ts}.${runIdShort}`
 *
 * - `ts` is unix seconds. Verifier rejects ts older than 7 days.
 * - `runIdShort` is the first 8 hex chars of the dispatcher run_id.
 * - Constant-time comparison via timingSafeEqual.
 *
 * Throws if ALERT_ACK_SECRET is not configured. The dispatcher route
 * MUST fail-closed before render if the secret is missing.
 *
 * See docs/architecture/pr5-alert-dispatcher-plan.md §5.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

export const ACK_TTL_SECONDS = 7 * 24 * 60 * 60;

function secret(): string {
  const s = process.env.ALERT_ACK_SECRET;
  if (!s) throw new Error("ALERT_ACK_SECRET not configured");
  return s;
}

function payload(ids: number[], ts: number, runIdShort: string): string {
  const sorted = [...ids].sort((a, b) => a - b).join(",");
  return `${sorted}.${ts}.${runIdShort}`;
}

export function signAck(ids: number[], ts: number, runIdShort: string): string {
  return createHmac("sha256", secret()).update(payload(ids, ts, runIdShort)).digest("hex");
}

export function verifyAck(
  ids: number[],
  ts: number,
  runIdShort: string,
  sig: string,
): boolean {
  let expected: string;
  try {
    expected = signAck(ids, ts, runIdShort);
  } catch {
    return false;
  }
  if (typeof sig !== "string" || sig.length !== expected.length) return false;
  let a: Buffer;
  let b: Buffer;
  try {
    a = Buffer.from(sig, "hex");
    b = Buffer.from(expected, "hex");
  } catch {
    return false;
  }
  if (a.length !== b.length || a.length === 0) return false;
  return timingSafeEqual(a, b);
}

/**
 * Return true when the timestamp is within the 7-day TTL relative to `now`
 * (unix seconds). A future ts within a small skew is also accepted.
 */
export function isFresh(ts: number, nowSec: number = Math.floor(Date.now() / 1000)): boolean {
  if (!Number.isFinite(ts)) return false;
  const age = nowSec - ts;
  if (age > ACK_TTL_SECONDS) return false;
  if (age < -300) return false; // tolerate up to 5m clock skew
  return true;
}
