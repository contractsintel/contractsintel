/**
 * Tests for lib/alerts/sign.ts.
 *
 * HMAC roundtrip, tamper detection, 7d expiry, missing-secret throws.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

process.env.ALERT_ACK_SECRET = "test-ack-secret-do-not-use-in-prod";

import { ACK_TTL_SECONDS, isFresh, signAck, verifyAck } from "../../lib/alerts/sign";

const RUN = "abcd1234";

test("signAck → verifyAck roundtrip (single id)", () => {
  const ts = Math.floor(Date.now() / 1000);
  const sig = signAck([41], ts, RUN);
  assert.equal(typeof sig, "string");
  assert.equal(sig.length, 64); // sha256 hex
  assert.equal(verifyAck([41], ts, RUN, sig), true);
});

test("signAck → verifyAck roundtrip (multiple ids, order-independent)", () => {
  const ts = Math.floor(Date.now() / 1000);
  const sig = signAck([41, 42, 43], ts, RUN);
  // Verifier sorts internally — caller order does not matter.
  assert.equal(verifyAck([43, 41, 42], ts, RUN, sig), true);
});

test("tampered sig → reject", () => {
  const ts = Math.floor(Date.now() / 1000);
  const sig = signAck([41], ts, RUN);
  const tampered = sig.slice(0, -1) + (sig.endsWith("a") ? "b" : "a");
  assert.equal(verifyAck([41], ts, RUN, tampered), false);
});

test("different ids → reject", () => {
  const ts = Math.floor(Date.now() / 1000);
  const sig = signAck([41], ts, RUN);
  assert.equal(verifyAck([42], ts, RUN, sig), false);
});

test("different ts → reject", () => {
  const ts = Math.floor(Date.now() / 1000);
  const sig = signAck([41], ts, RUN);
  assert.equal(verifyAck([41], ts + 1, RUN, sig), false);
});

test("different runIdShort → reject", () => {
  const ts = Math.floor(Date.now() / 1000);
  const sig = signAck([41], ts, RUN);
  assert.equal(verifyAck([41], ts, "deadbeef", sig), false);
});

test("isFresh: now → true", () => {
  const ts = Math.floor(Date.now() / 1000);
  assert.equal(isFresh(ts), true);
});

test("isFresh: 6 days old → true", () => {
  const ts = Math.floor(Date.now() / 1000) - 6 * 86400;
  assert.equal(isFresh(ts), true);
});

test("isFresh: 8 days old → false", () => {
  const ts = Math.floor(Date.now() / 1000) - 8 * 86400;
  assert.equal(isFresh(ts), false);
});

test("isFresh: ttl boundary", () => {
  assert.equal(ACK_TTL_SECONDS, 7 * 24 * 60 * 60);
});

test("isFresh: future ts within skew → true", () => {
  const ts = Math.floor(Date.now() / 1000) + 60;
  assert.equal(isFresh(ts), true);
});

test("isFresh: far-future ts → false", () => {
  const ts = Math.floor(Date.now() / 1000) + 3600;
  assert.equal(isFresh(ts), false);
});

test("missing secret → signAck throws", () => {
  const orig = process.env.ALERT_ACK_SECRET;
  delete process.env.ALERT_ACK_SECRET;
  try {
    assert.throws(() => signAck([1], 1, "deadbeef"), /ALERT_ACK_SECRET/);
  } finally {
    process.env.ALERT_ACK_SECRET = orig;
  }
});

test("missing secret → verifyAck returns false (does not throw)", () => {
  const ts = Math.floor(Date.now() / 1000);
  const sig = signAck([41], ts, RUN);
  const orig = process.env.ALERT_ACK_SECRET;
  delete process.env.ALERT_ACK_SECRET;
  try {
    assert.equal(verifyAck([41], ts, RUN, sig), false);
  } finally {
    process.env.ALERT_ACK_SECRET = orig;
  }
});

test("non-hex sig → reject", () => {
  const ts = Math.floor(Date.now() / 1000);
  assert.equal(verifyAck([41], ts, RUN, "not-hex-zzzzzz"), false);
});

test("wrong-length sig → reject", () => {
  const ts = Math.floor(Date.now() / 1000);
  assert.equal(verifyAck([41], ts, RUN, "deadbeef"), false);
});
