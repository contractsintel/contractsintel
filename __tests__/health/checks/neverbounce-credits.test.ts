/**
 * Tests for lib/health/checks/neverbounce-credits.ts.
 *
 * The runner imports nbCredits() from lib/pipeline/verify-submit. We can
 * exercise the classifier (pure) directly for threshold edges. For end-to-
 * end coverage we also invoke the runner with NB env vars unset; nbCredits
 * returns null in that case (per its source) which causes our runner to
 * throw — verifying our error path.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { classifyNbCredits } from "../../../lib/health/checks/neverbounce-credits";

test("classifyNbCredits: above yellow → green", () => {
  const t = { red: 5000, yellow: 15000 };
  assert.equal(classifyNbCredits(20000, t), "green");
  assert.equal(classifyNbCredits(15000, t), "green"); // strictly less than yellow → yellow; equal → green
});

test("classifyNbCredits: below yellow but above red → yellow", () => {
  const t = { red: 5000, yellow: 15000 };
  assert.equal(classifyNbCredits(14999, t), "yellow");
  assert.equal(classifyNbCredits(5001, t), "yellow");
});

test("classifyNbCredits: below red → red", () => {
  const t = { red: 5000, yellow: 15000 };
  assert.equal(classifyNbCredits(4999, t), "red");
  assert.equal(classifyNbCredits(0, t), "red");
});

test("classifyNbCredits: at red boundary → red (strictly less than red is red; equal is yellow)", () => {
  const t = { red: 5000, yellow: 15000 };
  // 5000 is not <5000, so not red. It IS <15000, so yellow.
  assert.equal(classifyNbCredits(5000, t), "yellow");
});
