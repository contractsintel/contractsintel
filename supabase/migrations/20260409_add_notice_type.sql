-- Add notice_type column to track SAM.gov notice type codes
-- (a) Award Notice, (p) Presolicitation, (o) Solicitation, (k) Combined,
-- (r) Sources Sought, (s) Special Notice, (u) Justification, (g) Surplus, etc.
-- Previously the notice type was being destroyed by the backfill, which
-- overwrote contract_type with classificationCode (a PSC code).
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS notice_type TEXT;
CREATE INDEX IF NOT EXISTS idx_opportunities_notice_type ON opportunities(notice_type);
