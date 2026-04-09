-- P0.1: CMMC tracking on organizations + FAR change ordering on compliance_items
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS cmmc_current_level INT DEFAULT 0;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS cmmc_target_level INT DEFAULT 0;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS cmmc_last_assessment DATE;

-- effective_date used to order FAR change alerts (category = 'far_change')
ALTER TABLE compliance_items ADD COLUMN IF NOT EXISTS effective_date DATE;
CREATE INDEX IF NOT EXISTS idx_compliance_items_category_effective
  ON compliance_items(category, effective_date DESC);

-- P0.4: Notification preferences as JSONB on organizations
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS notification_preferences JSONB DEFAULT '{}'::jsonb;
