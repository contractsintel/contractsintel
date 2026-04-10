-- G15: Public subcontracting feed — sub-awards posted under federal prime contracts.
-- Read-only: every authenticated tenant can browse, no per-tenant scoping.

CREATE TABLE IF NOT EXISTS sub_awards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prime_award_id TEXT,                  -- FPDS / USAspending PIID of the prime
  prime_contractor TEXT,
  sub_vendor TEXT NOT NULL,
  sub_uei TEXT,
  agency TEXT,
  naics_code TEXT,
  description TEXT,
  value NUMERIC(14, 2),
  awarded_at TIMESTAMPTZ,
  source TEXT DEFAULT 'usaspending',
  source_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sub_awards_naics ON sub_awards(naics_code);
CREATE INDEX IF NOT EXISTS idx_sub_awards_awarded_at ON sub_awards(awarded_at DESC);
CREATE INDEX IF NOT EXISTS idx_sub_awards_agency ON sub_awards(agency);

ALTER TABLE sub_awards ENABLE ROW LEVEL SECURITY;

-- Public to all authenticated users (no organization scoping — these are public records).
DROP POLICY IF EXISTS sub_awards_authed_select ON sub_awards;
CREATE POLICY sub_awards_authed_select ON sub_awards
  FOR SELECT USING (auth.uid() IS NOT NULL);
