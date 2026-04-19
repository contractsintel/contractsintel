-- Cert backfill queue state + cron alert table
--
-- Introduced alongside the hourly daily-pipeline orchestrator (workers/index.js + workers/jobs/daily-pipeline.js).
-- Purpose:
--   1. cert_queue_state: single-row-per-cert state machine the orchestrator
--      advances one step at a time. HUBZone seeded as 'done' (already synced:
--      812 leads ingested, 200/200 valid leads synced to Instantly). Other
--      certs begin at 'ingest' and progress through the pipeline as the
--      hourly orchestrator advances them.
--   2. cron_alerts: append-only alert log written by guard rails in the
--      orchestrator (NeverBounce credit floor, step error-rate, repeated
--      SAM/SBS 429s, Supabase write failures, unhandled exceptions).
--      Read each morning to decide whether the overnight run was clean.
--
-- SAFETY: sync_enabled is the primary safety gate for "don't sync
-- 8a/SDVOSB/WOSB/EDWOSB to Instantly until copy audits complete." The sync
-- worker also enforces a belt-and-suspenders check against the env var
-- SYNC_ALLOWED_CERTS — BOTH conditions must be true for a cert to sync.
-- Flipping sync_enabled alone does not open the gate.

BEGIN;

-- ---------------------------------------------------------------------------
-- cert_queue_state
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cert_queue_state (
  cert              text PRIMARY KEY
                    CHECK (cert IN ('hubzone','8a','sdvosb','wosb','edwosb')),
  priority          smallint NOT NULL,                -- lower = earlier in queue
  stage             text NOT NULL DEFAULT 'ingest'
                    CHECK (stage IN ('ingest','enrich','crawl','verify','sync','done')),
  sync_enabled      boolean NOT NULL DEFAULT false,
  backfill_done_at  timestamptz,
  last_tick_at      timestamptz,
  last_error        text,
  notes             text,
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cert_queue_state_active_idx
  ON public.cert_queue_state (priority)
  WHERE stage <> 'done';

-- Seed: HUBZone already caught up (812 leads, 200/200 synced). Others queued
-- for incremental overnight backfill. sync_enabled ONLY set for hubzone —
-- remaining certs stop at 'verify' until copy audits complete.
INSERT INTO public.cert_queue_state (cert, priority, stage, sync_enabled, backfill_done_at, notes) VALUES
  ('hubzone', 1, 'done',   true,  now(),
    '812 leads ingested, 200/200 valid leads synced to campaign 2cb25064. Delta-only from here.'),
  ('8a',      2, 'ingest', false, NULL,
    '63 leads already in DB (21 valid). Copy audit pending — sync_enabled=false.'),
  ('sdvosb',  3, 'ingest', false, NULL,
    '140 leads already in DB (34 valid). Copy audit pending — sync_enabled=false.'),
  ('wosb',    4, 'ingest', false, NULL,
    '0 leads in DB. Full SAM extract required. Copy audit pending — sync_enabled=false.'),
  ('edwosb',  5, 'ingest', false, NULL,
    '0 leads in DB. Parsed out of WOSB extract post-ingest. Copy audit pending — sync_enabled=false.')
ON CONFLICT (cert) DO NOTHING;

-- Keep updated_at fresh on every row change.
CREATE OR REPLACE FUNCTION public.cert_queue_state_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cert_queue_state_touch_updated_at ON public.cert_queue_state;
CREATE TRIGGER cert_queue_state_touch_updated_at
  BEFORE UPDATE ON public.cert_queue_state
  FOR EACH ROW EXECUTE FUNCTION public.cert_queue_state_touch_updated_at();

COMMENT ON TABLE public.cert_queue_state IS
  'Single-row-per-cert state machine for the hourly pipeline orchestrator. Exactly one non-done row is "active" per tick (lowest priority value). sync_enabled is the primary "allowed to reach Instantly" gate; the sync worker also enforces SYNC_ALLOWED_CERTS env var — BOTH must pass.';

-- ---------------------------------------------------------------------------
-- cron_alerts
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cron_alerts (
  id          bigserial PRIMARY KEY,
  created_at  timestamptz NOT NULL DEFAULT now(),
  severity    text NOT NULL CHECK (severity IN ('info','warn','error','critical')),
  source      text NOT NULL,              -- e.g. 'daily-pipeline', 'verify', 'sync', 'ingest'
  message     text NOT NULL,
  context     jsonb,
  run_id      text,                       -- correlate to ingest_runs.run_id where relevant
  acked_at    timestamptz,
  acked_by    text
);

CREATE INDEX IF NOT EXISTS cron_alerts_unacked_idx
  ON public.cron_alerts (created_at DESC)
  WHERE acked_at IS NULL;

CREATE INDEX IF NOT EXISTS cron_alerts_severity_idx
  ON public.cron_alerts (severity, created_at DESC);

COMMENT ON TABLE public.cron_alerts IS
  'Append-only alert log from the pipeline orchestrator guard rails. Read each morning; ack rows once handled.';

COMMIT;
