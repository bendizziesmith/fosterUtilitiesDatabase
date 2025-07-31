/*
  # Add RLS Policies for Structured Timesheets

  1. Security
    - Enable RLS on structured_timesheets table
    - Add comprehensive policies for all operations
    - Allow public access for anon and authenticated users
    - Ensure proper access control for CRUD operations

  2. Policies Added
    - Public read access for all users
    - Public insert access for all users  
    - Public update access for all users
    - Public delete access for all users
*/

-- Ensure RLS is enabled
ALTER TABLE structured_timesheets ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can read own structured timesheets" ON structured_timesheets;
DROP POLICY IF EXISTS "Users can insert structured timesheets" ON structured_timesheets;
DROP POLICY IF EXISTS "Public access to structured timesheets" ON structured_timesheets;

-- Create comprehensive policies for all operations
CREATE POLICY "Public read access to structured timesheets"
  ON structured_timesheets
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Public insert access to structured timesheets"
  ON structured_timesheets
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Public update access to structured timesheets"
  ON structured_timesheets
  FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Public delete access to structured timesheets"
  ON structured_timesheets
  FOR DELETE
  TO anon, authenticated
  USING (true);