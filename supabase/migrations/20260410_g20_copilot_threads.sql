-- G20: Conversational copilot — chat threads + messages, RLS-scoped per tenant.

CREATE TABLE IF NOT EXISTS copilot_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  title TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_copilot_threads_org ON copilot_threads(organization_id, created_at DESC);

CREATE TABLE IF NOT EXISTS copilot_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES copilot_threads(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_copilot_messages_thread ON copilot_messages(thread_id, created_at);

ALTER TABLE copilot_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE copilot_messages ENABLE ROW LEVEL SECURITY;

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
