-- 20260424000000_leads_enrichment_fields.sql
--
-- Phase 1 of the May 4 launch plan: prep `leads` for DSBS rich-field
-- backfill + unblock native upsert for the weekly delta cron.
--
-- -----------------------------------------------------------------------
-- Scope of this migration
-- -----------------------------------------------------------------------
-- A. Additive columns for DSBS enrichment (capabilities_narrative,
--    naics_primary, year_established, keywords, county, annual_revenue,
--    business_size, enriched_at). All new, no collisions verified against
--    prod 2026-04-24.
--
-- B. dedup_key: SET NOT NULL + partial→full unique index conversion.
--    Verified preflight: 61,451 leads in prod, 0 NULL dedup_keys,
--    0 duplicates. Unblocks `.upsert({onConflict:'dedup_key'})` (PostgREST
--    can't target partial indexes) — lets the weekly delta cron run fast
--    without the client-side split hotfix currently in
--    puppeteer-server/scripts/dsbs-full-universe.js.
--
-- C. Trigger to auto-fill dedup_key when the writer omits it. Today every
--    writer sets it explicitly (ingest.ts `sam_${uei}`, DSBS scraper
--    `lower(coalesce(uei,email))`), so the trigger is defense-in-depth
--    for future writers. Column defaults can't reference other columns
--    in Postgres; trigger is the standard workaround.
--
-- -----------------------------------------------------------------------
-- Reconciliations vs the Phase 1 spec (DO NOT add; these already exist)
-- -----------------------------------------------------------------------
--   raw_data jsonb             → use existing `raw_json jsonb`
--   email_verified_status text → use existing `email_verification_status`
--                                (+ substatus, source — NeverBounce-wired)
--   email_verified_at          → already exists
--   naics_all_codes text[]     → use existing `naics_codes text[]`
--                                (populated; same semantics)
--
-- -----------------------------------------------------------------------
-- Sanitization (enforced in application write path, NOT as check constraints):
--   county:             null-out when /^Geocoding service error/i
--   additional_website: null-out when not a parseable URL
--   email:              trim whitespace + strip `? ; , < > " '` endpoints
-- -----------------------------------------------------------------------

BEGIN;

-- -----------------------------------------------------------------------
-- A. Additive enrichment columns
-- -----------------------------------------------------------------------

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS capabilities_narrative text,
  ADD COLUMN IF NOT EXISTS naics_primary          text,
  ADD COLUMN IF NOT EXISTS year_established       integer,
  ADD COLUMN IF NOT EXISTS keywords               text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS county                 text,
  ADD COLUMN IF NOT EXISTS annual_revenue         text,
  ADD COLUMN IF NOT EXISTS business_size          text,
  ADD COLUMN IF NOT EXISTS enriched_at            timestamptz;

COMMENT ON COLUMN public.leads.capabilities_narrative IS
  'Free-text capabilities statement (DSBS ~400-800 chars typical).';
COMMENT ON COLUMN public.leads.naics_primary IS
  'Single primary NAICS. leads.naics_codes retains the full array.';
COMMENT ON COLUMN public.leads.keywords IS
  'Free-text keywords list from the firm''s DSBS profile.';
COMMENT ON COLUMN public.leads.county IS
  'Physical-address county. Mapper null-outs "Geocoding service error:" strings from SBS.';
COMMENT ON COLUMN public.leads.annual_revenue IS
  'Nullable; SBS exposes the filter control but returns null in result rows.';
COMMENT ON COLUMN public.leads.business_size IS
  'Nullable; same SBS caveat as annual_revenue.';
COMMENT ON COLUMN public.leads.enriched_at IS
  'Timestamp of most recent enrichment write (DSBS re-scrape, crawl, etc.).';

-- -----------------------------------------------------------------------
-- B. dedup_key NOT NULL + partial → full unique index
-- -----------------------------------------------------------------------
-- Preflight proven safe 2026-04-24 (0 NULLs, 0 duplicates on 61,451 rows).

ALTER TABLE public.leads
  ALTER COLUMN dedup_key SET NOT NULL;

DROP INDEX IF EXISTS public.leads_dedup_key_uniq;

CREATE UNIQUE INDEX leads_dedup_key_uniq
  ON public.leads (dedup_key);

COMMENT ON INDEX public.leads_dedup_key_uniq IS
  'Plain (non-partial) unique index so PostgREST can target it in ON CONFLICT. Replaces pre-2026-04-24 partial variant.';

-- -----------------------------------------------------------------------
-- C. Trigger to auto-fill dedup_key when the writer omits it
-- -----------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.leads_fill_dedup_key()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.dedup_key IS NULL THEN
    NEW.dedup_key := lower(coalesce(NEW.uei, NEW.email));
  END IF;
  IF NEW.dedup_key IS NULL THEN
    RAISE EXCEPTION 'leads.dedup_key cannot be derived: both uei and email are NULL';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS leads_fill_dedup_key ON public.leads;
CREATE TRIGGER leads_fill_dedup_key
  BEFORE INSERT OR UPDATE OF uei, email, dedup_key ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.leads_fill_dedup_key();

COMMENT ON FUNCTION public.leads_fill_dedup_key IS
  'Populate leads.dedup_key = lower(coalesce(uei, email)) when writer omits it. All current writers set it explicitly; trigger is defense-in-depth.';

COMMIT;
