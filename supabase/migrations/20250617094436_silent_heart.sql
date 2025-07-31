/*
  # Employee Database and System Updates

  1. New Tables
    - `employees` - Employee records with name and role
    
  2. Schema Updates
    - Add employee_id to plant_records and timesheets
    - Update existing tables to support employee tracking
    
  3. Sample Data
    - Insert 5 mock employee records
    
  4. Security
    - Enable RLS on employees table
    - Add policies for public access
*/

-- Create employees table
CREATE TABLE IF NOT EXISTS employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  role text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Add employee_id to existing tables
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'plant_records' AND column_name = 'employee_id'
  ) THEN
    ALTER TABLE plant_records ADD COLUMN employee_id uuid REFERENCES employees(id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'timesheets' AND column_name = 'employee_id'
  ) THEN
    ALTER TABLE timesheets ADD COLUMN employee_id uuid REFERENCES employees(id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'vehicle_inspections' AND column_name = 'employee_id'
  ) THEN
    ALTER TABLE vehicle_inspections ADD COLUMN employee_id uuid REFERENCES employees(id);
  END IF;
END $$;

-- Enable RLS
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Public access to employees"
  ON employees
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- Insert sample employee data
INSERT INTO employees (name, role) VALUES
  ('John Smith', 'Field Technician'),
  ('Sarah Johnson', 'Equipment Operator'),
  ('Mike Wilson', 'Site Supervisor'),
  ('Emma Davis', 'Vehicle Inspector'),
  ('Tom Brown', 'Plant Operator')
ON CONFLICT DO NOTHING;