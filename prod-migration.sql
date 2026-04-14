-- =============================================================================
-- ContractsIntel — Production migration: 13 missing tables
-- Generated: 2026-04-14
-- Tables: agencies, capability_statements, compliance_matrices,
--         contracting_officers, copilot_messages, copilot_threads, forecasts,
--         org_api_keys, pipeline_items, rfp_shreds, sub_awards,
--         teaming_partners, tracked_competitors
--
-- IMPORTANT: All CREATE TABLE use IF NOT EXISTS. No seed data included.
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. agencies  (from g10)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  acronym TEXT,
  parent_agency_id UUID REFERENCES agencies(id),
  description TEXT,
  website TEXT,
  total_obligations BIGINT,
  active_opportunities INT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_agencies_acronym ON agencies(acronym);
CREATE INDEX IF NOT EXISTS idx_agencies_parent ON agencies(parent_agency_id);

ALTER TABLE agencies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agencies_select_authenticated" ON agencies;
CREATE POLICY "agencies_select_authenticated"
  ON agencies FOR SELECT TO authenticated USING (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. contracting_officers  (from g10, depends on agencies)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contracting_officers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  title TEXT,
  email TEXT,
  phone TEXT,
  office TEXT,
  source TEXT DEFAULT 'sam_gov',
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_contracting_officers_agency ON contracting_officers(agency_id);

ALTER TABLE contracting_officers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cos_select_authenticated" ON contracting_officers;
CREATE POLICY "cos_select_authenticated"
  ON contracting_officers FOR SELECT TO authenticated USING (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. forecasts  (from g03)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS forecasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency TEXT NOT NULL,
  naics TEXT,
  expected_rfp_at DATE NOT NULL,
  period_end DATE,
  incumbent TEXT,
  estimated_value BIGINT,
  source TEXT NOT NULL DEFAULT 'recompete_projection',
  confidence NUMERIC(3,2) NOT NULL DEFAULT 0.60,
  linked_recompete_award_id UUID,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_forecasts_expected_rfp_at ON forecasts(expected_rfp_at);
CREATE INDEX IF NOT EXISTS idx_forecasts_agency ON forecasts(agency);
CREATE INDEX IF NOT EXISTS idx_forecasts_naics ON forecasts(naics) WHERE naics IS NOT NULL;

ALTER TABLE forecasts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "forecasts_select_authenticated" ON forecasts;
CREATE POLICY "forecasts_select_authenticated"
  ON forecasts FOR SELECT TO authenticated
  USING (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. rfp_shreds  (from g05)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rfp_shreds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  opportunity_id UUID REFERENCES opportunities(id) ON DELETE SET NULL,
  source_label TEXT,
  source_hash TEXT,
  sections JSONB NOT NULL DEFAULT '{}'::jsonb,
  confidence NUMERIC(3,2),
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

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. compliance_matrices  (from g06)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS compliance_matrices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  opportunity_id UUID REFERENCES opportunities(id) ON DELETE SET NULL,
  source_label TEXT,
  source_hash TEXT,
  rows JSONB NOT NULL DEFAULT '[]'::jsonb,
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

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. teaming_partners  (from g11)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS teaming_partners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  uei TEXT UNIQUE,
  cage_code TEXT,
  website TEXT,
  summary TEXT,
  naics_codes TEXT[] NOT NULL DEFAULT '{}',
  set_asides TEXT[] NOT NULL DEFAULT '{}',
  state TEXT,
  city TEXT,
  capabilities TEXT[] NOT NULL DEFAULT '{}',
  past_agencies TEXT[] NOT NULL DEFAULT '{}',
  employee_range TEXT,
  contact_email TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_teaming_partners_naics ON teaming_partners USING GIN (naics_codes);
CREATE INDEX IF NOT EXISTS idx_teaming_partners_set_asides ON teaming_partners USING GIN (set_asides);
CREATE INDEX IF NOT EXISTS idx_teaming_partners_state ON teaming_partners(state);

ALTER TABLE teaming_partners ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "teaming_partners_select_authenticated" ON teaming_partners;
CREATE POLICY "teaming_partners_select_authenticated"
  ON teaming_partners FOR SELECT TO authenticated USING (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. sub_awards  (from g15)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sub_awards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prime_award_id TEXT,
  prime_contractor TEXT,
  sub_vendor TEXT NOT NULL,
  sub_uei TEXT,
  agency TEXT,
  naics_code TEXT,
  description TEXT,
  value NUMERIC(14, 2),
  awarded_at TIMESTAMPTZ,
  source TEXT DEFAULT 'usaspending',
  source_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sub_awards_naics ON sub_awards(naics_code);
CREATE INDEX IF NOT EXISTS idx_sub_awards_awarded_at ON sub_awards(awarded_at DESC);
CREATE INDEX IF NOT EXISTS idx_sub_awards_agency ON sub_awards(agency);

ALTER TABLE sub_awards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sub_awards_authed_select ON sub_awards;
CREATE POLICY sub_awards_authed_select ON sub_awards
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. copilot_threads  (from g20)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS copilot_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  title TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_copilot_threads_org ON copilot_threads(organization_id, created_at DESC);

ALTER TABLE copilot_threads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS copilot_threads_tenant ON copilot_threads;
CREATE POLICY copilot_threads_tenant ON copilot_threads
  FOR ALL USING (
    organization_id IN (
      SELECT organization_id FROM users WHERE auth_id = auth.uid()
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM users WHERE auth_id = auth.uid()
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. copilot_messages  (from g20, depends on copilot_threads)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS copilot_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES copilot_threads(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_copilot_messages_thread ON copilot_messages(thread_id, created_at);

ALTER TABLE copilot_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS copilot_messages_tenant ON copilot_messages;
CREATE POLICY copilot_messages_tenant ON copilot_messages
  FOR ALL USING (
    thread_id IN (
      SELECT id FROM copilot_threads
       WHERE organization_id IN (
         SELECT organization_id FROM users WHERE auth_id = auth.uid()
       )
    )
  )
  WITH CHECK (
    thread_id IN (
      SELECT id FROM copilot_threads
       WHERE organization_id IN (
         SELECT organization_id FROM users WHERE auth_id = auth.uid()
       )
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. org_api_keys  (from g28)
-- ─────────────────────────────────────────────────────────────────────────────
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

-- ─────────────────────────────────────────────────────────────────────────────
-- 11. capability_statements  (from g29)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS capability_statements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title TEXT,
  markdown TEXT NOT NULL,
  source_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
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

-- ─────────────────────────────────────────────────────────────────────────────
-- 12. pipeline_items  (no migration file found — schema inferred from app usage)
--     Org-scoped pipeline/kanban tracker for opportunities being pursued.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pipeline_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  opportunity_id UUID REFERENCES opportunities(id) ON DELETE SET NULL,
  title TEXT,
  stage TEXT NOT NULL DEFAULT 'identified',
  value BIGINT,
  notes TEXT,
  assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pipeline_items_org ON pipeline_items(organization_id, stage);
CREATE INDEX IF NOT EXISTS idx_pipeline_items_opp ON pipeline_items(opportunity_id);

ALTER TABLE pipeline_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pipeline_items_org_select ON pipeline_items;
CREATE POLICY pipeline_items_org_select ON pipeline_items
  FOR SELECT USING (
    organization_id IN (SELECT organization_id FROM users WHERE auth_id = auth.uid())
  );

DROP POLICY IF EXISTS pipeline_items_org_insert ON pipeline_items;
CREATE POLICY pipeline_items_org_insert ON pipeline_items
  FOR INSERT WITH CHECK (
    organization_id IN (SELECT organization_id FROM users WHERE auth_id = auth.uid())
  );

DROP POLICY IF EXISTS pipeline_items_org_update ON pipeline_items;
CREATE POLICY pipeline_items_org_update ON pipeline_items
  FOR UPDATE USING (
    organization_id IN (SELECT organization_id FROM users WHERE auth_id = auth.uid())
  );

DROP POLICY IF EXISTS pipeline_items_org_delete ON pipeline_items;
CREATE POLICY pipeline_items_org_delete ON pipeline_items
  FOR DELETE USING (
    organization_id IN (SELECT organization_id FROM users WHERE auth_id = auth.uid())
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 13. tracked_competitors  (no migration file found — schema inferred from app usage)
--     Org-scoped list of competitors being tracked/monitored.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tracked_competitors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  website TEXT,
  uei TEXT,
  cage_code TEXT,
  naics_codes TEXT[] NOT NULL DEFAULT '{}',
  notes TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tracked_competitors_org ON tracked_competitors(organization_id);

ALTER TABLE tracked_competitors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tracked_competitors_org_select ON tracked_competitors;
CREATE POLICY tracked_competitors_org_select ON tracked_competitors
  FOR SELECT USING (
    organization_id IN (SELECT organization_id FROM users WHERE auth_id = auth.uid())
  );

DROP POLICY IF EXISTS tracked_competitors_org_insert ON tracked_competitors;
CREATE POLICY tracked_competitors_org_insert ON tracked_competitors
  FOR INSERT WITH CHECK (
    organization_id IN (SELECT organization_id FROM users WHERE auth_id = auth.uid())
  );

DROP POLICY IF EXISTS tracked_competitors_org_update ON tracked_competitors;
CREATE POLICY tracked_competitors_org_update ON tracked_competitors
  FOR UPDATE USING (
    organization_id IN (SELECT organization_id FROM users WHERE auth_id = auth.uid())
  );

DROP POLICY IF EXISTS tracked_competitors_org_delete ON tracked_competitors;
CREATE POLICY tracked_competitors_org_delete ON tracked_competitors
  FOR DELETE USING (
    organization_id IN (SELECT organization_id FROM users WHERE auth_id = auth.uid())
  );

COMMIT;
