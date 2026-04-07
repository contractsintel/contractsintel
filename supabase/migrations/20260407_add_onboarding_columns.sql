-- Onboarding flow columns
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS onboarding_complete BOOLEAN DEFAULT false;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS onboarding_goal TEXT;
