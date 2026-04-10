-- G04: Grants.gov + SBIR/STTR opportunity types.
-- Adds an opportunity_type tag to opportunities so the dashboard can filter
-- between contracts, grants, SBIR, and STTR funding paths.

ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS opportunity_type TEXT NOT NULL DEFAULT 'contract'
    CHECK (opportunity_type IN ('contract', 'grant', 'sbir', 'sttr'));

-- Backfill: anything from grants.gov source becomes a grant; SBIR/STTR-flavored
-- titles get the appropriate type. Existing rows default to 'contract'.
UPDATE opportunities
   SET opportunity_type = 'grant'
 WHERE source ILIKE '%grants%'
   AND opportunity_type = 'contract';

UPDATE opportunities
   SET opportunity_type = 'sbir'
 WHERE (title ILIKE '%SBIR%' OR solicitation_number ILIKE '%SBIR%')
   AND opportunity_type = 'contract';

UPDATE opportunities
   SET opportunity_type = 'sttr'
 WHERE (title ILIKE '%STTR%' OR solicitation_number ILIKE '%STTR%')
   AND opportunity_type = 'contract';

CREATE INDEX IF NOT EXISTS idx_opportunities_type ON opportunities(opportunity_type);
