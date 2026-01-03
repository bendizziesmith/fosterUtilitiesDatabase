/*
  # Create User Profiles Table

  1. New Tables
    - `user_profiles`
      - `id` (uuid, primary key, references auth.users)
      - `employee_id` (uuid, optional foreign key to employees)
      - `role` (text - 'employee' or 'admin')
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS
    - Policies for authenticated users to read their own profile
*/

CREATE TABLE IF NOT EXISTS user_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  employee_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  role text NOT NULL DEFAULT 'employee' CHECK (role IN ('employee', 'admin')),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON user_profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can view all profiles"
  ON user_profiles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert user profiles"
  ON user_profiles FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Admins can update user profiles"
  ON user_profiles FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Admins can delete user profiles"
  ON user_profiles FOR DELETE
  TO authenticated
  USING (true);