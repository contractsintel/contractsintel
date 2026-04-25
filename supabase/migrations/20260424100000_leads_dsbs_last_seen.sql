-- 20260424100000_leads_dsbs_last_seen.sql
--
-- Adds dsbs_last_seen_at to public.leads to support the weekly DSBS sweep's
-- deactivation-detection pass.
--
-- Workflow:
--   * Daily delta cron (/api/cron/dsbs-delta) updates this on every row it
--     touches (insert or update path).
--   * Weekly sweep cron (/api/cron/dsbs-weekly-sweep) updates this for every
--     row present in the SBS response, then surfaces a count of dsbs-source
--     leads whose dsbs_last_seen_at is older than the sweep started_at as
--     a "deactivation candidate" metric in scraper_runs.
--
-- We intentionally do NOT flip is_active or otherwise mutate not-seen rows
-- in this migration / cron — disappearing from SBS for a week is not a
-- strong-enough signal to deactivate (transient SBS outages, opt-outs,
-- profile rebuilds, etc.). The metric is captured for now; downstream
-- automation can be wired in a follow-up PR once we have a few weeks of
-- baseline data on how noisy week-over-week churn actually is.
--
-- Phase 1 of feat/dsbs-delta-and-weekly-cron. DO NOT push to prod via CLI;
-- Raphael will run this manually after PR review.

BEGIN;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS dsbs_last_seen_at timestamptz;

COMMENT ON COLUMN public.leads.dsbs_last_seen_at IS
  'Timestamp of most recent DSBS sweep (delta or weekly) that observed this firm. NULL for non-DSBS leads.';

-- Partial index for the weekly sweep''s deactivation-candidate query
-- (source=''dsbs'' AND dsbs_last_seen_at < <sweep_started_at>).
CREATE INDEX IF NOT EXISTS leads_dsbs_last_seen_at_idx
  ON public.leads (dsbs_last_seen_at)
  WHERE source = 'dsbs';

COMMIT;
