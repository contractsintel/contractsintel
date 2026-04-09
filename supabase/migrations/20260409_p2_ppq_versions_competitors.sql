-- P2.3: Past performance — narrative version history
ALTER TABLE past_performance ADD COLUMN IF NOT EXISTS ppq_narrative_versions JSONB DEFAULT '[]'::jsonb;

-- P2.4: Competitors hardening
ALTER TABLE competitors DROP CONSTRAINT IF EXISTS competitors_org_name_unique;
ALTER TABLE competitors ADD CONSTRAINT competitors_org_name_unique UNIQUE (organization_id, name);

CREATE TABLE IF NOT EXISTS competitor_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competitor_id UUID NOT NULL REFERENCES competitors(id) ON DELETE CASCADE,
  analysis TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_competitor_analyses_competitor ON competitor_analyses(competitor_id, created_at DESC);

ALTER TABLE competitor_analyses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS competitor_analyses_org_select ON competitor_analyses;
CREATE POLICY competitor_analyses_org_select ON competitor_analyses
  FOR SELECT USING (
    competitor_id IN (
      SELECT id FROM competitors WHERE organization_id IN (
        SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
      )
    )
  );
DROP POLICY IF EXISTS competitor_analyses_org_insert ON competitor_analyses;
CREATE POLICY competitor_analyses_org_insert ON competitor_analyses
  FOR INSERT WITH CHECK (
    competitor_id IN (
      SELECT id FROM competitors WHERE organization_id IN (
        SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
      )
    )
  );
