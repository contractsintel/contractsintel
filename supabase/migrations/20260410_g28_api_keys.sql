-- G28: Public REST API key storage. Keys are issued once at creation time;
-- only the SHA-256 hash is persisted. The first 8 chars of the raw key are
-- kept as `prefix` so users can recognize keys in the UI without us being
-- able to retrieve the secret.

CREATE TABLE IF NOT EXISTS org_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  prefix TEXT NOT NULL,
  hashed_key TEXT NOT NULL UNIQUE,
  scopes TEXT[] NOT NULL DEFAULT ARRAY['read']::TEXT[],
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_org_api_keys_org ON org_api_keys(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_org_api_keys_hashed_active ON org_api_keys(hashed_key) WHERE revoked_at IS NULL;

ALTER TABLE org_api_keys ENABLE ROW LEVEL SECURITY;

-- Tenant-scoped: only members of the owning org can list/insert/update.
DROP POLICY IF EXISTS org_api_keys_tenant_select ON org_api_keys;
CREATE POLICY org_api_keys_tenant_select ON org_api_keys
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM users WHERE auth_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS org_api_keys_tenant_insert ON org_api_keys;
CREATE POLICY org_api_keys_tenant_insert ON org_api_keys
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM users WHERE auth_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS org_api_keys_tenant_update ON org_api_keys;
CREATE POLICY org_api_keys_tenant_update ON org_api_keys
  FOR UPDATE USING (
    organization_id IN (
      SELECT organization_id FROM users WHERE auth_id = auth.uid()
    )
  );
