-- Migration: 20260426000000_health_checks.sql
-- PR 3 — Health Monitoring Cron
-- One row per check per /api/cron/health-check tick. See
-- docs/architecture/pr3-health-check-plan.md §2 for design.

BEGIN;

CREATE TABLE IF NOT EXISTS public.health_checks (
  id            bigserial PRIMARY KEY,
  run_id        text NOT NULL,                          -- one run_id per cron tick; uuid v4
  check_name    text NOT NULL CHECK (check_name IN (
                  'cron_coverage',
                  'p_route_timeouts',
                  'sam_sbs_failures',
                  'supabase_health',
                  'unacked_cron_alerts',
                  'neverbounce_credits',
                  'pipeline_stalls'
                )),
  status        text NOT NULL CHECK (status IN ('green','yellow','red','error')),
  metric        numeric,                                 -- the headline number (e.g. credit count, stall hours)
  threshold     numeric,                                 -- the threshold the check used (for audit)
  details       jsonb,                                   -- per-check structured payload
  error_message text,                                    -- populated when status='error'
  duration_ms   int,                                     -- per-check latency
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS health_checks_run_idx
  ON public.health_checks (run_id);

CREATE INDEX IF NOT EXISTS health_checks_recent_idx
  ON public.health_checks (created_at DESC);

CREATE INDEX IF NOT EXISTS health_checks_red_idx
  ON public.health_checks (created_at DESC)
  WHERE status IN ('red','error');

COMMENT ON TABLE public.health_checks IS
  'One row per check per /api/cron/health-check tick. Read by the morning dashboard. Retention: 90 days, enforced inline by the health-check route.';

COMMIT;
