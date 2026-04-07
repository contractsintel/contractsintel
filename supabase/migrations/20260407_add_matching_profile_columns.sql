-- Matching profile columns for the 5-signal scoring engine
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS keywords TEXT[] DEFAULT '{}';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS serves_nationwide BOOLEAN DEFAULT true;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS service_states TEXT[] DEFAULT '{}';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS preferred_agencies TEXT[] DEFAULT '{}';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS min_contract_value BIGINT DEFAULT 0;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS max_contract_value BIGINT DEFAULT 0;

-- Ensure recommendation_reasoning column exists on matches
ALTER TABLE opportunity_matches ADD COLUMN IF NOT EXISTS recommendation_reasoning TEXT;
