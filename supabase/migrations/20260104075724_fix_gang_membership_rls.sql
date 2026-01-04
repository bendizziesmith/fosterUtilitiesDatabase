/*
  # Fix Gang Membership RLS Policies

  ## Problem
  - INSERT policy checking `ganger_id = auth.uid()` fails
  - `ganger_id` is employees.id (employee UUID)
  - `auth.uid()` is auth.users.id (auth UUID)
  - These are different values, causing all inserts to fail

  ## Solution
  - Drop existing RLS policies
  - Create new policies that check if ganger_id matches the employee_id in user_profiles
  - Allow inserts/updates/deletes when authenticated user's employee_id = ganger_id
  - Allow selects when user is either ganger or operative

  ## Changes
  1. Drop all existing gang_membership policies
  2. Create new policies using user_profiles lookup
  3. Support both employee and manual operatives
*/

-- Drop existing policies
DROP POLICY IF EXISTS "Users can insert their own gang memberships" ON gang_membership;
DROP POLICY IF EXISTS "Users can update their own gang memberships" ON gang_membership;
DROP POLICY IF EXISTS "Users can delete their own gang memberships" ON gang_membership;
DROP POLICY IF EXISTS "Users can view gang memberships where they are ganger" ON gang_membership;

-- Create new policies with correct auth check

-- INSERT: Allow if user's employee_id matches ganger_id
CREATE POLICY "Gangers can add operatives to their gang"
  ON gang_membership
  FOR INSERT
  TO authenticated
  WITH CHECK (
    ganger_id IN (
      SELECT employee_id 
      FROM user_profiles 
      WHERE id = auth.uid()
    )
  );

-- SELECT: Allow if user is ganger or operative (for employees only, not manual)
CREATE POLICY "Users can view gang memberships"
  ON gang_membership
  FOR SELECT
  TO authenticated
  USING (
    ganger_id IN (
      SELECT employee_id 
      FROM user_profiles 
      WHERE id = auth.uid()
    )
    OR
    (
      operative_id IN (
        SELECT employee_id 
        FROM user_profiles 
        WHERE id = auth.uid()
      )
      AND is_manual = false
    )
  );

-- UPDATE: Allow if user's employee_id matches ganger_id
CREATE POLICY "Gangers can update their gang memberships"
  ON gang_membership
  FOR UPDATE
  TO authenticated
  USING (
    ganger_id IN (
      SELECT employee_id 
      FROM user_profiles 
      WHERE id = auth.uid()
    )
  )
  WITH CHECK (
    ganger_id IN (
      SELECT employee_id 
      FROM user_profiles 
      WHERE id = auth.uid()
    )
  );

-- DELETE: Allow if user's employee_id matches ganger_id
CREATE POLICY "Gangers can delete their gang memberships"
  ON gang_membership
  FOR DELETE
  TO authenticated
  USING (
    ganger_id IN (
      SELECT employee_id 
      FROM user_profiles 
      WHERE id = auth.uid()
    )
  );
