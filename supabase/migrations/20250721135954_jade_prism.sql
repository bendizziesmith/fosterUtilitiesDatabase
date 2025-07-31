/*
  # Add user_id column to employees table

  1. Changes
    - Add user_id column to employees table to link with auth.users
    - Add index for faster lookups
    - Update existing employees to have null user_id (will be populated when they're created properly)

  2. Security
    - No changes to RLS policies needed
*/

-- Add user_id column to employees table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'employees' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE employees ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Add index for user_id lookups
CREATE INDEX IF NOT EXISTS idx_employees_user_id ON employees(user_id);