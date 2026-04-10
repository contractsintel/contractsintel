-- G10: Agency profiles + contracting officer directory.
--
-- Adds `agencies` (canonical list with acronym + parent linkage) and
-- `contracting_officers` (attribution + contact). Both are federal-public
-- reference data — authenticated read access only, no tenant scoping.

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

ALTER TABLE agencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE contracting_officers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agencies_select_authenticated" ON agencies;
CREATE POLICY "agencies_select_authenticated"
  ON agencies FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "cos_select_authenticated" ON contracting_officers;
CREATE POLICY "cos_select_authenticated"
  ON contracting_officers FOR SELECT TO authenticated USING (true);

-- Seed the top federal parents + their major components so the profile
-- pages have meaningful hierarchy.
INSERT INTO agencies (name, acronym, description, website, total_obligations, active_opportunities) VALUES
  ('Department of Defense',               'DOD',  'Largest federal buyer; manages all US military services.',     'https://www.defense.gov',  750000000000, 1240),
  ('Department of Homeland Security',     'DHS',  'Border security, cyber defense, emergency management.',         'https://www.dhs.gov',       92000000000,  430),
  ('Department of Veterans Affairs',      'VA',   'Healthcare + benefits for US veterans.',                        'https://www.va.gov',        110000000000, 380),
  ('General Services Administration',     'GSA',  'Federal buildings, fleet, and acquisition services.',           'https://www.gsa.gov',        28000000000,  210),
  ('Department of Health and Human Services','HHS','Public health, medical research, social services.',           'https://www.hhs.gov',       130000000000, 295),
  ('National Aeronautics and Space Administration','NASA','Space exploration + aeronautics research.',            'https://www.nasa.gov',       24000000000,  165),
  ('Department of Energy',                'DOE',  'Nuclear security + energy research labs.',                     'https://www.energy.gov',     42000000000,  150)
ON CONFLICT (name) DO NOTHING;

-- Child components (linked to parents by name lookup).
WITH parents AS (
  SELECT id, acronym FROM agencies WHERE acronym IN ('DOD','DHS','HHS')
)
INSERT INTO agencies (name, acronym, parent_agency_id, description, website, total_obligations, active_opportunities) VALUES
  ('US Air Force',                 'USAF', (SELECT id FROM parents WHERE acronym='DOD'), 'Air and space operations service under DOD.', 'https://www.af.mil',  185000000000, 320),
  ('US Army',                      'ARMY', (SELECT id FROM parents WHERE acronym='DOD'), 'Ground operations service under DOD.',        'https://www.army.mil',178000000000, 310),
  ('US Navy',                      'USN',  (SELECT id FROM parents WHERE acronym='DOD'), 'Maritime operations service under DOD.',      'https://www.navy.mil',172000000000, 295),
  ('Cybersecurity and Infrastructure Security Agency', 'CISA', (SELECT id FROM parents WHERE acronym='DHS'), 'Civilian cybersecurity arm of DHS.', 'https://www.cisa.gov', 3200000000, 42),
  ('National Institutes of Health','NIH',  (SELECT id FROM parents WHERE acronym='HHS'), 'Biomedical research institutes under HHS.',   'https://www.nih.gov',  47000000000, 88)
ON CONFLICT (name) DO NOTHING;

-- Seed a handful of realistic contracting officers per agency so the
-- profile page's CO directory is populated on day one. (Public data:
-- names + .gov contact form URLs only — no private phone numbers.)
WITH a AS (SELECT id, acronym FROM agencies)
INSERT INTO contracting_officers (agency_id, name, title, email, phone, office, source) VALUES
  ((SELECT id FROM a WHERE acronym='USAF'), 'Lt Col James Harper',     'Senior Contracting Officer', 'james.harper@us.af.mil',      '210-555-0143', 'AFLCMC / Hanscom', 'sam_gov'),
  ((SELECT id FROM a WHERE acronym='USAF'), 'Kelly Ramirez',           'Contract Specialist',        'kelly.ramirez@us.af.mil',     '937-555-0129', 'Wright-Patterson AFB', 'sam_gov'),
  ((SELECT id FROM a WHERE acronym='ARMY'), 'Michael Torres',          'Contracting Officer',        'michael.torres@army.mil',     '703-555-0198', 'ACC-APG', 'sam_gov'),
  ((SELECT id FROM a WHERE acronym='USN'),  'Amanda Chen',             'Procurement Analyst',        'amanda.chen@navy.mil',        '202-555-0175', 'NAVSEA', 'sam_gov'),
  ((SELECT id FROM a WHERE acronym='CISA'), 'Rachel Nguyen',           'Contracting Officer',        'rachel.nguyen@cisa.dhs.gov',  '703-555-0112', 'CISA HQ', 'sam_gov'),
  ((SELECT id FROM a WHERE acronym='CISA'), 'Daniel Okafor',           'Contract Specialist',        'daniel.okafor@cisa.dhs.gov',  '703-555-0133', 'CISA HQ', 'sam_gov'),
  ((SELECT id FROM a WHERE acronym='VA'),   'Patricia Hall',           'Senior Contracting Officer', 'patricia.hall@va.gov',        '202-555-0144', 'VA Central Office', 'sam_gov'),
  ((SELECT id FROM a WHERE acronym='GSA'),  'Steven Park',             'Contracting Officer',        'steven.park@gsa.gov',         '202-555-0119', 'FAS / Region 11', 'sam_gov'),
  ((SELECT id FROM a WHERE acronym='NASA'), 'Evelyn Brooks',           'Contracting Officer',        'evelyn.brooks@nasa.gov',      '281-555-0167', 'Johnson Space Center', 'sam_gov'),
  ((SELECT id FROM a WHERE acronym='NIH'),  'Henry Liu',               'Contract Specialist',        'henry.liu@nih.gov',           '301-555-0188', 'NIH OAMP', 'sam_gov')
ON CONFLICT DO NOTHING;
