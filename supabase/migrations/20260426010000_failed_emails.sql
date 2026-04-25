-- 20260426010000_failed_emails.sql
--
-- Creates public.failed_emails to back the 4xx error-logging path in
-- lib/pipeline/sync.ts (~line 117–130). The Instantly sync writes a row
-- here on every 4xx (excluding 409 dup, 429 ratelimit) so we have an
-- audit trail of format / validation rejections.
--
-- The table did not previously exist in prod schema (PostgREST returned
-- PGRST205 "Could not find the table 'public.failed_emails'"), so every
-- 4xx since the sync went live has been silently dropped on the floor.
-- The .insert() call is wrapped in .then(noop, noop), so the missing
-- table never surfaced as an error. See:
--   docs/diagnostics/sync-gap-2026-04-26.md
--
-- Schema mirrors exactly what sync.ts writes:
--   email      → row.email                         (text, required)
--   reason     → `instantly_${status}` literal     (text, required)
--   details    → 500-char slice of body or         (text — sync.ts already
--                JSON.stringify(body)               stringifies + slices,
--                                                   so this is a plain
--                                                   string, NOT jsonb)
--   created_at → new Date().toISOString()          (timestamptz, defaulted)
--
-- Migration is unapplied. Raphael will run via Supabase Management API
-- after PR review. Affects only future error logging — no historical
-- sync state is reconstructed.

BEGIN;

CREATE TABLE IF NOT EXISTS public.failed_emails (
  id          bigserial PRIMARY KEY,
  email       text NOT NULL,
  reason      text NOT NULL,
  details     text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.failed_emails IS
  'Dead-letter log for Instantly 4xx (non-409, non-429) sync failures. Written by lib/pipeline/sync.ts on format/validation rejections.';

COMMENT ON COLUMN public.failed_emails.reason IS
  'Free-form reason string; current writer uses `instantly_<status>` (e.g. instantly_403). Kept as text rather than enum for future flexibility.';

COMMENT ON COLUMN public.failed_emails.details IS
  'Up-to-500-char slice of the upstream response body. Already a plain string at write time (sync.ts stringifies + .slice(0, 500) before insert), so kept as text rather than jsonb.';

-- Recent-failures queries (e.g. "what 4xx fired in the last hour").
CREATE INDEX IF NOT EXISTS failed_emails_created_at_idx
  ON public.failed_emails (created_at DESC);

-- "How many 403s this week" rollups.
CREATE INDEX IF NOT EXISTS failed_emails_reason_idx
  ON public.failed_emails (reason);

COMMIT;
