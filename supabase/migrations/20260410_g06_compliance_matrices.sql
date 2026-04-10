-- G06: Compliance matrix auto-generation from RFP text
-- Stores parsed Section L/M items so reviewers can edit + assign owners.

CREATE TABLE IF NOT EXISTS compliance_matrices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  opportunity_id UUID REFERENCES opportunities(id) ON DELETE SET NULL,
  source_label TEXT,                     -- e.g. "RFP-2026-04-10.pdf" or "pasted text"
  source_hash TEXT,                      -- sha256 of input for de-dup
  rows JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [{section, requirement, evidence_required, owner, status, page_ref}]
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_compliance_matrices_org ON compliance_matrices(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_compliance_matrices_opp ON compliance_matrices(opportunity_id);

ALTER TABLE compliance_matrices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS compliance_matrices_org_select ON compliance_matrices;
CREATE POLICY compliance_matrices_org_select ON compliance_matrices
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM users WHERE auth_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS compliance_matrices_org_insert ON compliance_matrices;
CREATE POLICY compliance_matrices_org_insert ON compliance_matrices
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM users WHERE auth_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS compliance_matrices_org_update ON compliance_matrices;
CREATE POLICY compliance_matrices_org_update ON compliance_matrices
  FOR UPDATE USING (
    organization_id IN (
      SELECT organization_id FROM users WHERE auth_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS compliance_matrices_org_delete ON compliance_matrices;
CREATE POLICY compliance_matrices_org_delete ON compliance_matrices
  FOR DELETE USING (
    organization_id IN (
      SELECT organization_id FROM users WHERE auth_id = auth.uid()
    )
  );
