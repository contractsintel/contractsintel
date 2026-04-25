/**
 * neverbounce_credits check — verify NB credit balance is above the floor.
 *
 * Reuses nbCredits() from lib/pipeline/verify-submit (do NOT add a second
 * NB client; see plan §3.3).
 *
 * Thresholds (plan §4):
 *   red    if credits < NB_CREDIT_FLOOR  (default 5000) — same env var the pipeline uses
 *   yellow if credits < HEALTH_NB_YELLOW (default 15000)
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
  const yellow = parseInt(process.env.HEALTH_NB_YELLOW || "15000", 10);

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
