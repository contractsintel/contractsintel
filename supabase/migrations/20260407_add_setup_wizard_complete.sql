ALTER TABLE organizations ADD COLUMN IF NOT EXISTS setup_wizard_complete BOOLEAN DEFAULT false;
