BEGIN;

CREATE TABLE IF NOT EXISTS public.digest_runs (
  id              bigserial PRIMARY KEY,
  run_id          text NOT NULL UNIQUE,
  sent_at         timestamptz NOT NULL DEFAULT now(),
  recipient       text NOT NULL,
  subject         text NOT NULL,
  rollup_status   text NOT NULL CHECK (rollup_status IN ('green','yellow','red','error','stale')),
  health_run_id   text,
  body_excerpt    text,
  resend_id       text,
  dry             boolean NOT NULL DEFAULT false,
  test_recipient  boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS digest_runs_recent_idx
  ON public.digest_runs (sent_at DESC);

CREATE INDEX IF NOT EXISTS digest_runs_status_idx
  ON public.digest_runs (rollup_status, sent_at DESC);

COMMENT ON TABLE public.digest_runs IS
  'One row per /api/cron/ops-digest send attempt. Read by PR 6 heartbeat. Retention: 90d, enforced inline by the route (mirrors health_checks).';

COMMIT;
