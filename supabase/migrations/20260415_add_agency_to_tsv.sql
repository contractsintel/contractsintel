-- Add agency to solicitation_tsv so search-by-agency uses the GIN index too.
-- Previously only title, solicitation_number, description, full_description,
-- and response_instructions were indexed.

CREATE OR REPLACE FUNCTION opportunities_solicitation_tsv_refresh()
RETURNS trigger AS $$
BEGIN
  NEW.solicitation_tsv :=
    setweight(to_tsvector('english', coalesce(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.solicitation_number, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.agency, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.description, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(NEW.full_description, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(NEW.response_instructions, '')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Re-create trigger to also fire on agency changes
DROP TRIGGER IF EXISTS opportunities_solicitation_tsv_trigger ON opportunities;
CREATE TRIGGER opportunities_solicitation_tsv_trigger
  BEFORE INSERT OR UPDATE OF title, solicitation_number, agency, description, full_description, response_instructions
  ON opportunities
  FOR EACH ROW
  EXECUTE FUNCTION opportunities_solicitation_tsv_refresh();

-- Backfill existing rows with agency included
UPDATE opportunities
   SET solicitation_tsv =
       setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
       setweight(to_tsvector('english', coalesce(solicitation_number, '')), 'A') ||
       setweight(to_tsvector('english', coalesce(agency, '')), 'A') ||
       setweight(to_tsvector('english', coalesce(description, '')), 'B') ||
       setweight(to_tsvector('english', coalesce(full_description, '')), 'B') ||
       setweight(to_tsvector('english', coalesce(response_instructions, '')), 'C');
