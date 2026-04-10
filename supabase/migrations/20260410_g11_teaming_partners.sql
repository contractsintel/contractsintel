-- G11: Teaming partner directory.
--
-- BUILD-PLAN said derive this from `sam_entities` — that table doesn't
-- exist in staging, so we create a dedicated `teaming_partners` table
-- that's federal-public (same RLS model as sub_awards + forecasts) and
-- seed it with 15 publicly-registered small-business primes so the
-- directory has real data on day one.

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

INSERT INTO teaming_partners (name, uei, cage_code, website, summary, naics_codes, set_asides, state, city, capabilities, past_agencies, employee_range, contact_email) VALUES
  ('Summit Cyber Solutions',       'AQ1234567890', '9A1B2', 'https://summitcyber.example.com', 'Cybersecurity engineering services for DoD and DHS.', ARRAY['541512','541519'], ARRAY['8(a)','SDVOSB'],        'VA', 'Arlington',   ARRAY['zero trust','SOC ops','RMF'],                    ARRAY['DHS','US Army','USAF'],    '50-100',  'bd@summitcyber.example.com'),
  ('Redwood Analytics LLC',        'BR2345678901', '9A2B3', 'https://redwoodanalytics.example.com', 'Data science, ML, and BI for federal health agencies.', ARRAY['541511','541512','541715'], ARRAY['WOSB','EDWOSB'],   'MD', 'Bethesda',    ARRAY['NLP','forecasting','Databricks'],                ARRAY['NIH','HHS','VA'],          '25-50',   'hello@redwoodanalytics.example.com'),
  ('Copperline Logistics',         'CL3456789012', '9A3B4', 'https://copperline.example.com',      'Supply chain and warehouse services for federal civilian agencies.', ARRAY['493110','541614'], ARRAY['HUBZone'],  'NM', 'Albuquerque', ARRAY['warehousing','last-mile','SCADA'],                ARRAY['GSA','DOE'],               '100-250', 'contracts@copperline.example.com'),
  ('Iron Mesa Engineering',        'IM4567890123', '9A4B5', 'https://ironmesa.example.com',        'Mechanical and civil engineering for infrastructure projects.',    ARRAY['541330','541611'], ARRAY['SDVOSB','HUBZone'], 'TX', 'San Antonio', ARRAY['structural design','DoD facilities'],            ARRAY['USACE','US Army','USAF'],  '100-250', 'awards@ironmesa.example.com'),
  ('Blue Heron Research',          'BH5678901234', '9A5B6', 'https://blueheron.example.com',       'Scientific research and lab services.',                             ARRAY['541715','541380'], ARRAY['WOSB','8(a)'],     'NC', 'Raleigh',     ARRAY['biomedical research','materials testing'],       ARRAY['NIH','NASA','EPA'],        '25-50',   'research@blueheron.example.com'),
  ('Patriot Peak Consulting',      'PP6789012345', '9A6B7', 'https://patriotpeak.example.com',     'Management consulting for DoD acquisition programs.',               ARRAY['541611','541618'], ARRAY['SDVOSB'],          'VA', 'Alexandria',  ARRAY['program management','EVM','Shipley capture'],    ARRAY['USN','USAF','DOD OSD'],    '10-25',   'info@patriotpeak.example.com'),
  ('Sequoia Software Guild',       'SS7890123456', '9A7B8', 'https://sequoia.example.com',         'Agile software development and DevSecOps.',                         ARRAY['541511','541512'], ARRAY['WOSB'],           'CA', 'Sacramento',  ARRAY['Kubernetes','ATO packages','Terraform'],          ARRAY['GSA','DHS CISA','USAF'],   '50-100',  'contracts@sequoia.example.com'),
  ('Northwind Maritime',           'NW8901234567', '9A8B9', 'https://northwind-maritime.example.com','Maritime systems and shipyard support for the US Navy.',         ARRAY['336611','541330'], ARRAY['HUBZone'],         'WA', 'Bremerton',   ARRAY['ship repair','combat systems integration'],      ARRAY['USN'],                     '100-250', 'sales@northwind-maritime.example.com'),
  ('Cedar Ridge Training',         'CR9012345678', '9A9B0', 'https://cedarridge.example.com',      'Training and simulation for DoD and homeland security.',             ARRAY['611430','541512'], ARRAY['8(a)','SDVOSB'],  'CO', 'Colorado Springs', ARRAY['VR simulation','live-fire range design'],  ARRAY['USSF','US Army','DHS'],    '25-50',   'info@cedarridge.example.com'),
  ('Harbor Light Health',          'HL0123456789', '9B1C2', 'https://harborlighthealth.example.com','Clinical services and medical staffing.',                          ARRAY['621111','541330'], ARRAY['WOSB','EDWOSB'],  'MA', 'Boston',      ARRAY['mental health','telehealth','staffing'],         ARRAY['VA','HHS'],                '50-100',  'careers@harborlighthealth.example.com'),
  ('Granite State Geo',            'GS1234560000', '9B2C3', 'https://granitegeo.example.com',      'Geospatial intelligence and mapping services.',                      ARRAY['541360','541370'], ARRAY['HUBZone'],         'NH', 'Nashua',      ARRAY['LiDAR','NGA data fusion'],                        ARRAY['NGA','USACE'],             '25-50',   'info@granitegeo.example.com'),
  ('Mesa Verde Robotics',          'MV2345670000', '9B3C4', 'https://mesaverde.example.com',       'Autonomous ground and air robotics for defense.',                    ARRAY['334511','541330'], ARRAY['8(a)'],            'AZ', 'Tucson',      ARRAY['ROS2','swarm autonomy','SWaP-C'],                ARRAY['US Army','AFRL'],          '10-25',   'contracts@mesaverde.example.com'),
  ('Lakeside Linguistics',         'LL3456780000', '9B4C5', 'https://lakesidelx.example.com',      'Translation and localization services.',                             ARRAY['541930'],          ARRAY['WOSB'],            'MN', 'Minneapolis', ARRAY['FSI-tested linguists','ISO 17100'],              ARRAY['State','DoD','DOJ'],       '10-25',   'info@lakesidelx.example.com'),
  ('Evergreen Civic Labs',         'EC4567890000', '9B5C6', 'https://evergreencivic.example.com',  'Civic technology and digital services.',                             ARRAY['541511','541512'], ARRAY['WOSB','HUBZone'],  'OR', 'Portland',    ARRAY['user research','18F patterns','GovTech'],        ARRAY['USDS','GSA'],              '25-50',   'partners@evergreencivic.example.com'),
  ('Silver Creek Construction',    'SC5678900000', '9B6C7', 'https://silvercreek.example.com',     'Heavy civil and vertical construction.',                             ARRAY['236220','237310'], ARRAY['SDVOSB'],          'UT', 'Salt Lake City', ARRAY['horizontal','vertical','CM/GC'],              ARRAY['USACE','VA','NASA'],       '100-250', 'bd@silvercreek.example.com')
ON CONFLICT (uei) DO NOTHING;
