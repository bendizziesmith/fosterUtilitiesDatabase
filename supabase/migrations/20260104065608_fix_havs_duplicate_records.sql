/*
  # Fix HAVS Duplicate Records

  1. Problem
    - Multiple draft HAVS records exist for the same employee and week
    - This causes data loss as queries fail to find the correct record
    - New records keep getting created instead of reusing existing ones

  2. Solution
    - Delete duplicate draft records, keeping only the most recent one
    - Add a unique constraint on (employee_id, week_ending) for draft status
    - This ensures only ONE draft record exists per employee per week

  3. Changes
    - Clean up existing duplicate draft records
    - Add partial unique index for drafts (allows multiple submitted for history)
*/

DO $$
DECLARE
  duplicate_record RECORD;
BEGIN
  FOR duplicate_record IN
    SELECT employee_id, week_ending
    FROM havs_timesheets
    WHERE status = 'draft'
    GROUP BY employee_id, week_ending
    HAVING COUNT(*) > 1
  LOOP
    DELETE FROM havs_timesheet_entries
    WHERE timesheet_id IN (
      SELECT id FROM havs_timesheets
      WHERE employee_id = duplicate_record.employee_id
        AND week_ending = duplicate_record.week_ending
        AND status = 'draft'
        AND id NOT IN (
          SELECT id FROM havs_timesheets
          WHERE employee_id = duplicate_record.employee_id
            AND week_ending = duplicate_record.week_ending
            AND status = 'draft'
          ORDER BY updated_at DESC NULLS LAST, created_at DESC
          LIMIT 1
        )
    );
    
    DELETE FROM havs_timesheets
    WHERE employee_id = duplicate_record.employee_id
      AND week_ending = duplicate_record.week_ending
      AND status = 'draft'
      AND id NOT IN (
        SELECT id FROM havs_timesheets
        WHERE employee_id = duplicate_record.employee_id
          AND week_ending = duplicate_record.week_ending
          AND status = 'draft'
        ORDER BY updated_at DESC NULLS LAST, created_at DESC
        LIMIT 1
      );
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS havs_timesheets_employee_week_draft_unique
ON havs_timesheets (employee_id, week_ending)
WHERE status = 'draft';
