-- P1.2: Compliance severity for the high-severity alert strip
ALTER TABLE compliance_items ADD COLUMN IF NOT EXISTS severity TEXT
  CHECK (severity IS NULL OR severity IN ('low', 'medium', 'high'));
CREATE INDEX IF NOT EXISTS idx_compliance_items_severity_due
  ON compliance_items(severity, due_date);

-- P1.4: Real invoices table replacing nested JSONB on contracts
CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  invoice_number TEXT,
  amount NUMERIC(12, 2),
  submitted_date DATE,
  due_date DATE,
  paid_date DATE,
  status TEXT CHECK (status IN ('submitted', 'paid', 'outstanding', 'overdue')),
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_invoices_contract ON invoices(contract_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status_due ON invoices(status, due_date);

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

-- Users can only see invoices for contracts in their org
DROP POLICY IF EXISTS invoices_org_select ON invoices;
CREATE POLICY invoices_org_select ON invoices
  FOR SELECT USING (
    contract_id IN (
      SELECT id FROM contracts WHERE organization_id IN (
        SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS invoices_org_insert ON invoices;
CREATE POLICY invoices_org_insert ON invoices
  FOR INSERT WITH CHECK (
    contract_id IN (
      SELECT id FROM contracts WHERE organization_id IN (
        SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS invoices_org_update ON invoices;
CREATE POLICY invoices_org_update ON invoices
  FOR UPDATE USING (
    contract_id IN (
      SELECT id FROM contracts WHERE organization_id IN (
        SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
      )
    )
  );

-- P1.4: Demand letters tied to invoices
CREATE TABLE IF NOT EXISTS demand_letters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  body TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_demand_letters_invoice ON demand_letters(invoice_id);

ALTER TABLE demand_letters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS demand_letters_org_select ON demand_letters;
CREATE POLICY demand_letters_org_select ON demand_letters
  FOR SELECT USING (
    invoice_id IN (
      SELECT i.id FROM invoices i
      JOIN contracts c ON c.id = i.contract_id
      WHERE c.organization_id IN (
        SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
      )
    )
  );
DROP POLICY IF EXISTS demand_letters_org_insert ON demand_letters;
CREATE POLICY demand_letters_org_insert ON demand_letters
  FOR INSERT WITH CHECK (
    invoice_id IN (
      SELECT i.id FROM invoices i
      JOIN contracts c ON c.id = i.contract_id
      WHERE c.organization_id IN (
        SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
      )
    )
  );
