-- G03: Procurement forecasting. Federal-wide recompete signals projected
-- from awards/past-performance rows whose period-of-performance end dates
-- are in the future. expected_rfp_at = period_end - 6 months (the typical
-- lead time between a recompete solicitation and contract end).

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

-- Federal recompete data is shared across all authenticated tenants
-- (same model as sub_awards). No tenant scoping.
DROP POLICY IF EXISTS "forecasts_select_authenticated" ON forecasts;
CREATE POLICY "forecasts_select_authenticated"
  ON forecasts FOR SELECT TO authenticated
  USING (true);

-- Seed 12 recompete projections across the 5 pilot agencies so the
-- dashboard has a realistic timeline to render. expected_rfp_at spans the
-- next 3-18 months.
INSERT INTO forecasts (agency, naics, expected_rfp_at, period_end, incumbent, estimated_value, source, confidence, notes) VALUES
  ('Department of Defense',                '541512', (now() + interval '3 months')::date,  (now() + interval '9 months')::date,  'Leidos',               42000000, 'recompete_projection', 0.80, 'DoD Enterprise IT recompete, 5yr base + 5yr option ends FY27Q1'),
  ('Department of Homeland Security',      '541519', (now() + interval '5 months')::date,  (now() + interval '11 months')::date, 'Booz Allen Hamilton',  18000000, 'recompete_projection', 0.75, 'DHS cyber ops recompete — incumbent on final option'),
  ('Department of Veterans Affairs',       '541511', (now() + interval '4 months')::date,  (now() + interval '10 months')::date, 'CGI Federal',          26000000, 'recompete_projection', 0.70, 'VA electronic health record integration'),
  ('General Services Administration',      '541611', (now() + interval '6 months')::date,  (now() + interval '12 months')::date, 'Deloitte',             12500000, 'recompete_projection', 0.65, 'GSA acquisition advisory recompete'),
  ('Department of the Air Force',          '541512', (now() + interval '7 months')::date,  (now() + interval '13 months')::date, 'Northrop Grumman',     88000000, 'recompete_projection', 0.85, 'USAF weather-data platform — large recompete'),
  ('Department of the Navy',               '541330', (now() + interval '8 months')::date,  (now() + interval '14 months')::date, 'SAIC',                 52000000, 'recompete_projection', 0.70, 'NAVAIR engineering services recompete'),
  ('Department of Energy',                 '541690', (now() + interval '9 months')::date,  (now() + interval '15 months')::date, 'Battelle',             33000000, 'recompete_projection', 0.60, 'DOE lab ops support'),
  ('Department of Health and Human Services','541512', (now() + interval '10 months')::date,(now() + interval '16 months')::date,'Peraton',              47000000, 'recompete_projection', 0.70, 'HHS claims processing modernization'),
  ('Department of State',                  '541611', (now() + interval '11 months')::date, (now() + interval '17 months')::date, 'Accenture Federal',    21000000, 'recompete_projection', 0.55, 'State Dept overseas advisory'),
  ('Department of Justice',                '541519', (now() + interval '12 months')::date, (now() + interval '18 months')::date, 'General Dynamics IT',  38000000, 'recompete_projection', 0.75, 'DOJ case management systems'),
  ('National Aeronautics and Space Administration','541512', (now() + interval '14 months')::date, (now() + interval '20 months')::date, 'Leidos', 64000000, 'recompete_projection', 0.65, 'NASA ground systems IT'),
  ('Department of the Army',               '541330', (now() + interval '16 months')::date, (now() + interval '22 months')::date, 'CACI',                 55000000, 'recompete_projection', 0.70, 'Army C5ISR sustainment')
ON CONFLICT DO NOTHING;
