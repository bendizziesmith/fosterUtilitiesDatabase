/*
  # Create Employees Table

  1. New Tables
    - `employees`
      - `id` (uuid, primary key)
      - `full_name` (text, required)
      - `role` (text, required)
      - `email` (text, unique)
      - `phone_number` (text)
      - `assigned_vehicle_id` (uuid, foreign key to vehicles)
      - `user_id` (uuid, links to auth.users)
      - `driving_license` (text)
      - `training_qualifications` (text array)
      - `is_ganger` (boolean)
      - `emergency_contact` (text)
      - `start_date` (date)
      - `rate` (numeric)
      - `password` (text, for display only - actual auth via Supabase Auth)
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS
    - Policies for authenticated users
*/

CREATE TABLE IF NOT EXISTS employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  role text NOT NULL DEFAULT 'Labourer',
  email text UNIQUE,
  phone_number text,
  assigned_vehicle_id uuid REFERENCES vehicles(id) ON DELETE SET NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  driving_license text,
  training_qualifications text[] DEFAULT '{}',
  is_ganger boolean DEFAULT false,
  emergency_contact text,
  start_date date,
  rate numeric DEFAULT 38,
  password text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE employees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view employees"
  ON employees FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert employees"
  ON employees FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update employees"
  ON employees FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete employees"
  ON employees FOR DELETE
  TO authenticated
  USING (true);

CREATE POLICY "Anonymous users can view employees for login"
  ON employees FOR SELECT
  TO anon
  USING (true);