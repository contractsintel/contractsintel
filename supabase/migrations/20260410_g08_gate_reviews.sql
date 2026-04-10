-- G08: Gate-review CRM + PWin.
--
-- Extends `opportunity_matches` with the Shipley-style capture-management
-- gate stage (G0–G6), a PWin score (0–100), free-form gate notes, and a
-- last-reviewed timestamp. Backfill leaves the new column NULL for rows
-- that haven't been explicitly reviewed yet.

ALTER TABLE opportunity_matches
  ADD COLUMN IF NOT EXISTS gate_stage TEXT
    CHECK (gate_stage IS NULL OR gate_stage IN (
      'g0_prospect',
      'g1_qualification',
      'g2_pursuit_decision',
      'g3_capture',
      'g4_proposal',
      'g5_submission',
      'g6_award'
    )),
  ADD COLUMN IF NOT EXISTS pwin INT
    CHECK (pwin IS NULL OR (pwin >= 0 AND pwin <= 100)),
  ADD COLUMN IF NOT EXISTS gate_notes TEXT,
  ADD COLUMN IF NOT EXISTS gate_reviewed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_opportunity_matches_gate_stage
  ON opportunity_matches(gate_stage)
  WHERE gate_stage IS NOT NULL;
