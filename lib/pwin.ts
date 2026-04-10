// G08 PWin (probability of win) heuristic.
//
// Combines three signals that are cheap to compute from existing columns:
//   1. match_score (0–100) from the AI match engine
//   2. historical win rate at the same agency for this tenant
//   3. gate_stage — the further along in capture you are, the more the
//      PWin should be trusted upwards (Shipley rule-of-thumb).
//
// Falls back gracefully when inputs are missing.

import { createClient } from "@/lib/supabase/server";

export const GATE_STAGES = [
  "g0_prospect",
  "g1_qualification",
  "g2_pursuit_decision",
  "g3_capture",
  "g4_proposal",
  "g5_submission",
  "g6_award",
] as const;
export type GateStage = (typeof GATE_STAGES)[number];

const GATE_WEIGHT: Record<GateStage, number> = {
  g0_prospect: 0.35,
  g1_qualification: 0.5,
  g2_pursuit_decision: 0.65,
  g3_capture: 0.8,
  g4_proposal: 0.9,
  g5_submission: 0.95,
  g6_award: 1.0,
};

export interface PwinInputs {
  matchScore?: number | null; // 0..100
  agencyWinRate?: number | null; // 0..1
  gateStage?: GateStage | null;
}

export function computePwin(inputs: PwinInputs): number {
  const match = clamp((inputs.matchScore ?? 50) / 100, 0, 1);
  const winRate = clamp(inputs.agencyWinRate ?? 0.25, 0, 1);
  const gate = inputs.gateStage ? GATE_WEIGHT[inputs.gateStage] : 0.5;

  // 50% match score, 25% historical agency win rate, 25% gate stage.
  const blended = match * 0.5 + winRate * 0.25 + gate * 0.25;
  return Math.round(clamp(blended, 0, 1) * 100);
}

function clamp(n: number, lo: number, hi: number) {
  if (Number.isNaN(n)) return lo;
  return Math.min(Math.max(n, lo), hi);
}

/**
 * Look up a tenant's historical win rate for a given agency.
 * Derived from `opportunity_matches` where user_status ∈ {won, lost}
 * within the same organization + agency.
 */
export async function lookupAgencyWinRate(
  organizationId: string,
  agency: string | null,
): Promise<number | null> {
  if (!agency) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("opportunity_matches")
    .select("user_status, opportunities!inner(agency)")
    .eq("organization_id", organizationId)
    .in("user_status", ["won", "lost"]);
  if (error || !data) return null;

  const relevant = (data as unknown as Array<{ user_status: string; opportunities: { agency: string | null } }>)
    .filter((r) => r.opportunities?.agency === agency);
  if (relevant.length === 0) return null;
  const wins = relevant.filter((r) => r.user_status === "won").length;
  return wins / relevant.length;
}
