/*
  # Create missing database tables and relationships

  1. New Tables
    - `vehicles` - Fleet vehicle management
      - `id` (uuid, primary key)
      - `registration_number` (text, unique)
      - `make` (text)
      - `model` (text)
      - `year` (integer)
      - `next_service_date` (date, nullable)
      - `next_mot_date` (date, nullable)
      - `last_service_date` (date, nullable)
      - `last_mot_date` (date, nullable)
      - `created_at` (timestamptz)

    - `user_profiles` - User role management
      - `id` (uuid, primary key, references auth.users)
      - `employee_id` (uuid, nullable, references employees)
      - `role` (text)
      - `created_at` (timestamptz)

  2. Table Updates
    - Add `assigned_vehicle_id` to `employees` table as foreign key to `vehicles`

  3. Security
    - Enable RLS on all tables
    - Add policies for authenticated users
*/

-- Create vehicles table
CREATE TABLE IF NOT EXISTS vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_number text UNIQUE NOT NULL,
  make text NOT NULL,
  model text NOT NULL,
  year integer NOT NULL,
  next_service_date date,
  next_mot_date date,
  last_service_date date,
  last_mot_date date,
  created_at timestamptz DEFAULT now()
);

-- Create user_profiles table
CREATE TABLE IF NOT EXISTS user_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  employee_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  role text NOT NULL DEFAULT 'employee',
  created_at timestamptz DEFAULT now()
);

-- Add assigned_vehicle_id to employees table if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'employees' AND column_name = 'assigned_vehicle_id'
  ) THEN
    ALTER TABLE employees ADD COLUMN assigned_vehicle_id uuid REFERENCES vehicles(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Enable RLS on vehicles table
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;

-- Enable RLS on user_profiles table
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Create policies for vehicles table
CREATE POLICY "Allow authenticated users to read vehicles"
  ON vehicles
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to manage vehicles"
  ON vehicles
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Create policies for user_profiles table
CREATE POLICY "Users can read own profile"
  ON user_profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Allow authenticated users to manage profiles"
  ON user_profiles
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_vehicles_registration ON vehicles(registration_number);
CREATE INDEX IF NOT EXISTS idx_vehicles_make_model ON vehicles(make, model);
CREATE INDEX IF NOT EXISTS idx_user_profiles_employee_id ON user_profiles(employee_id);
CREATE INDEX IF NOT EXISTS idx_employees_assigned_vehicle ON employees(assigned_vehicle_id);