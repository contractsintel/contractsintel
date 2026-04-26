-- PR 5 — Critical Alert Dispatcher
-- One row per alert-dispatcher send attempt.
-- Cursor for next-tick query: max(created_at) where status='sent'.
-- 90d retention enforced inline by the dispatcher route.
--
-- See docs/architecture/pr5-alert-dispatcher-plan.md §1.

BEGIN;

CREATE TABLE IF NOT EXISTS public.alert_dispatches (
  id            bigserial PRIMARY KEY,
  run_id        text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  alert_ids     bigint[] NOT NULL,
  alert_count   smallint NOT NULL,
  mode          text NOT NULL CHECK (mode IN ('single','batched','storm-summary')),
  recipient     text NOT NULL,
  subject       text NOT NULL,
  resend_id     text,
  status        text NOT NULL CHECK (status IN ('sent','failed','dry')),
  error_message text,
  attempt       smallint NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS alert_dispatches_recent_idx
  ON public.alert_dispatches (created_at DESC);

CREATE INDEX IF NOT EXISTS alert_dispatches_status_idx
  ON public.alert_dispatches (status, created_at DESC);

CREATE INDEX IF NOT EXISTS alert_dispatches_alert_ids_idx
  ON public.alert_dispatches USING gin (alert_ids);

COMMENT ON TABLE public.alert_dispatches IS
  'One row per alert-dispatcher send attempt. Cursor for next-tick query: max(created_at) where status=''sent''. 90d retention enforced inline by the dispatcher route.';

COMMIT;
