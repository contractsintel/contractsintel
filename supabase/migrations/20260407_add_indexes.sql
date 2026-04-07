-- Performance indexes for 100K+ opportunities
CREATE INDEX IF NOT EXISTS idx_opportunities_source ON opportunities(source);
CREATE INDEX IF NOT EXISTS idx_opportunities_naics ON opportunities(naics_code);
CREATE INDEX IF NOT EXISTS idx_opportunities_deadline ON opportunities(response_deadline);
CREATE INDEX IF NOT EXISTS idx_opportunities_created ON opportunities(created_at);
CREATE INDEX IF NOT EXISTS idx_opportunities_value ON opportunities(value_estimate);
CREATE INDEX IF NOT EXISTS idx_opportunities_last_seen ON opportunities(last_seen_at);
CREATE INDEX IF NOT EXISTS idx_opportunities_notice_id ON opportunities(notice_id);
CREATE INDEX IF NOT EXISTS idx_matches_org_score ON opportunity_matches(organization_id, match_score DESC);
CREATE INDEX IF NOT EXISTS idx_matches_status ON opportunity_matches(user_status);
CREATE INDEX IF NOT EXISTS idx_matches_demo ON opportunity_matches(is_demo);
