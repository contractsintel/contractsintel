-- G01: SLED (State / Local / Education) opportunity coverage. Adds a
-- source-of-truth table for state procurement portals and extends the
-- opportunities table with a `level` enum + `state` code so queries can
-- distinguish federal from SLED rows.

CREATE TABLE IF NOT EXISTS sled_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  state TEXT NOT NULL,
  portal_name TEXT NOT NULL,
  portal_url TEXT NOT NULL,
  scraper_id TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sled_sources_state ON sled_sources(state);

ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS state TEXT,
  ADD COLUMN IF NOT EXISTS opportunity_level TEXT NOT NULL DEFAULT 'federal'
    CHECK (opportunity_level IN ('federal', 'state', 'local', 'education'));

CREATE INDEX IF NOT EXISTS idx_opportunities_level ON opportunities(opportunity_level);
CREATE INDEX IF NOT EXISTS idx_opportunities_state ON opportunities(state) WHERE state IS NOT NULL;

-- Backfill opportunity_level from existing source tags.
UPDATE opportunities
   SET opportunity_level = 'state'
 WHERE source LIKE 'state_%'
   AND opportunity_level = 'federal';

-- Seed the 5 highest-traffic state portals so the filter has real rows
-- to target immediately.
INSERT INTO sled_sources (state, portal_name, portal_url, scraper_id) VALUES
  ('CA', 'Cal eProcure',            'https://caleprocure.ca.gov',               'ca_eprocure'),
  ('TX', 'TxSmartBuy',              'https://www.txsmartbuy.gov',               'tx_smartbuy'),
  ('NY', 'NYS Contract Reporter',   'https://www.nyscr.ny.gov',                 'ny_contract_reporter'),
  ('FL', 'MyFloridaMarketPlace',    'https://vendor.myfloridamarketplace.com',  'fl_myfmp'),
  ('VA', 'eVA',                     'https://eva.virginia.gov',                 'va_eva')
ON CONFLICT DO NOTHING;
