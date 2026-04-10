-- G19: Full-text search across solicitation body text.
-- BUILD-PLAN originally specified an `opportunity_attachments` table, but the
-- current schema stores solicitation text inline on `opportunities` itself
-- (description / full_description / response_instructions), so we add the
-- tsvector column there and let users full-text-search the same body content
-- the dashboard already renders.

ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS solicitation_tsv tsvector;

CREATE OR REPLACE FUNCTION opportunities_solicitation_tsv_refresh()
RETURNS trigger AS $$
BEGIN
  NEW.solicitation_tsv :=
    setweight(to_tsvector('english', coalesce(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.solicitation_number, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.description, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(NEW.full_description, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(NEW.response_instructions, '')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS opportunities_solicitation_tsv_trigger ON opportunities;
CREATE TRIGGER opportunities_solicitation_tsv_trigger
  BEFORE INSERT OR UPDATE OF title, solicitation_number, description, full_description, response_instructions
  ON opportunities
  FOR EACH ROW
  EXECUTE FUNCTION opportunities_solicitation_tsv_refresh();

CREATE INDEX IF NOT EXISTS idx_opportunities_solicitation_tsv
  ON opportunities USING GIN (solicitation_tsv);

-- Backfill existing rows.
UPDATE opportunities
   SET solicitation_tsv =
       setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
       setweight(to_tsvector('english', coalesce(solicitation_number, '')), 'A') ||
       setweight(to_tsvector('english', coalesce(description, '')), 'B') ||
       setweight(to_tsvector('english', coalesce(full_description, '')), 'B') ||
       setweight(to_tsvector('english', coalesce(response_instructions, '')), 'C')
 WHERE solicitation_tsv IS NULL;
