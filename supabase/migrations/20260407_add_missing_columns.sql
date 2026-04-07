-- Add missing columns to opportunity_matches that the dashboard expects
ALTER TABLE opportunity_matches ADD COLUMN IF NOT EXISTS pipeline_stage TEXT DEFAULT NULL;
ALTER TABLE opportunity_matches ADD COLUMN IF NOT EXISTS user_status TEXT DEFAULT 'new';
ALTER TABLE opportunity_matches ADD COLUMN IF NOT EXISTS reasoning TEXT DEFAULT NULL;
ALTER TABLE opportunity_matches ADD COLUMN IF NOT EXISTS recommendation_reasoning TEXT DEFAULT NULL;
ALTER TABLE opportunity_matches ADD COLUMN IF NOT EXISTS notification_sent BOOLEAN DEFAULT FALSE;
ALTER TABLE opportunity_matches ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE opportunity_matches ADD COLUMN IF NOT EXISTS award_amount NUMERIC DEFAULT NULL;
ALTER TABLE opportunity_matches ADD COLUMN IF NOT EXISTS contract_number TEXT DEFAULT NULL;
ALTER TABLE opportunity_matches ADD COLUMN IF NOT EXISTS loss_reason TEXT DEFAULT NULL;
ALTER TABLE opportunity_matches ADD COLUMN IF NOT EXISTS loss_notes TEXT DEFAULT NULL;

-- Add missing columns to opportunities table that the dashboard expects
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS source_url TEXT DEFAULT NULL;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS value_estimate NUMERIC DEFAULT NULL;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS estimated_value NUMERIC DEFAULT NULL;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS sam_url TEXT DEFAULT NULL;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS incumbent_name TEXT DEFAULT NULL;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS incumbent_value NUMERIC DEFAULT NULL;
