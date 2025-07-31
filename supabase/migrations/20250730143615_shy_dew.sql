/*
  # Add day_rate column to employees table

  1. Changes
    - Add `day_rate` column to employees table with default value of 38.00
    - This stores the hourly day rate for each employee (10 hours per day)

  2. Notes
    - Default rate is £38.00 per hour
    - Used when employees select day rate work in timesheets
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'employees' AND column_name = 'day_rate'
  ) THEN
    ALTER TABLE employees ADD COLUMN day_rate numeric(5,2) DEFAULT 38.00;
  END IF;
END $$;