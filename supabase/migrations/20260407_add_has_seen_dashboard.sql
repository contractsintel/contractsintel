ALTER TABLE organizations ADD COLUMN IF NOT EXISTS has_seen_dashboard BOOLEAN DEFAULT false;
