-- G05: RFP shredder — Anthropic-extracted structure of an RFP/solicitation.

CREATE TABLE IF NOT EXISTS rfp_shreds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  opportunity_id UUID REFERENCES opportunities(id) ON DELETE SET NULL,
  source_label TEXT,
  source_hash TEXT,
  sections JSONB NOT NULL DEFAULT '{}'::jsonb,  -- {section_l, section_m, evaluation_criteria, deadlines, incumbent_hints, summary}
  confidence NUMERIC(3,2),                       -- 0.00 .. 1.00
  extracted_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_rfp_shreds_org ON rfp_shreds(organization_id, extracted_at DESC);
CREATE INDEX IF NOT EXISTS idx_rfp_shreds_opp ON rfp_shreds(opportunity_id);

ALTER TABLE rfp_shreds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rfp_shreds_org_select ON rfp_shreds;
CREATE POLICY rfp_shreds_org_select ON rfp_shreds
  FOR SELECT USING (
    organization_id IN (SELECT organization_id FROM users WHERE auth_id = auth.uid())
  );

DROP POLICY IF EXISTS rfp_shreds_org_insert ON rfp_shreds;
CREATE POLICY rfp_shreds_org_insert ON rfp_shreds
  FOR INSERT WITH CHECK (
    organization_id IN (SELECT organization_id FROM users WHERE auth_id = auth.uid())
  );

DROP POLICY IF EXISTS rfp_shreds_org_delete ON rfp_shreds;
CREATE POLICY rfp_shreds_org_delete ON rfp_shreds
  FOR DELETE USING (
    organization_id IN (SELECT organization_id FROM users WHERE auth_id = auth.uid())
  );
