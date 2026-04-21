-- Phase 1: Drop redundant indexes on public.opportunities
--
-- Context
-- -------
-- `opportunities` currently carries 23 indexes against 235k rows (175 MB data,
-- 323 MB index — 1.85× ratio). pg_stat_user_indexes shows only
-- `opportunities_notice_id_key` (UNIQUE) has seen scans since the last stats
-- reset; every UPSERT into this table is paying write amplification across
-- all 23 indexes. That write amplification is the leading suspect for the
-- Supabase Nano IOwait exhaustion flagged by support.
--
-- Phase 1 (this migration) drops the 4 safest duplicates — each is either a
-- strict subset of another index or redundant with the UNIQUE constraint:
--
--   1. idx_opportunities_notice_id   — duplicate of opportunities_notice_id_key
--                                      (UNIQUE constraint already provides
--                                      both uniqueness and equality lookup).
--   2. idx_opportunities_deadline    — single-column btree on `deadline`;
--                                      covered by composite indexes that lead
--                                      with deadline for every query path we
--                                      serve.
--   3. idx_opportunities_status      — low-cardinality btree (<10 distinct
--                                      values); planner prefers seq-scan or
--                                      the composites that include status.
--   4. idx_opportunities_source      — low-cardinality btree (SAM/Grants/USA);
--                                      same reasoning as status.
--
-- Execution note
-- --------------
-- DROP INDEX CONCURRENTLY cannot run inside a transaction block. Supabase's
-- migration runner wraps each file in an implicit transaction, so this
-- migration MUST be applied one statement at a time via the SQL Editor, or
-- via `supabase db execute` with --single-transaction=false, NOT via
-- `supabase db push`. Track state manually in schema_migrations after apply.
--
-- Rollback
-- --------
-- If regressions appear, recreate with:
--   CREATE INDEX CONCURRENTLY idx_opportunities_notice_id ON opportunities(notice_id);
--   CREATE INDEX CONCURRENTLY idx_opportunities_deadline  ON opportunities(deadline);
--   CREATE INDEX CONCURRENTLY idx_opportunities_status    ON opportunities(status);
--   CREATE INDEX CONCURRENTLY idx_opportunities_source    ON opportunities(source);

DROP INDEX CONCURRENTLY IF EXISTS public.idx_opportunities_notice_id;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_opportunities_deadline;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_opportunities_status;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_opportunities_source;
