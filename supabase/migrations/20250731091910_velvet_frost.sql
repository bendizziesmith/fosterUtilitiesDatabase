/*
  # Rebuild vehicles table and fix employee-vehicle relationship

  1. New Tables
    - `vehicles` (rebuilt from scratch)
      - `id` (uuid, primary key)
      - `registration_number` (text, unique, required)
      - `make_model` (text, required)
      - `next_service_date` (date, optional)
      - `next_mot_date` (date, optional)
      - `last_service_date` (date, optional)
      - `last_mot_date` (date, optional)
      - `created_at` (timestamp)

  2. Updates
    - Add foreign key constraint to employees.assigned_vehicle_id
    - Enable RLS on vehicles table
    - Add policies for authenticated users

  3. Security
    - Enable RLS on vehicles table
    - Add policy for authenticated users to manage vehicles
*/

-- Drop existing vehicles table if it exists
DROP TABLE IF EXISTS vehicles CASCADE;

-- Create new vehicles table
CREATE TABLE vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_number text UNIQUE NOT NULL,
  make_model text NOT NULL,
  next_service_date date,
  next_mot_date date,
  last_service_date date,
  last_mot_date date,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;

-- Add policy for authenticated users
CREATE POLICY "Allow authenticated users to manage vehicles"
  ON vehicles
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Add indexes for performance
CREATE INDEX idx_vehicles_registration ON vehicles(registration_number);
CREATE INDEX idx_vehicles_next_service ON vehicles(next_service_date);
CREATE INDEX idx_vehicles_next_mot ON vehicles(next_mot_date);

-- Add foreign key constraint to employees table for assigned_vehicle_id
DO $$
BEGIN
  -- Check if the foreign key constraint doesn't already exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'employees_assigned_vehicle_id_fkey'
  ) THEN
    -- Add the foreign key constraint
    ALTER TABLE employees 
    ADD CONSTRAINT employees_assigned_vehicle_id_fkey 
    FOREIGN KEY (assigned_vehicle_id) REFERENCES vehicles(id) ON DELETE SET NULL;
  END IF;
END $$;