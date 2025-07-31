/*
  # Fix Employee Database Constraints

  1. Updates
    - Update role constraints to include 'Backup Driver'
    - Ensure all employee fields are properly configured
    - Fix any constraint issues

  2. Security
    - Maintain existing RLS policies
*/

-- Update employees table role constraint
DO $$
BEGIN
  -- Drop existing constraint if it exists
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'employees_role_check' 
    AND table_name = 'employees'
  ) THEN
    ALTER TABLE employees DROP CONSTRAINT employees_role_check;
  END IF;
  
  -- Add new constraint with all three roles
  ALTER TABLE employees ADD CONSTRAINT employees_role_check 
    CHECK (role = ANY (ARRAY['Ganger'::text, 'Labourer'::text, 'Backup Driver'::text]));
END $$;

-- Update user_profiles table role constraint
DO $$
BEGIN
  -- Drop existing constraint if it exists
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'user_profiles_role_check' 
    AND table_name = 'user_profiles'
  ) THEN
    ALTER TABLE user_profiles DROP CONSTRAINT user_profiles_role_check;
  END IF;
  
  -- Add new constraint
  ALTER TABLE user_profiles ADD CONSTRAINT user_profiles_role_check 
    CHECK (role = ANY (ARRAY['employee'::text, 'admin'::text]));
END $$;

-- Update users table role constraint
DO $$
BEGIN
  -- Drop existing constraint if it exists
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'users_role_check' 
    AND table_name = 'users'
  ) THEN
    ALTER TABLE users DROP CONSTRAINT users_role_check;
  END IF;
  
  -- Add new constraint
  ALTER TABLE users ADD CONSTRAINT users_role_check 
    CHECK (role = ANY (ARRAY['employee'::text, 'admin'::text]));
END $$;

-- Ensure all required columns exist and have proper defaults
DO $$
BEGIN
  -- Check if day_rate column exists and has proper default
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'employees' AND column_name = 'day_rate'
  ) THEN
    ALTER TABLE employees ADD COLUMN day_rate numeric(5,2) DEFAULT 38.00;
  END IF;
  
  -- Ensure role column exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'employees' AND column_name = 'role'
  ) THEN
    ALTER TABLE employees ADD COLUMN role text;
  END IF;
  
  -- Ensure is_ganger has proper default
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'employees' AND column_name = 'is_ganger'
  ) THEN
    ALTER TABLE employees ALTER COLUMN is_ganger SET DEFAULT false;
  END IF;
END $$;