-- Track NeverBounce async job so verify can span multiple ticks
ALTER TABLE cert_queue_state
  ADD COLUMN IF NOT EXISTS nb_job_id text,
  ADD COLUMN IF NOT EXISTS nb_submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS nb_batch_size int;

-- Widen the stage CHECK to include the verify split.
-- Old: 'ingest','enrich','crawl','verify','sync','done'
-- New: adds 'verify_submit','verify_poll'. Legacy 'verify' kept as a valid
--      value so any in-flight row from Saturday's seed doesn't break.
ALTER TABLE cert_queue_state
  DROP CONSTRAINT IF EXISTS cert_queue_state_stage_check;
ALTER TABLE cert_queue_state
  ADD CONSTRAINT cert_queue_state_stage_check
  CHECK (stage IN ('ingest','enrich','crawl','verify','verify_submit','verify_poll','sync','done'));
