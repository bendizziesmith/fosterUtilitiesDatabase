/*
  # Add Authentication and User Roles

  1. New Tables
    - `user_profiles` - Links Supabase auth users to employees/admins
      - `id` (uuid, primary key, references auth.users)
      - `employee_id` (uuid, references employees)
      - `role` (text, 'employee' or 'admin')
      - `created_at` (timestamp)

  2. Security
    - Enable RLS on `user_profiles` table
    - Add policies for user profile access
    - Update employees table to include email field

  3. Changes
    - Add email field to employees table
    - Create user profiles for authentication mapping
*/

-- Add email field to employees table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'employees' AND column_name = 'email'
  ) THEN
    ALTER TABLE employees ADD COLUMN email text UNIQUE;
  END IF;
END $$;

-- Create user_profiles table to link auth users to employees/admins
CREATE TABLE IF NOT EXISTS user_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  employee_id uuid REFERENCES employees(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('employee', 'admin')),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Policies for user_profiles
CREATE POLICY "Users can read own profile"
  ON user_profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON user_profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id);

-- Allow admins to manage all profiles
CREATE POLICY "Admins can manage all profiles"
  ON user_profiles
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid() AND up.role = 'admin'
    )
  );

-- Create a default admin user profile function
CREATE OR REPLACE FUNCTION create_admin_profile()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- This function can be called to create admin profiles
  -- Implementation depends on your specific admin setup needs
  NULL;
END;
$$;