/*
  # Fix RLS Policies for Structured Timesheets

  1. Security Updates
    - Drop existing incomplete policies
    - Create comprehensive CRUD policies for all users
    - Ensure proper access for both anon and authenticated users
    - Enable full read/write access for the application

  2. Policy Coverage
    - SELECT: Public read access for viewing timesheets
    - INSERT: Public insert access for creating timesheets  
    - UPDATE: Public update access for modifying timesheets
    - DELETE: Public delete access for removing timesheets
*/

-- Ensure RLS is enabled
ALTER TABLE structured_timesheets ENABLE ROW LEVEL SECURITY;

-- Drop all existing policies to start fresh
DROP POLICY IF EXISTS "Public access to structured timesheets" ON structured_timesheets;
DROP POLICY IF EXISTS "Users can read own structured timesheets" ON structured_timesheets;
DROP POLICY IF EXISTS "Users can insert structured timesheets" ON structured_timesheets;
DROP POLICY IF EXISTS "Public read access to structured timesheets" ON structured_timesheets;
DROP POLICY IF EXISTS "Public insert access to structured timesheets" ON structured_timesheets;
DROP POLICY IF EXISTS "Public update access to structured timesheets" ON structured_timesheets;
DROP POLICY IF EXISTS "Public delete access to structured timesheets" ON structured_timesheets;

-- Create comprehensive policies for all CRUD operations
CREATE POLICY "Allow all operations on structured timesheets"
  ON structured_timesheets
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- Additional specific policies for clarity
CREATE POLICY "Allow SELECT on structured timesheets"
  ON structured_timesheets
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Allow INSERT on structured timesheets"
  ON structured_timesheets
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Allow UPDATE on structured timesheets"
  ON structured_timesheets
  FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow DELETE on structured timesheets"
  ON structured_timesheets
  FOR DELETE
  TO anon, authenticated
  USING (true);