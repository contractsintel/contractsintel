-- PR 1b: add sync_cursor + last_tick_at to cert_queue_state.
--
-- sync_cursor: mirrors ingest/enrich/crawl_cursor — persists sync.ts's
--   {last_lead_id} across ticks so we don't re-query already-synced rows
--   on every tick. Shape: { last_lead_id?: int }.
--
-- last_tick_at: wall-clock timestamp of the most recent orchestrator
--   tick that picked this cert. Read by pickActiveCert as an R4
--   tick-overlap guard (skip a cert if another tick stamped it within
--   TICK_OVERLAP_GUARD_MS / 240s) to prevent two overlapping Vercel
--   invocations from both draining the same cert.

ALTER TABLE public.cert_queue_state
  ADD COLUMN IF NOT EXISTS sync_cursor jsonb,
  ADD COLUMN IF NOT EXISTS last_tick_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_cert_queue_state_last_tick_at
  ON public.cert_queue_state (last_tick_at)
  WHERE last_tick_at IS NOT NULL;

COMMENT ON COLUMN public.cert_queue_state.sync_cursor IS
  'Stage-local cursor for the sync stage. Shape: { last_lead_id?: int }. NULL means stage has not started or has completed.';

COMMENT ON COLUMN public.cert_queue_state.last_tick_at IS
  'Wall-clock of last orchestrator tick that picked this cert. Used by pickActiveCert R4 guard to prevent overlapping tick double-drain.';
