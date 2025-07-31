/*
  # Fix Employee Vehicle Assignment

  1. Database Updates
    - Ensure assigned_vehicle_id column exists and is properly configured
    - Add foreign key constraint if missing
    - Add indexes for performance

  2. Security
    - Ensure RLS policies allow vehicle assignment operations
*/

-- Ensure the assigned_vehicle_id column exists and is properly configured
DO $$
BEGIN
  -- Check if assigned_vehicle_id column exists, if not add it
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'employees' AND column_name = 'assigned_vehicle_id'
  ) THEN
    ALTER TABLE employees ADD COLUMN assigned_vehicle_id uuid;
  END IF;
END $$;

-- Ensure foreign key constraint exists
DO $$
BEGIN
  -- Check if foreign key constraint exists, if not add it
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'employees_assigned_vehicle_id_fkey'
  ) THEN
    ALTER TABLE employees 
    ADD CONSTRAINT employees_assigned_vehicle_id_fkey 
    FOREIGN KEY (assigned_vehicle_id) REFERENCES vehicles(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add index for performance if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE indexname = 'idx_employees_assigned_vehicle_id'
  ) THEN
    CREATE INDEX idx_employees_assigned_vehicle_id ON employees(assigned_vehicle_id);
  END IF;
END $$;

-- Update RLS policies to ensure vehicle assignment operations work
DROP POLICY IF EXISTS "Allow authenticated users to manage employees" ON employees;
CREATE POLICY "Allow authenticated users to manage employees"
  ON employees
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated users to manage vehicles" ON vehicles;
CREATE POLICY "Allow authenticated users to manage vehicles"
  ON vehicles
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);