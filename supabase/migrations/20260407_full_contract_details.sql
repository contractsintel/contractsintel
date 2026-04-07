-- Full contract detail columns
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS full_description TEXT;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS contact_name TEXT;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS contact_email TEXT;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS contact_phone TEXT;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS contract_type TEXT;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS period_of_performance TEXT;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]';
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS response_instructions TEXT;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS naics_description TEXT;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS set_aside_description TEXT;
