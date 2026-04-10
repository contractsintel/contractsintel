-- G29: Capability Statement AI writer — store generated capability statements per org.

CREATE TABLE IF NOT EXISTS capability_statements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title TEXT,
  markdown TEXT NOT NULL,
  source_summary JSONB NOT NULL DEFAULT '{}'::jsonb, -- {past_performance_count, naics, certs}
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_capability_statements_org ON capability_statements(organization_id, created_at DESC);

ALTER TABLE capability_statements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS capability_statements_org_select ON capability_statements;
CREATE POLICY capability_statements_org_select ON capability_statements
  FOR SELECT USING (
    organization_id IN (SELECT organization_id FROM users WHERE auth_id = auth.uid())
  );

DROP POLICY IF EXISTS capability_statements_org_insert ON capability_statements;
CREATE POLICY capability_statements_org_insert ON capability_statements
  FOR INSERT WITH CHECK (
    organization_id IN (SELECT organization_id FROM users WHERE auth_id = auth.uid())
  );

DROP POLICY IF EXISTS capability_statements_org_delete ON capability_statements;
CREATE POLICY capability_statements_org_delete ON capability_statements
  FOR DELETE USING (
    organization_id IN (SELECT organization_id FROM users WHERE auth_id = auth.uid())
  );
