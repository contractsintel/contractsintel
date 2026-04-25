/**
 * DSBS daily delta cron — /api/cron/dsbs-delta.
 *
 * Schedule: 0 10 * * * UTC (= 6:00 AM ET / 5:00 AM EST). See vercel.json.
 *
 * What it does:
 *   1. For each cert in [8a, HUBZone, WOSB, EDWOSB, SDVOSB] sweep the SBS
 *      public JSON API (one POST per cert, full universe in each response —
 *      no pagination needed; see lib/pipeline/dsbs-scraper.ts).
 *   2. For each unique firm (deduped by UEI / lower-email), look up the
 *      existing leads row by dedup_key.
 *      - No row → insert with source='dsbs', enriched_at=now,
 *        email_verification_status=null, dsbs_last_seen_at=now.
 *      - Row exists and any tracked field changed → update changed columns
 *        + dsbs_last_seen_at, enriched_at.
 *      - Row exists and unchanged → touch dsbs_last_seen_at only.
 *   3. Write per-cert metrics + a summary row to public.scraper_runs.
 *
 * Verification handoff (option a): we do NOT call NeverBounce here. New
 * dsbs leads are written with email_verification_status=null, which is the
 * exact filter the existing cert-pipeline orchestrator's verify-submit
 * stage scans for (lib/pipeline/verify-submit.ts). The orchestrator picks
 * them up next time the matching cert is on the verify_submit stage. This
 * keeps the delta cron fast (<60s typical), separates ingestion from the
 * NB credit-floor / async-job dance, and reuses the existing queue plumbing
 * with zero new tables.
 *
 * PIPELINE_LIVE gating: NOT applied. Delta crons are pure data ingestion
 * against a public endpoint and run regardless of PIPELINE_LIVE. The flag
 * gates the *outbound* side (sync to Instantly) and the cert-pipeline
 * orchestrator stages — neither of which this route touches.
 *
 * Auth: Vercel Cron Bearer ${CRON_SECRET}, matches the convention of every
 * other route under app/api/cron/.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { pipelineSupabase } from "@/lib/pipeline/supabase";
import {
  CERT_CODES,
  type DsbsCertName,
  type DsbsLead,
  diffLead,
  sweepCerts,
  TRACKED_FIELDS,
} from "@/lib/pipeline/dsbs-scraper";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const CERTS: DsbsCertName[] = ["8a", "HUBZone", "WOSB", "EDWOSB", "SDVOSB"];

// Postgres `IN (...)` with ~60k UEIs in one query is not great. Chunk the
// existing-row lookup so each query stays under a sane limit.
const LOOKUP_CHUNK = 500;
const UPDATE_CHUNK = 100;
const INSERT_CHUNK = 500;

type ApplyResult = {
  new_firms: number;
  updated_firms: number;
  unchanged_firms: number;
  insert_errors: number;
  update_errors: number;
};

async function fetchExistingByDedupKeys(
  supabase: SupabaseClient,
  dedupKeys: string[],
): Promise<Map<string, Record<string, unknown>>> {
  const out = new Map<string, Record<string, unknown>>();
  if (!dedupKeys.length) return out;
  const fields = ["id", "dedup_key", ...TRACKED_FIELDS].join(", ");

  for (let i = 0; i < dedupKeys.length; i += LOOKUP_CHUNK) {
    const chunk = dedupKeys.slice(i, i + LOOKUP_CHUNK);
    const { data, error } = await supabase
      .from("leads")
      .select(fields)
      .in("dedup_key", chunk);
    if (error) throw new Error(`leads lookup: ${error.message}`);
    for (const row of (data ?? []) as unknown[]) {
      const r = row as Record<string, unknown>;
      const k = r.dedup_key as string;
      if (k) out.set(k, r);
    }
  }
  return out;
}

async function applyLeads(
  supabase: SupabaseClient,
  leads: DsbsLead[],
  nowIso: string,
): Promise<ApplyResult> {
  const result: ApplyResult = {
    new_firms: 0,
    updated_firms: 0,
    unchanged_firms: 0,
    insert_errors: 0,
    update_errors: 0,
  };
  if (!leads.length) return result;

  const dedupKeys = leads.map((l) => l.dedup_key);
  const existing = await fetchExistingByDedupKeys(supabase, dedupKeys);

  const inserts: DsbsLead[] = [];
  const updates: Array<{
    id: string;
    patch: Record<string, unknown>;
  }> = [];
  const touches: string[] = [];

  for (const lead of leads) {
    const cur = existing.get(lead.dedup_key);
    if (!cur) {
      inserts.push({
        ...lead,
        // email_verification_status is intentionally omitted — column
        // default is NULL, which is what verify-submit scans for.
      });
      continue;
    }
    const changed = diffLead(cur, lead);
    if (!changed) {
      touches.push(cur.id as string);
      continue;
    }
    const patch: Record<string, unknown> = { dsbs_last_seen_at: nowIso, enriched_at: nowIso };
    for (const f of changed) {
      patch[f] = (lead as Record<string, unknown>)[f];
    }
    updates.push({ id: cur.id as string, patch });
  }

  // Inserts (chunked). dsbs_last_seen_at goes on every insert.
  for (let i = 0; i < inserts.length; i += INSERT_CHUNK) {
    const batch = inserts.slice(i, i + INSERT_CHUNK).map((l) => ({
      ...l,
      dsbs_last_seen_at: nowIso,
    }));
    // Use upsert with onConflict for idempotency in case the same delta
    // tick sees a row that was inserted by a concurrent process between
    // our lookup and write. ignoreDuplicates=false → on conflict the row
    // gets the same payload (effectively an update), which is fine.
    const { data, error } = await supabase
      .from("leads")
      .upsert(batch, { onConflict: "dedup_key", ignoreDuplicates: false })
      .select("id");
    if (error) {
      result.insert_errors += batch.length;
      console.error(`[dsbs-delta] insert chunk @${i}: ${error.message}`);
    } else {
      result.new_firms += data?.length ?? 0;
    }
  }

  // Updates — Supabase has no batch-update-by-id RPC out of the box, so
  // run them in parallel (bounded). Each update is keyed by id so there's
  // no risk of cross-row clobbering.
  for (let i = 0; i < updates.length; i += UPDATE_CHUNK) {
    const chunk = updates.slice(i, i + UPDATE_CHUNK);
    await Promise.all(
      chunk.map(async ({ id, patch }) => {
        const { error } = await supabase.from("leads").update(patch).eq("id", id);
        if (error) {
          result.update_errors++;
          console.error(`[dsbs-delta] update id=${id}: ${error.message}`);
        } else {
          result.updated_firms++;
        }
      }),
    );
  }

  // Touch unchanged rows so dsbs_last_seen_at reflects the sweep. This is
  // also what the weekly sweep relies on for deactivation detection.
  for (let i = 0; i < touches.length; i += LOOKUP_CHUNK) {
    const chunk = touches.slice(i, i + LOOKUP_CHUNK);
    const { error } = await supabase
      .from("leads")
      .update({ dsbs_last_seen_at: nowIso })
      .in("id", chunk);
    if (!error) {
      result.unchanged_firms += chunk.length;
    } else {
      console.error(`[dsbs-delta] touch chunk @${i}: ${error.message}`);
    }
  }

  return result;
}

async function logScraperRun(
  supabase: SupabaseClient,
  payload: {
    source: string;
    status: "success" | "partial" | "error";
    opportunities_found: number;
    matches_created: number;
    error_message?: string | null;
    started_at: string;
    completed_at: string;
  },
): Promise<void> {
  const { error } = await supabase.from("scraper_runs").insert({
    source: payload.source,
    status: payload.status,
    opportunities_found: payload.opportunities_found,
    matches_created: payload.matches_created,
    error_message: payload.error_message ?? null,
    started_at: payload.started_at,
    completed_at: payload.completed_at,
  });
  if (error) {
    console.error(`[dsbs-delta] scraper_runs insert: ${error.message}`);
  }
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const overallStart = new Date().toISOString();
  const t0 = Date.now();

  let supabase: SupabaseClient;
  try {
    supabase = pipelineSupabase();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  try {
    const sweep = await sweepCerts(CERTS);
    const nowIso = new Date().toISOString();

    // Bucket leads by primary_cert so per-cert metrics are meaningful.
    // (A multi-cert firm only counts toward its primary_cert bucket.)
    const byCert = new Map<string, DsbsLead[]>();
    for (const l of sweep.leads) {
      const k = l.primary_cert ?? "unrouted";
      const arr = byCert.get(k) ?? [];
      arr.push(l);
      byCert.set(k, arr);
    }

    // Apply once across the full set (one Supabase pass = far fewer round
    // trips than per-cert applies). Then attribute counts back to certs
    // proportionally for the per-cert scraper_runs metric.
    const apply = await applyLeads(supabase, sweep.leads, nowIso);
    const completedAt = new Date().toISOString();

    // Per-cert scraper_runs (each cert's row is the slice we observed in
    // its individual API call — that's the rows_fetched number we trust
    // most). new_firms / updated_firms are attributed proportionally to
    // the cert's new_unique_firms share of the sweep.
    const totalNewUnique =
      sweep.perCert.reduce((s, p) => s + p.new_unique_firms, 0) || 1;
    for (const p of sweep.perCert) {
      const share = p.new_unique_firms / totalNewUnique;
      const attributedNew = Math.round(apply.new_firms * share);
      const attributedUpd = Math.round(apply.updated_firms * share);
      await logScraperRun(supabase, {
        source: `dsbs_delta_${CERT_CODES[p.cert].slug}`,
        status: "success",
        opportunities_found: p.rows_fetched,
        // matches_created semantics for DSBS scrapers = leads written
        // (insert + update). Matches the dsbs-full-universe.js convention.
        matches_created: attributedNew + attributedUpd,
        started_at: p.started_at,
        completed_at: p.completed_at,
      });
    }

    // Summary row.
    const errors = apply.insert_errors + apply.update_errors;
    await logScraperRun(supabase, {
      source: "dsbs_delta",
      status: errors > 0 ? "partial" : "success",
      opportunities_found: sweep.totalFetched,
      matches_created: apply.new_firms + apply.updated_firms,
      error_message: errors > 0 ? `${errors} write errors` : null,
      started_at: overallStart,
      completed_at: completedAt,
    });

    return NextResponse.json({
      ok: true,
      run: "dsbs_delta",
      started_at: overallStart,
      completed_at: completedAt,
      wall_clock_ms: Date.now() - t0,
      total_fetched: sweep.totalFetched,
      unique_firms_in_sweep: sweep.leads.length,
      ...apply,
      per_cert: sweep.perCert,
      by_primary_cert: Object.fromEntries(
        Array.from(byCert.entries()).map(([k, v]) => [k, v.length]),
      ),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    const stack = e instanceof Error ? e.stack : undefined;
    await logScraperRun(supabase, {
      source: "dsbs_delta",
      status: "error",
      opportunities_found: 0,
      matches_created: 0,
      error_message: msg,
      started_at: overallStart,
      completed_at: new Date().toISOString(),
    }).catch(() => {});
    return NextResponse.json({ error: msg, stack }, { status: 500 });
  }
}
