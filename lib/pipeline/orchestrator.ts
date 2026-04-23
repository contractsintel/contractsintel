/**
 * Cert-pipeline orchestrator — one tick.
 *
 * Ported from workers/jobs/daily-pipeline.js. Each tick:
 *   (a) HUBZone delta ingest — always, if PIPELINE_LIVE=1
 *   (b) Active cert step — advances the single highest-priority non-done row
 *       through STAGE_ORDER: ingest → enrich → crawl → verify_submit →
 *       verify_poll → sync → done.
 *
 * verify is SPLIT across two stages because NB's async job lifecycle can
 * exceed the Vercel 300s ceiling:
 *   verify_submit: call NB create, store nb_job_id + nb_submitted_at +
 *                  nb_batch_size on cert_queue_state, advance to verify_poll
 *   verify_poll:   check NB status. If running, return {done:false} and DO
 *                  NOT advance. If complete, write results to leads, clear
 *                  nb_* fields, advance to sync. If nb_submitted_at is
 *                  older than 60 min → critical alert (stale), don't
 *                  auto-fail.
 *
 * SAFETY:
 *   - PIPELINE_LIVE=1 required. Absent → every stage returns
 *     {skipped:true, reason:'dry-run'} and stages do not advance.
 *   - Sync dual gate enforced inline AND inside sync.ts (belt-and-suspenders).
 *   - NB credit floor check sits inside verify-submit.ts (fail-closed).
 *   - Unhandled exceptions write critical cron_alerts and don't crash the tick.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { pipelineSupabase } from "./supabase";
import { alert } from "./alerts";
import { ingest } from "./ingest";
import { enrich } from "./enrich";
import { crawl } from "./crawl";
import { verifySubmit } from "./verify-submit";
import { verifyPoll } from "./verify-poll";
import { sync } from "./sync";
import type { PipelineMode, StageCursor } from "./types";

const STAGE_ORDER = [
  "ingest",
  "enrich",
  "crawl",
  "verify_submit",
  "verify_poll",
  "sync",
  "done",
] as const;
type Stage = (typeof STAGE_ORDER)[number];

function nextStage(s: string): Stage {
  const i = (STAGE_ORDER as readonly string[]).indexOf(s);
  return i >= 0 && i < STAGE_ORDER.length - 1 ? STAGE_ORDER[i + 1] : "done";
}

const NB_STALE_MS = 60 * 60 * 1000; // 60 min
const TICK_OVERLAP_GUARD_MS = 240 * 1000; // R4: skip active-step if another tick ran < 240s ago

// ---------------------------------------------------------------------------
// HUBZone delta — task (a)
//
// R3 guard: this task is the STATELESS daily delta for HUBZone and is
// separate from the active-step path. If cert_queue_state.hubzone.mode is
// NOT 'delta' (e.g. mid weekly_sweep, or re-backfill), this task is
// suppressed to avoid cursor contention with the active step.
// ---------------------------------------------------------------------------
export async function runHubzoneDelta(
  supabase: SupabaseClient,
  runId: string,
  live: boolean,
): Promise<Record<string, unknown>> {
  try {
    if (!live) return { task: "hubzone_delta", skipped: true, reason: "PIPELINE_LIVE!=1 (dry-run)" };

    // R3: read hubzone.mode; suppress unless mode='delta'.
    const { data: hzRow } = await supabase
      .from("cert_queue_state")
      .select("mode")
      .eq("cert", "hubzone")
      .single();
    const hzMode = (hzRow?.mode ?? null) as PipelineMode | null;
    if (hzMode !== "delta") {
      return {
        task: "hubzone_delta",
        skipped: true,
        reason: "mode_not_delta",
        observed_mode: hzMode,
      };
    }

    const result = await ingest({ cert: "hubzone", mode: "delta" });
    return { task: "hubzone_delta", ...result };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    const stack = e instanceof Error ? e.stack : undefined;
    await alert(supabase, runId, "error", "cert-pipeline", `HUBZone delta failed: ${msg}`, { stack });
    return { task: "hubzone_delta", error: msg };
  }
}

// ---------------------------------------------------------------------------
// Active cert pick
// ---------------------------------------------------------------------------
type QueueRow = {
  cert: string;
  priority: number;
  stage: string;
  sync_enabled: boolean;
  nb_job_id: string | null;
  nb_submitted_at: string | null;
  nb_batch_size: number | null;
  last_tick_at: string | null;
  // PR 1a additions — schema from 20260422120000_cert_queue_pipeline_v2_schema.sql
  mode: PipelineMode | null;
  ingest_cursor: StageCursor;
  enrich_cursor: StageCursor;
  crawl_cursor: StageCursor;
  sync_cursor: StageCursor;
  weekly_refresh_due_at: string | null;
  stage_started_at: string | null;
  rows_this_stage: number | null;
};

/**
 * Pick the cert to work on this tick.
 *
 * Pick priority (highest to lowest):
 *   1. Active-step cert: stage != 'done' AND (last_tick_at IS NULL OR
 *      last_tick_at < now() - TICK_OVERLAP_GUARD_MS). The 240s guard
 *      prevents overlapping Vercel ticks from double-processing the same
 *      cert — Vercel cron does NOT dedupe concurrent invocations
 *      (see plan §E4/R4).
 *   2. Weekly-sweep due cert: stage='done' AND weekly_refresh_due_at < now().
 *      When matched, the row is REWOUND to stage='ingest',
 *      mode='weekly_sweep', cursors cleared, stage_started_at stamped,
 *      rows_this_stage=0. Backfill_done_at is nulled so the active-step
 *      picker will now match this row on subsequent ticks.
 *   3. None → return null. Tick exits early after HUBZone delta task.
 *
 * Only ONE cert advances per tick. Overlap between HUBZone delta
 * (runHubzoneDelta, runs independently) and this active-step picker is
 * possible when the active cert == 'hubzone' AND mode='weekly_sweep'. R3
 * guard in runHubzoneDelta suppresses the delta task when
 * hubzone.mode != 'delta' to prevent cursor contention.
 */
