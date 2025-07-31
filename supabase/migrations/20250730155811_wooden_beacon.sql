/*
  # Update employees table structure

  1. New Tables
    - Update `employees` table to match new requirements
      - `id` (uuid, primary key)
      - `full_name` (text, required)
      - `role` (text, check constraint for Ganger/Labourer/Backup Driver)
      - `rate` (numeric, hourly rate)
      - `email` (text, unique)
      - `password` (text, plain text for now)
      - `assigned_vehicle` (text, optional)
      - `created_at` (timestamp)

  2. Security
    - Enable RLS on `employees` table
    - Add policy for authenticated users to manage employees
*/

-- Drop existing employees table if it exists
DROP TABLE IF EXISTS employees CASCADE;

-- Create new employees table with correct structure
CREATE TABLE IF NOT EXISTS employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  role text NOT NULL CHECK (role IN ('Ganger', 'Labourer', 'Backup Driver')),
  rate numeric(10,2) NOT NULL DEFAULT 38.00,
  email text UNIQUE NOT NULL,
  password text NOT NULL,
  assigned_vehicle text,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;

-- Create policy for authenticated users to manage employees
CREATE POLICY "Allow authenticated users to manage employees"
  ON employees
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_employees_email ON employees(email);
CREATE INDEX IF NOT EXISTS idx_employees_role ON employees(role);
CREATE INDEX IF NOT EXISTS idx_employees_assigned_vehicle ON employees(assigned_vehicle);