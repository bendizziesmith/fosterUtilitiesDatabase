/*
  # Create employees table with proper structure

  1. New Tables
    - `employees`
      - `id` (uuid, primary key)
      - `first_name` (text, required)
      - `last_name` (text, required)
      - `email` (text, unique)
      - `password` (text, for plain storage)
      - `role` (text, constrained to specific values)
      - `assigned_vehicle` (text, optional)
      - `created_at` (timestamptz, default now)

  2. Security
    - Enable RLS on `employees` table
    - Add policy for authenticated users to read their own data
    - Add policy for admins to manage all employees

  3. Constraints
    - Role constraint to allow only: 'Ganger', 'Labourer', 'Backup Driver'
    - Unique email constraint
*/

-- Create employees table
CREATE TABLE IF NOT EXISTS employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name text NOT NULL,
  last_name text NOT NULL,
  email text UNIQUE,
  password text,
  role text NOT NULL,
  assigned_vehicle text,
  created_at timestamptz DEFAULT now()
);

-- Add role constraint
ALTER TABLE employees 
ADD CONSTRAINT employees_role_check 
CHECK (role IN ('Ganger', 'Labourer', 'Backup Driver'));

-- Enable RLS
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;

-- Policy for authenticated users to read their own data
CREATE POLICY "Users can read own employee data"
  ON employees
  FOR SELECT
  TO authenticated
  USING (auth.email() = email);

-- Policy for authenticated users to update their own data
CREATE POLICY "Users can update own employee data"
  ON employees
  FOR UPDATE
  TO authenticated
  USING (auth.email() = email)
  WITH CHECK (auth.email() = email);

-- Policy for admin to manage all employees
CREATE POLICY "Admin can manage all employees"
  ON employees
  FOR ALL
  TO authenticated
  USING (
    auth.email() = 'nsfutilities@btinternet.com' OR
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE user_profiles.id = auth.uid() 
      AND user_profiles.role = 'admin'
    )
  )
  WITH CHECK (
    auth.email() = 'nsfutilities@btinternet.com' OR
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE user_profiles.id = auth.uid() 
      AND user_profiles.role = 'admin'
    )
  );

-- Create index on email for faster lookups
CREATE INDEX IF NOT EXISTS idx_employees_email ON employees(email);

-- Create index on role for filtering
CREATE INDEX IF NOT EXISTS idx_employees_role ON employees(role);