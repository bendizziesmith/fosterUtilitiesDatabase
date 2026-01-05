/*
  # Add created_by field to havs_weeks for RLS compliance

  1. Changes
    - Add created_by column to havs_weeks table
    - Update existing records to set created_by from user_profiles
    - Add NOT NULL constraint after backfilling data
    - Drop old INSERT policy
    - Add new INSERT policy checking created_by = auth.uid()

  2. Security
    - Ensures only authenticated users can create weeks
    - User must be the creator (created_by = auth.uid())
    - Maintains audit trail of who created each week
*/

-- Add created_by column (nullable initially for backfill)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'havs_weeks' AND column_name = 'created_by'
  ) THEN
    ALTER TABLE havs_weeks ADD COLUMN created_by uuid;
  END IF;
END $$;

-- Backfill created_by from ganger_id's user_id
UPDATE havs_weeks hw
SET created_by = up.id
FROM user_profiles up
WHERE hw.ganger_id = up.employee_id
  AND hw.created_by IS NULL;

-- Set any remaining NULL values to a system user or first admin
UPDATE havs_weeks
SET created_by = (
  SELECT id FROM user_profiles WHERE role = 'admin' LIMIT 1
)
WHERE created_by IS NULL;

-- Make created_by NOT NULL
ALTER TABLE havs_weeks ALTER COLUMN created_by SET NOT NULL;

-- Drop old INSERT policy
DROP POLICY IF EXISTS "Gangers can insert their own weeks" ON havs_weeks;

-- Add new INSERT policy checking created_by
CREATE POLICY "Employees can create their own havs weeks"
ON havs_weeks
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = created_by
);
