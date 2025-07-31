/*
  # Remove unused employee columns

  1. Columns to Remove
    - `role` (now auto-set based on position type)
    - `start_date` (now auto-set to current date)
    - `training_qualifications` (removed from form)

  2. Changes
    - Drop role column (position type determines if ganger/labourer)
    - Drop start_date column (not needed in form)
    - Drop training_qualifications column (removed from requirements)
*/

-- Remove the unused columns from employees table
DO $$
BEGIN
  -- Remove role column if it exists
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'employees' AND column_name = 'role'
  ) THEN
    ALTER TABLE employees DROP COLUMN role;
  END IF;

  -- Remove start_date column if it exists
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'employees' AND column_name = 'start_date'
  ) THEN
    ALTER TABLE employees DROP COLUMN start_date;
  END IF;

  -- Remove training_qualifications column if it exists
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'employees' AND column_name = 'training_qualifications'
  ) THEN
    ALTER TABLE employees DROP COLUMN training_qualifications;
  END IF;
END $$;