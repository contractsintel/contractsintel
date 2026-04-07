-- Add verification tracking columns
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS last_verified_at TIMESTAMPTZ;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS verification_count INTEGER DEFAULT 0;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS last_amendment_date TIMESTAMPTZ;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS amendment_count INTEGER DEFAULT 0;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS contract_status TEXT DEFAULT 'active';

-- Indexes for verification queries
CREATE INDEX IF NOT EXISTS idx_opportunities_verified ON opportunities(last_verified_at ASC NULLS FIRST);
CREATE INDEX IF NOT EXISTS idx_opportunities_contract_status ON opportunities(contract_status);
CREATE INDEX IF NOT EXISTS idx_opportunities_status_source ON opportunities(status, source);
