/*
  # Align employee columns with add employee form

  This migration removes any columns that are not used in the current add employee form
  and ensures the database schema matches exactly what the form requires.

  ## Form Fields (what we keep):
  - name (maps to name)
  - position_type (maps to is_ganger boolean)
  - day_rate (numeric field)
  - phone_number (text field)
  - emergency_contact (text field)
  - driving_license (text field)
  - email (text field)
  - password (not stored, used for auth only)
  - assigned_vehicle (maps to assigned_vehicle_id)

  ## Columns to remove if they exist:
  - role (replaced by position_type logic)
  - start_date (not in form)
  - training_qualifications (not in form)
  - created_at (auto-generated)
  - user_id (system field)
  - id (primary key)
*/

-- Remove role column if it exists (replaced by is_ganger logic)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'employees' AND column_name = 'role'
  ) THEN
    ALTER TABLE employees DROP COLUMN role;
  END IF;
END $$;

-- Remove start_date column if it exists (not in form)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'employees' AND column_name = 'start_date'
  ) THEN
    ALTER TABLE employees DROP COLUMN start_date;
  END IF;
END $$;

-- Remove training_qualifications column if it exists (not in form)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'employees' AND column_name = 'training_qualifications'
  ) THEN
    ALTER TABLE employees DROP COLUMN training_qualifications;
  END IF;
END $$;

-- Ensure day_rate column exists with proper type and default
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'employees' AND column_name = 'day_rate'
  ) THEN
    ALTER TABLE employees ADD COLUMN day_rate numeric(5,2) DEFAULT 38.00;
  END IF;
END $$;

-- Ensure all required columns exist
DO $$
BEGIN
  -- name column (should already exist)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'employees' AND column_name = 'name'
  ) THEN
    ALTER TABLE employees ADD COLUMN name text NOT NULL DEFAULT '';
  END IF;

  -- is_ganger column (for position type)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'employees' AND column_name = 'is_ganger'
  ) THEN
    ALTER TABLE employees ADD COLUMN is_ganger boolean DEFAULT false;
  END IF;

  -- phone_number column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'employees' AND column_name = 'phone_number'
  ) THEN
    ALTER TABLE employees ADD COLUMN phone_number text;
  END IF;

  -- emergency_contact column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'employees' AND column_name = 'emergency_contact'
  ) THEN
    ALTER TABLE employees ADD COLUMN emergency_contact text;
  END IF;

  -- driving_license column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'employees' AND column_name = 'driving_license'
  ) THEN
    ALTER TABLE employees ADD COLUMN driving_license text;
  END IF;

  -- email column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'employees' AND column_name = 'email'
  ) THEN
    ALTER TABLE employees ADD COLUMN email text;
  END IF;

  -- assigned_vehicle_id column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'employees' AND column_name = 'assigned_vehicle_id'
  ) THEN
    ALTER TABLE employees ADD COLUMN assigned_vehicle_id uuid REFERENCES vehicles(id);
  END IF;

  -- user_id column (system field for auth)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'employees' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE employees ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;

  -- created_at column (system field)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'employees' AND column_name = 'created_at'
  ) THEN
    ALTER TABLE employees ADD COLUMN created_at timestamptz DEFAULT now();
  END IF;
END $$;