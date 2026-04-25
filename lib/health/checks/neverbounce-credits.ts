/**
 * neverbounce_credits check — verify NB credit balance is above the floor.
 *
 * Reuses nbCredits() from lib/pipeline/verify-submit (do NOT add a second
 * NB client; see plan §3.3).
 *
 * Thresholds (plan §4):
 *   red    if credits < NB_CREDIT_FLOOR  (default 5000) — same env var the pipeline uses
 *   yellow if credits < HEALTH_NB_YELLOW (default 5500)
 */

import { nbCredits } from "@/lib/pipeline/verify-submit";
import type {
  HealthCheck,
  HealthCheckResult,
  HealthRunContext,
  HealthStatus,
} from "../types";

export function classifyNbCredits(
  credits: number,
  thresholds: { red: number; yellow: number },
): HealthStatus {
  if (credits < thresholds.red) return "red";
  if (credits < thresholds.yellow) return "yellow";
  return "green";
}

export async function runNeverbounceCredits(
  _ctx: HealthRunContext,
): Promise<HealthCheckResult> {
  const start = Date.now();
  const red = parseInt(process.env.NB_CREDIT_FLOOR || "5000", 10);
  // Tuned 2026-04-26 (PR fix/health-check-tuning) for steady-state daily-delta
  // operations (~50–1,500 verifications/month). Original 15K threshold assumed
  // high-volume re-verification cycles which we don't run. Yellow at 5,500
  // gives ~10% headroom above the 5,000 red floor — enough warning before
  // hard-stop, but not so wide it nags during normal operation.
  const yellow = parseInt(process.env.HEALTH_NB_YELLOW || "5500", 10);

  const credits = await nbCredits();
  if (credits === null) {
    throw new Error("nbCredits() returned null — NB credit endpoint unreachable or misconfigured");
  }

  const status = classifyNbCredits(credits, { red, yellow });

  return {
    name: "neverbounce_credits",
    status,
    metric: credits,
    threshold: red,
    details: {
      yellow_floor: yellow,
      red_floor: red,
    },
    errorMessage: null,
    durationMs: Date.now() - start,
  };
}

export const neverbounceCreditsCheck: HealthCheck = {
  name: "neverbounce_credits",
  criticalOnError: true,
  run: runNeverbounceCredits,
};
