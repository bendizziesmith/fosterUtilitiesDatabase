/*
  # Fix HAVS Week Members Constraints

  ## Problem
  - No UNIQUE constraint prevents duplicate gang members per week
  - This causes duplicate status rows and ghost entries
  - Need to enforce: one person can only be added once per week

  ## Changes
  1. Add UNIQUE constraint for employee-based members (person_type + employee_id + havs_week_id)
  2. Add UNIQUE constraint for manual members (person_type + manual_name + havs_week_id)
  3. Add index for performance on lookups

  ## Benefits
  - Prevents duplicate gang members
  - Enforces data integrity at DB level
  - Fixes ghost/duplicate status rows
*/

-- First, clean up any existing duplicates (keep oldest)
DELETE FROM havs_week_members a
USING havs_week_members b
WHERE a.id > b.id
  AND a.havs_week_id = b.havs_week_id
  AND a.person_type = b.person_type
  AND (
    (a.employee_id IS NOT NULL AND a.employee_id = b.employee_id)
    OR
    (a.manual_name IS NOT NULL AND a.manual_name = b.manual_name)
  );

-- Add UNIQUE constraint for employee-based members
CREATE UNIQUE INDEX IF NOT EXISTS idx_havs_week_members_unique_employee
  ON havs_week_members(havs_week_id, person_type, employee_id)
  WHERE employee_id IS NOT NULL;

-- Add UNIQUE constraint for manual members
CREATE UNIQUE INDEX IF NOT EXISTS idx_havs_week_members_unique_manual
  ON havs_week_members(havs_week_id, person_type, manual_name)
  WHERE manual_name IS NOT NULL;

-- Add composite index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_havs_week_members_lookup
  ON havs_week_members(havs_week_id, person_type, created_at);
