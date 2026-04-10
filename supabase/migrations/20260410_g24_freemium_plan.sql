-- G24: Freemium tier — daily search quota tracked per organization.

-- Per-org quota counter; resets when daily_search_reset_at < now() at UTC midnight.
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS daily_search_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS daily_search_reset_at TIMESTAMPTZ;

-- Note: subscription_tier is free-form text; "free" is now a valid value alongside
-- discovery / bd_pro / team. No enum constraint exists, so no DDL needed for that.

CREATE INDEX IF NOT EXISTS idx_orgs_subscription_tier ON organizations(subscription_tier);
