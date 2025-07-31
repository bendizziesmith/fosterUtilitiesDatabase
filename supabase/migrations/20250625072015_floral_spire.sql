/*
  # Add unique constraint for single draft per employee per week

  1. Database Changes
    - Add unique constraint to prevent multiple drafts for same employee and week ending
    - Clean up any existing duplicate drafts (keep the most recent one)
    - Ensure data integrity for timesheet drafts

  2. Constraint Details
    - Only applies to draft status timesheets
    - Allows multiple submitted timesheets (for historical tracking)
    - Prevents duplicate draft creation during auto-save

  3. Data Cleanup
    - Remove duplicate drafts keeping the most recently updated one
    - Preserve all submitted timesheets
*/

-- First, clean up any existing duplicate drafts
-- Keep only the most recent draft for each employee/week_ending combination
WITH duplicate_drafts AS (
  SELECT 
    id,
    employee_id,
    week_ending,
    status,
    created_at,
    ROW_NUMBER() OVER (
      PARTITION BY employee_id, week_ending, status 
      ORDER BY created_at DESC
    ) as rn
  FROM structured_timesheets
  WHERE status = 'draft'
),
drafts_to_delete AS (
  SELECT id 
  FROM duplicate_drafts 
  WHERE rn > 1
)
DELETE FROM structured_timesheets 
WHERE id IN (SELECT id FROM drafts_to_delete);

-- Add unique constraint for draft timesheets only
-- This prevents multiple drafts for the same employee and week ending
CREATE UNIQUE INDEX IF NOT EXISTS unique_employee_week_draft 
ON structured_timesheets (employee_id, week_ending) 
WHERE status = 'draft';

-- Add comment to document the constraint
COMMENT ON INDEX unique_employee_week_draft IS 'Ensures only one draft timesheet per employee per week ending date';