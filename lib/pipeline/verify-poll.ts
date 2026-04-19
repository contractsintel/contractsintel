/**
 * NeverBounce poll phase — checks /jobs/status for the stored job_id. If
 * complete, pulls paginated /jobs/results and writes verification statuses
 * to leads. Returns {done:false} when the job is still running so the
 * orchestrator leaves cert_queue_state.nb_job_id intact for the next tick.
 */

import { pipelineSupabase } from "./supabase";

const NB_BASE = "https://api.neverbounce.com/v4";

async function nbJobStatus(jobId: string): Promise<{ job_status: string }> {
  const key = process.env.NEVERBOUNCE_API_KEY;
  if (!key) throw new Error("NEVERBOUNCE_API_KEY not set");
  const res = await fetch(`${NB_BASE}/jobs/status?key=${encodeURIComponent(key)}&job_id=${jobId}`);
  const j = await res.json();
  if (j.status !== "success") throw new Error(`NB status: ${JSON.stringify(j)}`);
  return j;
}

async function nbJobResults(jobId: string): Promise<any[]> {
  const key = process.env.NEVERBOUNCE_API_KEY;
  if (!key) throw new Error("NEVERBOUNCE_API_KEY not set");
  const PER_PAGE = 1000;
  let page = 0;
  const all: any[] = [];
  while (true) {
    const url = `${NB_BASE}/jobs/results?key=${encodeURIComponent(key)}&job_id=${jobId}&items_per_page=${PER_PAGE}&page=${page}`;
    const res = await fetch(url);
    const j = await res.json();
    if (j.status !== "success") throw new Error(`NB results: ${JSON.stringify(j).slice(0, 300)}`);
    const rows = j.results || [];
    all.push(...rows);
    const totalPages = j.total_pages || 1;
    page += 1;
    if (page >= totalPages || rows.length === 0) break;
  }
  return all;
}

export async function verifyPoll(
  opts: { cert: string; jobId: string },
): Promise<{ done: boolean; valid?: number; invalid?: number; total?: number }> {
  const s = await nbJobStatus(opts.jobId);
  if (s.job_status !== "complete") {
    if (s.job_status === "failed" || s.job_status === "under_review") {
      throw new Error(`NB job ${opts.jobId} ended: ${s.job_status}`);
    }
    return { done: false };
  }

  const supabase = pipelineSupabase();
  const rows = await nbJobResults(opts.jobId);

  let valid = 0;
  let invalid = 0;
  for (const r of rows) {
    const email =
      r?.data?.email ||
      r?.verification?.address_info?.original_email ||
      r?.verification?.address_info?.normalized_email ||
      null;
    if (!email) continue;
    const raw = String(r?.verification?.result || "").toLowerCase();
    const status = raw === "catchall" ? "catch-all" : raw;
    const flags = Array.isArray(r?.verification?.flags) ? r.verification.flags.join(",") : null;

    const update = {
      email_verification_status: status,
      email_verification_substatus: flags,
      email_verification_source: "neverbounce",
      email_verified_at: new Date().toISOString(),
    };
    // Scope by cert + email match — the submitted batch was cert-filtered,
    // so updating by email alone within primary_cert is safe.
    const { error } = await supabase
      .from("leads")
      .update(update)
      .eq("primary_cert", opts.cert)
      .eq("email", String(email).toLowerCase());
    if (error) console.error(`  verify-poll update ${email}: ${error.message}`);
    if (status === "valid") valid += 1;
    else if (status === "invalid") invalid += 1;
  }
  return { done: true, valid, invalid, total: rows.length };
}
