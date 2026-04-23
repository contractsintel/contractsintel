/**
 * NeverBounce submit phase — posts a batch to /jobs/create and returns the
 * job_id. The orchestrator persists job_id to cert_queue_state.nb_job_id so
 * verify-poll can pick it up next tick.
 *
 * Credit floor (NB_CREDIT_FLOOR, default 5000) is enforced here — if the
 * account balance is unreadable OR below floor, we skip and alert instead
 * of submitting a job we can't afford. Fail-closed.
 */

import { pipelineSupabase } from "./supabase";
import type { DrainResult } from "./types";

const NB_BASE = "https://api.neverbounce.com/v4";

export async function nbCredits(): Promise<number | null> {
  const key = process.env.NEVERBOUNCE_API_KEY || "";
  if (!key) return null;
  try {
    const res = await fetch(
      `https://api.neverbounce.com/v4.2/account/info?key=${encodeURIComponent(key)}`,
    );
    if (!res.ok) return null;
    const j = await res.json();
    return (
      j?.credits_info?.paid_credits_remaining ??
      j?.credits_info?.free_credits_remaining ??
      null
    );
  } catch {
    return null;
  }
}

async function nbCreateJob(emails: string[]): Promise<string> {
  const key = process.env.NEVERBOUNCE_API_KEY;
  if (!key) throw new Error("NEVERBOUNCE_API_KEY not set");
  const body = {
    key,
    input_location: "supplied",
    filename: `ci_${Date.now()}.csv`,
    auto_parse: 1,
    auto_start: 1,
    input: emails.map((e) => [e]),
  };
  const res = await fetch(`${NB_BASE}/jobs/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  const j = await res.json();
  if (j.status !== "success") throw new Error(`NB create: ${JSON.stringify(j)}`);
  return String(j.job_id);
}

export async function verifySubmit(
  opts: { cert: string; batchSize?: number },
): Promise<DrainResult> {
  const supabase = pipelineSupabase();
  const floor = parseInt(process.env.NB_CREDIT_FLOOR || "5000", 10);
  const limit = opts.batchSize ?? parseInt(process.env.VERIFY_LIMIT || "200", 10);

  const credits = await nbCredits();
  if (credits === null) {
    // fail-closed: can't confirm we're above floor, don't submit
    return { done: false, skipped: true, reason: "nb_credits_unreadable" };
  }
  if (credits < floor) {
    return { done: false, skipped: true, reason: "nb_credit_floor" };
  }

  // Pull a batch of leads scoped to this cert.
  // Same safety filters as the original verify worker.
  const { data: leads, error } = await supabase
    .from("leads")
    .select("id, email, primary_cert, company")
    .eq("primary_cert", opts.cert)
    .not("email", "is", null)
    .is("email_verification_status", null)
    .not("email", "ilike", "%.mil")
    .not("email", "ilike", "%.gov")
    .not("source", "eq", "sam_audit")
    .not("company", "is", null)
    .order("ingest_tier", { ascending: false })
    .order("id", { ascending: true })
    .limit(limit);
  if (error) throw new Error(`supabase read: ${error.message}`);
  if (!leads?.length) {
    // Nothing left to verify for this cert — stage is drained. done=true
    // lets the orchestrator advance to sync.
    return { done: true, skipped: true, reason: "nothing_to_verify" };
  }

  const emails = leads.map((l: { email: string }) => l.email);
  if (credits < emails.length) {
    return { done: false, skipped: true, reason: "nb_credits_below_batch" };
  }

  const jobId = await nbCreateJob(emails);
  // done=false because work continues in verify_poll (NB is async).
  // Orchestrator reads jobId+batchSize and uses customAdvance to move
  // to verify_poll stage while persisting nb_job_id on cert_queue_state.
  return { done: false, jobId, batchSize: emails.length };
}
