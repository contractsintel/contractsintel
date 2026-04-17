-- 2026-04-17_leads_cold_outbound_routing.sql
BEGIN;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS cert_types text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS primary_cert text,
  ADD COLUMN IF NOT EXISTS naics_codes text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS source_url text,
  ADD COLUMN IF NOT EXISTS dedup_key text,
  ADD COLUMN IF NOT EXISTS synced_to_instantly_at timestamptz,
  ADD COLUMN IF NOT EXISTS instantly_campaign_id text,
  ADD COLUMN IF NOT EXISTS instantly_lead_id text;

ALTER TABLE public.leads
  ADD CONSTRAINT leads_primary_cert_check
  CHECK (primary_cert IS NULL OR primary_cert IN ('8a','sdvosb','wosb','edwosb','hubzone'));

CREATE UNIQUE INDEX IF NOT EXISTS leads_dedup_key_uniq
  ON public.leads (dedup_key)
  WHERE dedup_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS leads_source_unsynced_idx
  ON public.leads (source, primary_cert)
  WHERE synced_to_instantly_at IS NULL;

COMMENT ON COLUMN public.leads.source IS
  'Lead origin. Cold-outbound values: dsbs | sam_entity | vetcert | manual. Legacy: sam_audit (agency POCs — do NOT route to Instantly). Inbound: audit.';

COMMENT ON COLUMN public.leads.primary_cert IS
  'Single cert used for Instantly campaign routing. Map: 8a→8(a), sdvosb→SDVOSB, wosb|edwosb→WOSB/EDWOSB, hubzone→HUBZone.';

COMMENT ON COLUMN public.leads.dedup_key IS
  'lower(coalesce(uei, email)). Enforces idempotent inserts across scrapers.';

COMMIT;
