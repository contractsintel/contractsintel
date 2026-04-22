-- Pipeline v2 — PR 1a schema additions on cert_queue_state
--
-- Context
-- -------
-- Pipeline v2 (docs/architecture/pipeline-v2.md §A + §I) replaces the
-- "one stage per tick, advance or stay" behavior with a drain-loop
-- orchestrator that can resume mid-stage via a persisted cursor, and
-- distinguishes three operating modes:
--
--   backfill       — full cert universe, paginated across many ticks
--   delta          — last-N-day lookback; current behavior, no cursor
--   weekly_sweep   — full-universe replay every 7 days
--
-- PR 1a (this migration) lands ONLY the schema. PR 1b wires the
-- cursor-aware stage modules and mode routing. For PR 1a the columns
-- exist but behavior is unchanged: orchestrator reads `mode` to pass
-- through to ingest.ts, ingest.ts returns done=true every call (no
-- drain), so nothing advances differently from today.
--
-- Safety
-- ------
-- - All additions are additive with IF NOT EXISTS — safe to re-run.
-- - `mode` has a NOT NULL default so existing rows are backfilled to
--   sensible values without a separate UPDATE: hubzone (already done,
--   delta) is set explicitly, others default to 'backfill'.
-- - No behavior changes until PR 1b.

BEGIN;

ALTER TABLE public.cert_queue_state
  ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'backfill'
    CHECK (mode IN ('backfill','delta','weekly_sweep')),
  ADD COLUMN IF NOT EXISTS ingest_cursor jsonb,
  ADD COLUMN IF NOT EXISTS enrich_cursor jsonb,
  ADD COLUMN IF NOT EXISTS crawl_cursor jsonb,
  ADD COLUMN IF NOT EXISTS weekly_refresh_due_at timestamptz,
  ADD COLUMN IF NOT EXISTS stage_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS rows_this_stage int NOT NULL DEFAULT 0;

-- HUBZone finished its backfill prior to this migration (see the 2026-04-18
-- seed: "812 leads ingested, 200/200 synced"). Promote it to delta mode and
-- start its weekly-refresh clock.
UPDATE public.cert_queue_state
SET mode = 'delta',
    weekly_refresh_due_at = COALESCE(weekly_refresh_due_at, now() + interval '7 days')
WHERE cert = 'hubzone'
  AND backfill_done_at IS NOT NULL;

COMMENT ON COLUMN public.cert_queue_state.mode IS
  'Pipeline operating mode. backfill=full universe via paginated cursor; delta=last-N-day lookback; weekly_sweep=periodic full replay. PR 1a ships the column; PR 1b wires the routing logic.';

COMMENT ON COLUMN public.cert_queue_state.ingest_cursor IS
  'Stage-local cursor for the ingest stage. Shape: { page?: int, extract_token?: text, last_uei?: text }. NULL means stage has not started or has completed. Persisted between ticks by the drain-aware orchestrator.';

COMMENT ON COLUMN public.cert_queue_state.enrich_cursor IS
  'Stage-local cursor for the enrich stage. PR 1a reserves the column; PR 1b wires the drain loop.';

COMMENT ON COLUMN public.cert_queue_state.crawl_cursor IS
  'Stage-local cursor for the crawl stage. PR 1a reserves the column; PR 1b wires the drain loop.';

COMMENT ON COLUMN public.cert_queue_state.weekly_refresh_due_at IS
  'When a cert becomes eligible for weekly_sweep mode. Set on first entry to delta; bumped each sweep completion.';

COMMENT ON COLUMN public.cert_queue_state.stage_started_at IS
  'Timestamp of the most recent stage transition. Read by the health-check cron (PR 3) to detect drain stalls (>6h on a single stage).';

COMMENT ON COLUMN public.cert_queue_state.rows_this_stage IS
  'Cumulative rows processed on the current stage (resets on stage advance). Observability field; not load-bearing for advancement decisions.';

COMMIT;
