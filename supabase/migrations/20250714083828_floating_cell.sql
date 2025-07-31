/*
  # Add Employee Management Fields

  1. New Columns
    - `driving_license` (text) - Type of driving license held
    - `training_qualifications` (jsonb) - Array of training qualifications
    - `is_ganger` (boolean) - Whether employee is a ganger or labourer
    - `emergency_contact` (text) - Emergency contact information
    - `phone_number` (text) - Employee phone number
    - `start_date` (date) - Employee start date

  2. Updates
    - Add new columns to employees table
    - Set default values where appropriate
*/

-- Add new columns to employees table
DO $$
BEGIN
  -- Add driving_license column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'employees' AND column_name = 'driving_license'
  ) THEN
    ALTER TABLE employees ADD COLUMN driving_license text;
  END IF;

  -- Add training_qualifications column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'employees' AND column_name = 'training_qualifications'
  ) THEN
    ALTER TABLE employees ADD COLUMN training_qualifications jsonb;
  END IF;

  -- Add is_ganger column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'employees' AND column_name = 'is_ganger'
  ) THEN
    ALTER TABLE employees ADD COLUMN is_ganger boolean DEFAULT false;
  END IF;

  -- Add emergency_contact column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'employees' AND column_name = 'emergency_contact'
  ) THEN
    ALTER TABLE employees ADD COLUMN emergency_contact text;
  END IF;

  -- Add phone_number column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'employees' AND column_name = 'phone_number'
  ) THEN
    ALTER TABLE employees ADD COLUMN phone_number text;
  END IF;

  -- Add start_date column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'employees' AND column_name = 'start_date'
  ) THEN
    ALTER TABLE employees ADD COLUMN start_date date;
  END IF;
END $$;