export async function pickActiveCert(supabase: SupabaseClient): Promise<QueueRow | null> {
  const nowIso = new Date().toISOString();
  const overlapCutoff = new Date(Date.now() - TICK_OVERLAP_GUARD_MS).toISOString();

  // 1) Active-step cert: stage != 'done', not recently ticked.
  const { data: active, error: aerr } = await supabase
    .from("cert_queue_state")
    .select("*")
    .neq("stage", "done")
    .or(`last_tick_at.is.null,last_tick_at.lt.${overlapCutoff}`)
    .order("priority", { ascending: true })
    .limit(1);
  if (aerr) throw new Error(`pickActiveCert(active): ${aerr.message}`);
  if (active && active.length > 0) return active[0] as QueueRow;

  // 2) Weekly-sweep due: stage='done' AND weekly_refresh_due_at < now().
  const { data: due, error: derr } = await supabase
    .from("cert_queue_state")
    .select("*")
    .eq("stage", "done")
    .lt("weekly_refresh_due_at", nowIso)
    .order("weekly_refresh_due_at", { ascending: true })
    .limit(1);
  if (derr) throw new Error(`pickActiveCert(weekly): ${derr.message}`);
  if (due && due.length > 0) {
    const row = due[0] as QueueRow;
    // Rewind for weekly sweep: back to ingest stage with mode='weekly_sweep',
    // cursors cleared, stage_started_at stamped. backfill_done_at nulled so
    // it no longer matches stage='done' for the next pick.
    const rewind = {
      stage: "ingest" as const,
      mode: "weekly_sweep" as const,
      ingest_cursor: null,
      enrich_cursor: null,
      crawl_cursor: null,
      sync_cursor: null,
      stage_started_at: nowIso,
      rows_this_stage: 0,
      backfill_done_at: null,
      last_error: null,
    };
    await supabase.from("cert_queue_state").update(rewind).eq("cert", row.cert);
    return { ...row, ...rewind } as QueueRow;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Active cert step — task (b)
// ---------------------------------------------------------------------------
async function runActiveStep(
  supabase: SupabaseClient,
  runId: string,
  row: QueueRow,
  live: boolean,
): Promise<Record<string, unknown>> {
  const { cert, stage, sync_enabled } = row;
  const base: Record<string, unknown> = { task: "active_cert_step", cert, stage };

  await supabase
    .from("cert_queue_state")
    .update({ last_tick_at: new Date().toISOString() })
    .eq("cert", cert);

  try {
    let stepResult: any;
    let customAdvance: Partial<Record<string, unknown>> | null = null;

    switch (stage) {
      case "ingest": {
        if (!live) {
          stepResult = { skipped: true, reason: "dry-run" };
          break;
        }
        // PR 1a: route by the row's `mode` (backfill/delta/weekly_sweep)
        // and pass any persisted cursor. In PR 1a ingest still always
        // returns done=true, so behavior is unchanged; the plumbing is
        // in place for PR 1b's real drain loop.
        const ingestMode: PipelineMode = row.mode ?? "backfill";
        stepResult = await ingest({
          cert,
          mode: ingestMode,
          cursor: row.ingest_cursor ?? null,
        });
        break;
      }
      case "enrich": {
        if (!live) {
          stepResult = { skipped: true, reason: "dry-run" };
          break;
        }
        stepResult = await enrich({ cert, cursor: row.enrich_cursor ?? null });
        break;
      }
      case "crawl": {
        if (!live) {
          stepResult = { skipped: true, reason: "dry-run" };
          break;
        }
        stepResult = await crawl({ cert, cursor: row.crawl_cursor ?? null });
        break;
      }
      case "verify_submit": {
        if (!live) {
          stepResult = { skipped: true, reason: "dry-run" };
          break;
        }
        stepResult = await verifySubmit({ cert });
        if ("jobId" in stepResult) {
          // Persist job state on cert_queue_state so verify_poll can pick up.
          customAdvance = {
            stage: "verify_poll",
            nb_job_id: stepResult.jobId,
            nb_submitted_at: new Date().toISOString(),
            nb_batch_size: stepResult.batchSize,
            last_error: null,
          };
        } else if ((stepResult as { reason?: string }).reason === "nb_credit_floor") {
          await alert(
            supabase,
            runId,
            "critical",
            "cert-pipeline",
            `NeverBounce credits below floor; skipping verify`,
            { cert, result: stepResult },
          );
        } else if ((stepResult as { reason?: string }).reason === "nb_credits_unreadable") {
          await alert(
            supabase,
            runId,
            "critical",
            "cert-pipeline",
            `NeverBounce credits unreadable — fail-closed, skipping verify`,
            { cert },
          );
        }
        break;
      }
      case "verify_poll": {
        if (!live) {
          stepResult = { skipped: true, reason: "dry-run" };
          break;
        }
        const jobId = row.nb_job_id;
        if (!jobId) {
          // No stored job_id — shouldn't happen; reset to verify_submit.
          await alert(
            supabase,
            runId,
            "error",
            "cert-pipeline",
            `verify_poll without nb_job_id; resetting to verify_submit`,
            { cert },
          );
          customAdvance = { stage: "verify_submit", nb_job_id: null, nb_submitted_at: null, nb_batch_size: null };
          stepResult = { skipped: true, reason: "missing_job_id_reset" };
          break;
        }
        // Stale job check.
        if (row.nb_submitted_at) {
          const ageMs = Date.now() - new Date(row.nb_submitted_at).getTime();
          if (ageMs > NB_STALE_MS) {
            await alert(
              supabase,
              runId,
              "critical",
              "cert-pipeline",
              `NB job stale (>${NB_STALE_MS / 60000}min) — human intervention required`,
              { cert, nb_job_id: jobId, submitted_at: row.nb_submitted_at, age_ms: ageMs },
            );
          }
        }
        stepResult = await verifyPoll({ cert, jobId });
        if (stepResult.done) {
          // Advance to sync, clear NB fields.
          customAdvance = {
            stage: "sync",
            nb_job_id: null,
            nb_submitted_at: null,
            nb_batch_size: null,
            last_error: null,
          };
        } else {
          // Still running — do NOT advance, do NOT write last_error.
          return {
            ...base,
            advanced: false,
            next_stage: stage,
            result: stepResult,
            waiting_on_nb_job: jobId,
          };
        }
        break;
      }
      case "sync": {
        const dbOk = sync_enabled === true;
        const SYNC_ALLOWED_CERTS = (process.env.SYNC_ALLOWED_CERTS || "hubzone")
          .toLowerCase()
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        const envOk = SYNC_ALLOWED_CERTS.includes(cert);
        if (!dbOk || !envOk) {
          await alert(
            supabase,
            runId,
            "warn",
            "cert-pipeline",
            `Sync gate refused cert=${cert} (db_sync_enabled=${dbOk}, env_allowed=${envOk})`,
            { cert, dbOk, envOk, SYNC_ALLOWED_CERTS },
          );
          stepResult = { skipped: true, reason: "sync_gate", dbOk, envOk };
          break;
        }
        if (!live) {
          stepResult = { skipped: true, reason: "dry-run" };
          break;
        }
        stepResult = await sync({ cert, cursor: row.sync_cursor ?? null });
        break;
      }
      default:
        stepResult = { skipped: true, reason: `unknown stage ${stage}` };
    }

    // Stage advancement.
    if (customAdvance) {
      // verify_submit / verify_poll use customAdvance (NB job state) and
      // keep their legacy semantics. Stamp stage_started_at whenever the
      // stage field changes so PR 3's stall-detection has the timestamp.
      const ca: Record<string, unknown> = { ...customAdvance };
      if (ca.stage && ca.stage !== stage) {
        ca.stage_started_at = new Date().toISOString();
        ca.rows_this_stage = 0;
      }
      await supabase.from("cert_queue_state").update(ca).eq("cert", cert);
      return {
        ...base,
        advanced: customAdvance.stage !== stage,
        next_stage: customAdvance.stage ?? stage,
        result: stepResult,
      };
    }

    // --- Drain-loop aware advancement (PR 1b) -----------------------------
    // ingest/enrich/crawl/sync all return DrainResult { done, next_cursor,
    // inserted? }. When done=false we persist the next_cursor to the
    // stage's cursor column, accumulate rows_this_stage, and stay on
    // the stage. When done=true we fall through to the legacy advance
    // path below, which additionally clears the stage cursor.
    //
    // verify_submit/verify_poll use customAdvance above and don't hit
    // this block.
    const CURSOR_COL: Record<string, string> = {
      ingest: "ingest_cursor",
      enrich: "enrich_cursor",
      crawl: "crawl_cursor",
      sync: "sync_cursor",
    };
    if (
      CURSOR_COL[stage] &&
      typeof stepResult?.done === "boolean" &&
      live &&
      !stepResult.skipped
    ) {
      if (stepResult.done === false) {
        // Stage has more work. Persist cursor, accumulate rows_this_stage,
        // do NOT advance.
        const patch: Record<string, unknown> = {
          [CURSOR_COL[stage]]: stepResult.next_cursor ?? null,
          last_error: null,
          rows_this_stage:
            (row.rows_this_stage ?? 0) + (stepResult.inserted ?? 0),
        };
        await supabase
          .from("cert_queue_state")
          .update(patch)
          .eq("cert", cert);
        return {
          ...base,
          advanced: false,
          next_stage: stage,
          result: stepResult,
        };
      }
      // done=true falls through to normal advance. Accumulate the final
      // inserted count into rows_this_stage so telemetry reflects the
      // full stage total (the normal advance path resets it to 0 on
      // stage change).
    }
    // ---------------------------------------------------------------------

    const advanced = !stepResult.skipped && !stepResult.error && !stepResult.aborted;
    if (advanced && live) {
      const ns = nextStage(stage);
      const patch: Record<string, unknown> = {
        stage: ns,
        last_error: null,
        stage_started_at: new Date().toISOString(),
        rows_this_stage: 0,
      };
      if (stage === "ingest") patch.ingest_cursor = null;
      if (stage === "enrich") patch.enrich_cursor = null;
      if (stage === "crawl") patch.crawl_cursor = null;
      if (stage === "sync") patch.sync_cursor = null;
      if (ns === "done") {
        const nowMs = Date.now();
        patch.backfill_done_at = new Date(nowMs).toISOString();
        // Mode transition on sync→done: promote backfill/weekly_sweep runs
        // to steady-state 'delta' mode, and stamp the next weekly refresh
        // so pickActiveCert's weekly-sweep branch can rewind the row in
        // 7 days. Already-delta rows keep mode='delta' (no-op).
        patch.mode = "delta";
        patch.weekly_refresh_due_at = new Date(nowMs + 7 * 86400 * 1000).toISOString();
      }
      await supabase.from("cert_queue_state").update(patch).eq("cert", cert);
    } else if (stepResult.error) {
      await supabase
        .from("cert_queue_state")
        .update({ last_error: String(stepResult.error).slice(0, 500) })
        .eq("cert", cert);
    }

    return {
      ...base,
      advanced,
      next_stage: advanced ? nextStage(stage) : stage,
      result: stepResult,
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    const stack = e instanceof Error ? e.stack : undefined;
    await alert(
      supabase,
      runId,
      "critical",
      "cert-pipeline",
      `Active step threw: cert=${cert} stage=${stage} err=${msg}`,
      { stack },
    );
    await supabase
      .from("cert_queue_state")
      .update({ last_error: msg.slice(0, 500) })
      .eq("cert", cert);
    return { ...base, error: msg };
  }
}

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------
export async function runTick(): Promise<Record<string, unknown>> {
  const PIPELINE_LIVE = process.env.PIPELINE_LIVE === "1";
  const supabase = pipelineSupabase();
  const runId = `pipeline_${Date.now()}`;
  const startedAt = new Date().toISOString();
  const SYNC_ALLOWED_CERTS = (process.env.SYNC_ALLOWED_CERTS || "hubzone")
    .toLowerCase()
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const NB_CREDIT_FLOOR = parseInt(process.env.NB_CREDIT_FLOOR || "5000", 10);

  console.log(
    `[${runId}] orchestrator start PIPELINE_LIVE=${PIPELINE_LIVE ? "1" : "0"} ` +
      `SYNC_ALLOWED_CERTS=[${SYNC_ALLOWED_CERTS.join(",")}] NB_FLOOR=${NB_CREDIT_FLOOR}`,
  );

  const hubzoneResult = await runHubzoneDelta(supabase, runId, PIPELINE_LIVE);

  let active: QueueRow | null = null;
  try {
    active = await pickActiveCert(supabase);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    await alert(supabase, runId, "error", "cert-pipeline", `pickActiveCert failed: ${msg}`);
  }

  let activeResult: Record<string, unknown> | null = null;
  if (active) {
    console.log(
      `[${runId}] active cert: ${active.cert} stage=${active.stage} priority=${active.priority}`,
    );
    activeResult = await runActiveStep(supabase, runId, active, PIPELINE_LIVE);
  } else {
    console.log(`[${runId}] no active cert — all queued certs are 'done'`);
  }

  const hubzoneNew =
    ((hubzoneResult as any)?.inserted || 0) + ((hubzoneResult as any)?.requests || 0);
  if (!active && !hubzoneNew) {
    await alert(
      supabase,
      runId,
      "info",
      "cert-pipeline",
      "tick no-op: no active cert and HUBZone delta 0 new",
      { hubzoneResult },
    );
  }

  const summary: Record<string, unknown> = {
    run_id: runId,
    source: "daily_pipeline",
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    requests: (hubzoneResult as any)?.requests || 0,
    inserted: (hubzoneResult as any)?.inserted || 0,
    per_cert: {
      hubzone_delta: hubzoneResult,
      active: activeResult,
      dry_run: !PIPELINE_LIVE,
    },
  };

  if (PIPELINE_LIVE) {
    await supabase
      .from("ingest_runs")
      .insert(summary)
      .select()
      .then(
        () => {},
        (e: { message: string }) => console.log(`  (ingest_runs insert failed: ${e.message})`),
      );
  }
  console.log(`[${runId}] tick done`, JSON.stringify(summary).slice(0, 500));
  return summary;
}
