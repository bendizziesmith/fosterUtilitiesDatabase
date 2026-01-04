/*
  # Add HAVS Revisions and Fix RLS for Editable After Submit

  ## Problem
  - After submit, employee cannot edit (RLS blocks non-draft)
  - No audit trail when edits occur after submission
  - Missing last_saved_at tracking

  ## Changes
  1. Create havs_revisions table to store submission snapshots
  2. Add last_saved_at to havs_weeks for tracking
  3. Update RLS policies to allow edits after submit (revisions provide audit)
  4. Add revision_number to havs_weeks for tracking edit iterations

  ## Audit Trail Strategy
  - On first submit: create revision #1 with snapshot
  - On subsequent edits after submit: create new revision
  - Employer can view all revisions for compliance
  - Current data is always editable (revision history is immutable)
*/

-- Add last_saved_at and revision_number to havs_weeks
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'havs_weeks' AND column_name = 'last_saved_at'
  ) THEN
    ALTER TABLE havs_weeks ADD COLUMN last_saved_at timestamptz DEFAULT now();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'havs_weeks' AND column_name = 'revision_number'
  ) THEN
    ALTER TABLE havs_weeks ADD COLUMN revision_number integer DEFAULT 0;
  END IF;
END $$;

-- Create revisions table for audit trail
CREATE TABLE IF NOT EXISTS havs_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  havs_week_id uuid NOT NULL REFERENCES havs_weeks(id) ON DELETE CASCADE,
  revision_number integer NOT NULL,
  snapshot_data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  notes text
);

-- Index for querying revisions
CREATE INDEX IF NOT EXISTS idx_havs_revisions_week 
  ON havs_revisions(havs_week_id, revision_number DESC);

-- Enable RLS on revisions
ALTER TABLE havs_revisions ENABLE ROW LEVEL SECURITY;

-- RLS policies for revisions (read-only for gangers, read/write for admins)
CREATE POLICY "Gangers can view their own revision history"
  ON havs_revisions FOR SELECT
  TO authenticated
  USING (
    havs_week_id IN (
      SELECT id FROM havs_weeks
      WHERE ganger_id IN (
        SELECT employee_id FROM user_profiles WHERE id = auth.uid()
      )
    )
  );

CREATE POLICY "System can insert revisions"
  ON havs_revisions FOR INSERT
  TO authenticated
  WITH CHECK (
    havs_week_id IN (
      SELECT id FROM havs_weeks
      WHERE ganger_id IN (
        SELECT employee_id FROM user_profiles WHERE id = auth.uid()
      )
    )
  );

-- Update RLS policies to allow edits after submit

-- Drop existing restrictive DELETE policies
DROP POLICY IF EXISTS "Gangers can delete members from their draft weeks" ON havs_week_members;
DROP POLICY IF EXISTS "Users can delete exposure entries for their draft weeks" ON havs_exposure_entries;

-- Create new permissive DELETE policies (allow delete anytime for your own data)
CREATE POLICY "Gangers can delete members from their weeks"
  ON havs_week_members FOR DELETE
  TO authenticated
  USING (
    havs_week_id IN (
      SELECT id FROM havs_weeks
      WHERE ganger_id IN (
        SELECT employee_id FROM user_profiles WHERE id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can delete exposure entries for their weeks"
  ON havs_exposure_entries FOR DELETE
  TO authenticated
  USING (
    havs_week_member_id IN (
      SELECT hm.id
      FROM havs_week_members hm
      JOIN havs_weeks hw ON hm.havs_week_id = hw.id
      WHERE hw.ganger_id IN (
        SELECT employee_id FROM user_profiles WHERE id = auth.uid()
      )
    )
  );

-- Add helper function to create revision snapshot
CREATE OR REPLACE FUNCTION create_havs_revision(week_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_revision_num integer;
  snapshot jsonb;
BEGIN
  -- Get current revision number
  SELECT COALESCE(revision_number, 0) INTO current_revision_num
  FROM havs_weeks WHERE id = week_id;
  
  -- Increment revision number
  current_revision_num := current_revision_num + 1;
  
  -- Build snapshot of all data
  SELECT jsonb_build_object(
    'week_data', row_to_json(hw.*),
    'members', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'member_data', row_to_json(hm.*),
          'exposure_entries', (
            SELECT jsonb_agg(row_to_json(he.*))
            FROM havs_exposure_entries he
            WHERE he.havs_week_member_id = hm.id
          )
        )
      )
      FROM havs_week_members hm
      WHERE hm.havs_week_id = week_id
    )
  ) INTO snapshot
  FROM havs_weeks hw
  WHERE hw.id = week_id;
  
  -- Insert revision
  INSERT INTO havs_revisions (
    havs_week_id,
    revision_number,
    snapshot_data,
    created_by,
    notes
  ) VALUES (
    week_id,
    current_revision_num,
    snapshot,
    auth.uid(),
    CASE 
      WHEN current_revision_num = 1 THEN 'Initial submission'
      ELSE 'Edited after submission'
    END
  );
  
  -- Update week revision number
  UPDATE havs_weeks
  SET revision_number = current_revision_num
  WHERE id = week_id;
END;
$$;

-- Add comment for clarity
COMMENT ON FUNCTION create_havs_revision IS 'Creates an immutable snapshot of HAVS week data for audit trail';
