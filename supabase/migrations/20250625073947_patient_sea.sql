/*
  # Fix structured_timesheets table constraints

  1. Database Changes
    - Add unique constraint on (employee_id, week_ending) to enable proper upsert operations
    - This allows ON CONFLICT to work correctly when upserting timesheet records

  2. Security
    - No changes to existing RLS policies
    - Maintains existing data integrity
*/

-- Add unique constraint to allow proper upsert operations
ALTER TABLE structured_timesheets 
ADD CONSTRAINT unique_employee_week UNIQUE (employee_id, week_ending);