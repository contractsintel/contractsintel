/**
 * Shared pipeline types — PR 1a.
 *
 * Pipeline v2 (docs/architecture/pipeline-v2.md §A) introduces a drain-loop
 * orchestrator: each stage returns a `DrainResult` telling the orchestrator
 * whether it has more work and, if so, the cursor to resume from on the
 * next tick.
 *
 * PR 1a adopts this shape on `ingest()` only. `enrich`, `crawl`,
 * `verify_submit`, `verify_poll`, and `sync` keep their existing shapes
 * until PR 1b wires cursor-aware behavior into them.
 */

export type PipelineMode = "backfill" | "delta" | "weekly_sweep";

/**
 * Opaque cursor payload. Shape is stage-specific and persisted as jsonb on
 * cert_queue_state.{ingest,enrich,crawl}_cursor between ticks.
 */
export type StageCursor = Record<string, unknown> | null;

/**
 * Standard drain-aware stage return.
 *
 * Semantics:
 *   done=true   → stage has no more work. Orchestrator advances to the
 *                 next stage and clears this stage's cursor.
 *   done=false  → stage has more work. Orchestrator persists next_cursor
 *                 and keeps the row on the current stage.
 *
 * The skipped/reason/error fields preserve backward compatibility with the
 * legacy return shapes so the orchestrator can still fall through to the
 * existing (!skipped && !error) advance rule for stages that haven't been
 * migrated yet.
 */
export interface DrainResult {
  done: boolean;
  next_cursor?: StageCursor;

  // Stage-specific counters (observability).
  requests?: number;
  inserted?: number;

  // Legacy pass-through for skip/error surfacing.
  skipped?: boolean;
  reason?: string;
  error?: string;

  // verify_submit → verify_poll handoff (NB async job lifecycle).
  // When verify_submit returns a jobId the orchestrator writes it onto
  // cert_queue_state.nb_job_id + nb_batch_size and advances stage.
  jobId?: string;
  batchSize?: number;

  // verify_poll: set to true when NB status='running' (still polling).
  // Kept distinct from done=false to signal "waiting on external" vs
  // "more local work to do." Orchestrator treats both the same (no
  // advance), but this lets logs/metrics distinguish the two cases.
  waiting?: boolean;

  // verify_poll counters.
  valid?: number;
  invalid?: number;
  catchall?: number;
  unknown?: number;
}
