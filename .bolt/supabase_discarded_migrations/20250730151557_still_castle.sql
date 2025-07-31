/*
  # Add role column to employees table

  1. Changes
    - Add `role` column (TEXT) to `employees` table
    - Add constraint to restrict values to 'Ganger', 'Labourer', 'Backup Driver'
    - Set default value based on existing `is_ganger` field
*/

-- First, add the role column
ALTER TABLE employees ADD COLUMN IF NOT EXISTS role TEXT;

-- Update existing records based on is_ganger field
UPDATE employees 
SET role = CASE 
  WHEN is_ganger = true THEN 'Ganger'
  ELSE 'Labourer'
END
WHERE role IS NULL;

-- Add the constraint to restrict role values
ALTER TABLE employees 
ADD CONSTRAINT employees_role_check 
CHECK (role IN ('Ganger', 'Labourer', 'Backup Driver'));

-- Make role column NOT NULL after setting values
ALTER TABLE employees ALTER COLUMN role SET NOT NULL;