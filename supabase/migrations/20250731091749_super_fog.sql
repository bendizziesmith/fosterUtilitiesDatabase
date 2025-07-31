/*
  # Rebuild vehicles table from scratch

  1. Drop existing vehicles table and recreate with simplified structure
  2. New Tables
    - `vehicles`
      - `id` (uuid, primary key)
      - `registration_number` (text, unique, required)
      - `make_model` (text, required)
      - `next_service_date` (date, optional)
      - `next_mot_date` (date, optional)
      - `last_service_date` (date, optional)
      - `last_mot_date` (date, optional)
      - `created_at` (timestamp)
  3. Security
    - Enable RLS on `vehicles` table
    - Add policy for authenticated users to manage vehicles
*/

-- Drop existing vehicles table and all dependencies
DROP TABLE IF EXISTS vehicles CASCADE;

-- Create new simplified vehicles table
CREATE TABLE IF NOT EXISTS vehicles (
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

-- Create policies
CREATE POLICY "Allow authenticated users to manage vehicles"
  ON vehicles
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_vehicles_registration ON vehicles(registration_number);
CREATE INDEX IF NOT EXISTS idx_vehicles_next_service ON vehicles(next_service_date);
CREATE INDEX IF NOT EXISTS idx_vehicles_next_mot ON vehicles(next_mot_date);