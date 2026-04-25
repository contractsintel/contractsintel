/**
 * DSBS weekly full sweep cron — /api/cron/dsbs-weekly-sweep.
 *
 * Schedule: 0 6 * * 0 UTC (= Sunday 2:00 AM ET / 1:00 AM EST). See
 * vercel.json.
 *
 * What it does:
 *   1. Identical full-universe sweep as the daily delta cron — for each of
 *      the 5 target certs, POST the SBS public JSON API.
 *   2. Apply the same insert/update/touch logic against `leads`, stamping
 *      dsbs_last_seen_at on every observed firm.
 *   3. After the apply pass, count `leads` rows where source='dsbs' AND
 *      dsbs_last_seen_at < <sweep_started_at> — these are firms that did
 *      not appear in this week's SBS response, i.e. **deactivation
 *      candidates**. We report the count in scraper_runs but DO NOT mutate
 *      the rows. Reasoning is in the migration comment
 *      (20260424100000_leads_dsbs_last_seen.sql): single-week absence is
 *      too noisy a signal to deactivate on. Once we have multi-week
 *      baseline data, a follow-up PR can wire automatic flagging.
 *   4. Compute a week-over-week diff using the previous successful weekly
 *      run's matches_created count (read from scraper_runs).
 *
 * Verification handoff: same as the daily delta — new leads land with
 * email_verification_status=null and are picked up by the existing
 * cert-pipeline orchestrator's verify-submit stage. No NB call here.
 *
 * PIPELINE_LIVE gating: NOT applied. This is pure data ingestion against a
 * public endpoint. See top-comment in /api/cron/dsbs-delta/route.ts.
 *
 * Auth: same Bearer ${CRON_SECRET} convention as every other cron route.
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
  const updates: Array<{ id: string; patch: Record<string, unknown> }> = [];
  const touches: string[] = [];

  for (const lead of leads) {
    const cur = existing.get(lead.dedup_key);
    if (!cur) {
      inserts.push(lead);
      continue;
    }
    const changed = diffLead(cur, lead);
    if (!changed) {
      touches.push(cur.id as string);
      continue;
    }
    const patch: Record<string, unknown> = {
      dsbs_last_seen_at: nowIso,
      enriched_at: nowIso,
    };
    for (const f of changed) patch[f] = (lead as Record<string, unknown>)[f];
    updates.push({ id: cur.id as string, patch });
  }

  for (let i = 0; i < inserts.length; i += INSERT_CHUNK) {
    const batch = inserts
      .slice(i, i + INSERT_CHUNK)
      .map((l) => ({ ...l, dsbs_last_seen_at: nowIso }));
    const { data, error } = await supabase
      .from("leads")
      .upsert(batch, { onConflict: "dedup_key", ignoreDuplicates: false })
      .select("id");
    if (error) {
      result.insert_errors += batch.length;
      console.error(`[dsbs-weekly] insert chunk @${i}: ${error.message}`);
    } else {
      result.new_firms += data?.length ?? 0;
    }
  }

  for (let i = 0; i < updates.length; i += UPDATE_CHUNK) {
    const chunk = updates.slice(i, i + UPDATE_CHUNK);
    await Promise.all(
      chunk.map(async ({ id, patch }) => {
        const { error } = await supabase.from("leads").update(patch).eq("id", id);
        if (error) {
          result.update_errors++;
          console.error(`[dsbs-weekly] update id=${id}: ${error.message}`);
        } else {
          result.updated_firms++;
        }
      }),
    );
  }

  for (let i = 0; i < touches.length; i += LOOKUP_CHUNK) {
    const chunk = touches.slice(i, i + LOOKUP_CHUNK);
    const { error } = await supabase
      .from("leads")
      .update({ dsbs_last_seen_at: nowIso })
      .in("id", chunk);
    if (!error) {
      result.unchanged_firms += chunk.length;
    } else {
      console.error(`[dsbs-weekly] touch chunk @${i}: ${error.message}`);
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
    console.error(`[dsbs-weekly] scraper_runs insert: ${error.message}`);
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
    // Read prior weekly-sweep run for week-over-week diff (best-effort).
    const { data: prior } = await supabase
      .from("scraper_runs")
      .select("opportunities_found, matches_created, started_at, completed_at")
      .eq("source", "dsbs_weekly")
      .eq("status", "success")
      .order("completed_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const sweep = await sweepCerts(CERTS);
    const nowIso = new Date().toISOString();

    const apply = await applyLeads(supabase, sweep.leads, nowIso);

    // Deactivation candidates: dsbs leads whose dsbs_last_seen_at predates
    // this sweep (or is still NULL — i.e. they predate the column rollout).
    const { count: deactivationCount, error: deactErr } = await supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("source", "dsbs")
      .or(`dsbs_last_seen_at.is.null,dsbs_last_seen_at.lt.${overallStart}`);
    if (deactErr) {
      console.error(`[dsbs-weekly] deactivation count: ${deactErr.message}`);
    }

    const completedAt = new Date().toISOString();

    // Per-cert rows.
    const totalNewUnique =
      sweep.perCert.reduce((s, p) => s + p.new_unique_firms, 0) || 1;
    for (const p of sweep.perCert) {
      const share = p.new_unique_firms / totalNewUnique;
      const attributedNew = Math.round(apply.new_firms * share);
      const attributedUpd = Math.round(apply.updated_firms * share);
      await logScraperRun(supabase, {
        source: `dsbs_weekly_${CERT_CODES[p.cert].slug}`,
        status: "success",
        opportunities_found: p.rows_fetched,
        matches_created: attributedNew + attributedUpd,
        started_at: p.started_at,
        completed_at: p.completed_at,
      });
    }

    // Summary row, plus week-over-week diff in error_message field
    // (repurposed as freeform commentary — same convention the
    // dsbs-full-universe.js summary uses for "N upsert errors").
    const errors = apply.insert_errors + apply.update_errors;
    const wow = prior
      ? {
          prev_total: prior.opportunities_found,
          delta_total: sweep.totalFetched - (prior.opportunities_found ?? 0),
          prev_written: prior.matches_created,
        }
      : null;
    const summaryNote = [
      errors > 0 ? `${errors} write errors` : null,
      wow ? `wow: total ${wow.delta_total >= 0 ? "+" : ""}${wow.delta_total}` : null,
      deactivationCount !== null && deactivationCount !== undefined
        ? `deactivation_candidates=${deactivationCount}`
        : null,
    ]
      .filter(Boolean)
      .join("; ");

    await logScraperRun(supabase, {
      source: "dsbs_weekly",
      status: errors > 0 ? "partial" : "success",
      opportunities_found: sweep.totalFetched,
      matches_created: apply.new_firms + apply.updated_firms,
      error_message: summaryNote || null,
      started_at: overallStart,
      completed_at: completedAt,
    });

    return NextResponse.json({
      ok: true,
      run: "dsbs_weekly",
      started_at: overallStart,
      completed_at: completedAt,
      wall_clock_ms: Date.now() - t0,
      total_fetched: sweep.totalFetched,
      unique_firms_in_sweep: sweep.leads.length,
      ...apply,
      deactivation_candidates: deactivationCount ?? null,
      week_over_week: wow,
      per_cert: sweep.perCert,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    const stack = e instanceof Error ? e.stack : undefined;
    await logScraperRun(supabase, {
      source: "dsbs_weekly",
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
