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

// ---------------------------------------------------------------------------
// HUBZone delta — task (a)
// ---------------------------------------------------------------------------
async function runHubzoneDelta(
  supabase: SupabaseClient,
  runId: string,
  live: boolean,
): Promise<Record<string, unknown>> {
  try {
    if (!live) return { task: "hubzone_delta", skipped: true, reason: "PIPELINE_LIVE!=1 (dry-run)" };
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
};

async function pickActiveCert(supabase: SupabaseClient): Promise<QueueRow | null> {
  const { data, error } = await supabase
    .from("cert_queue_state")
    .select("*")
    .neq("stage", "done")
    .order("priority", { ascending: true })
    .limit(1);
  if (error) throw new Error(`pickActiveCert: ${error.message}`);
  return (data && (data[0] as QueueRow)) || null;
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
        stepResult = await ingest({ cert, mode: "backfill" });
        break;
      }
      case "enrich": {
        if (!live) {
          stepResult = { skipped: true, reason: "dry-run" };
          break;
        }
        stepResult = await enrich({ cert });
        break;
      }
      case "crawl": {
        if (!live) {
          stepResult = { skipped: true, reason: "dry-run" };
          break;
        }
        stepResult = await crawl({ cert });
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
        stepResult = await sync({ cert });
        break;
      }
      default:
        stepResult = { skipped: true, reason: `unknown stage ${stage}` };
    }

    // Stage advancement.
    if (customAdvance) {
      await supabase.from("cert_queue_state").update(customAdvance).eq("cert", cert);
      return {
        ...base,
        advanced: customAdvance.stage !== stage,
        next_stage: customAdvance.stage ?? stage,
        result: stepResult,
      };
    }

    const advanced = !stepResult.skipped && !stepResult.error && !stepResult.aborted;
    if (advanced && live) {
      const ns = nextStage(stage);
      const patch: Record<string, unknown> = { stage: ns, last_error: null };
      if (ns === "done") patch.backfill_done_at = new Date().toISOString();
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
