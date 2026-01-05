/*
  # Comprehensive HAVS System Fix

  ## 1. User Profile Auto-Creation
    - Creates trigger to automatically create user_profiles on auth.users insert
    - Handles existing users without profiles via fallback function
    - Ensures "User profile not found" never occurs

  ## 2. Week Ending Grace Period Function
    - Creates get_havs_week_ending function implementing UK grace period rules
    - Mon/Tue submissions apply to previous week ending Sunday
    - Wed-Sun submissions apply to current week ending Sunday

  ## 3. Transactional Week Creation RPC
    - Creates create_havs_week function for atomic week creation
    - Inserts havs_week, ganger member, and optionally carries over members
    - All exposure values reset to 0 for new weeks
    - Returns new week data on success

  ## 4. RLS Policy Fixes
    - Updates havs_weeks INSERT policy to properly check ganger ownership
    - Ensures all RLS policies work correctly for authenticated users

  ## Security
    - All functions use SECURITY DEFINER where needed for proper access
    - RLS remains enabled on all tables
    - Proper ownership and audit trail maintained
*/

-- ============================================================
-- 1. USER PROFILE AUTO-CREATION TRIGGER
-- ============================================================

-- Function to handle new user signup and create profile
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_employee_id uuid;
  v_role text := 'employee';
BEGIN
  -- Try to find matching employee by email
  SELECT id INTO v_employee_id
  FROM employees
  WHERE email = NEW.email
  LIMIT 1;

  -- Check if user is admin from metadata
  IF NEW.raw_user_meta_data->>'role' = 'admin' THEN
    v_role := 'admin';
  END IF;

  -- Insert user profile (upsert to handle edge cases)
  INSERT INTO public.user_profiles (id, employee_id, role, created_at)
  VALUES (NEW.id, v_employee_id, v_role, now())
  ON CONFLICT (id) DO UPDATE SET
    employee_id = COALESCE(EXCLUDED.employee_id, user_profiles.employee_id),
    role = COALESCE(EXCLUDED.role, user_profiles.role);

  RETURN NEW;
END;
$$;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Create trigger for new user signups
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Function to ensure profile exists (fallback for existing users)
CREATE OR REPLACE FUNCTION public.ensure_user_profile()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_employee_id uuid;
  v_user_email text;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Check if profile already exists
  IF EXISTS (SELECT 1 FROM user_profiles WHERE id = v_user_id) THEN
    RETURN v_user_id;
  END IF;

  -- Get user email from auth
  SELECT email INTO v_user_email
  FROM auth.users
  WHERE id = v_user_id;

  -- Find matching employee
  SELECT id INTO v_employee_id
  FROM employees
  WHERE email = v_user_email
  LIMIT 1;

  -- Create profile
  INSERT INTO user_profiles (id, employee_id, role, created_at)
  VALUES (v_user_id, v_employee_id, 'employee', now())
  ON CONFLICT (id) DO NOTHING;

  RETURN v_user_id;
END;
$$;

-- ============================================================
-- 2. WEEK ENDING GRACE PERIOD FUNCTION
-- ============================================================

-- Drop existing function if exists (with different signature)
DROP FUNCTION IF EXISTS get_havs_week_ending(date);
DROP FUNCTION IF EXISTS get_havs_week_ending(date, text);

-- Function to calculate effective week ending with grace period
-- Mon/Tue = previous Sunday, Wed-Sun = coming Sunday
CREATE OR REPLACE FUNCTION public.get_havs_week_ending(
  reference_date date DEFAULT CURRENT_DATE,
  timezone_name text DEFAULT 'Europe/London'
)
RETURNS date
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_day_of_week integer;
  v_result date;
BEGIN
  -- Get day of week (0=Sun, 1=Mon, 2=Tue, ..., 6=Sat)
  v_day_of_week := EXTRACT(DOW FROM reference_date)::integer;
  
  -- Apply grace period logic:
  -- Monday (1) or Tuesday (2): use PREVIOUS Sunday
  -- Wednesday-Saturday (3-6): use NEXT Sunday
  -- Sunday (0): use THIS Sunday (today)
  
  IF v_day_of_week = 0 THEN
    -- Sunday: use today
    v_result := reference_date;
  ELSIF v_day_of_week IN (1, 2) THEN
    -- Monday or Tuesday: use previous Sunday
    v_result := reference_date - v_day_of_week;
  ELSE
    -- Wednesday through Saturday: use next Sunday
    v_result := reference_date + (7 - v_day_of_week);
  END IF;
  
  RETURN v_result;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.get_havs_week_ending(date, text) TO authenticated;

-- ============================================================
-- 3. TRANSACTIONAL WEEK CREATION RPC
-- ============================================================

-- Drop existing function if exists
DROP FUNCTION IF EXISTS create_havs_week(date, uuid[]);

-- Function to create a new HAVS week transactionally
CREATE OR REPLACE FUNCTION public.create_havs_week(
  p_week_ending date,
  p_carry_over_member_ids uuid[] DEFAULT '{}'::uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_employee_id uuid;
  v_employee_role text;
  v_new_week_id uuid;
  v_new_member_id uuid;
  v_carry_member record;
  v_result jsonb;
BEGIN
  -- Ensure user is authenticated and has profile
  PERFORM ensure_user_profile();
  v_user_id := auth.uid();
  
  -- Get employee_id from user_profiles
  SELECT employee_id INTO v_employee_id
  FROM user_profiles
  WHERE id = v_user_id;
  
  IF v_employee_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'User profile not linked to an employee. Contact administrator.'
    );
  END IF;
  
  -- Get employee role
  SELECT role INTO v_employee_role
  FROM employees
  WHERE id = v_employee_id;
  
  -- Check if week already exists for this ganger
  IF EXISTS (
    SELECT 1 FROM havs_weeks
    WHERE ganger_id = v_employee_id
    AND week_ending = p_week_ending
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'A HAVS week already exists for this week ending date'
    );
  END IF;
  
  -- Create the new week
  INSERT INTO havs_weeks (
    ganger_id,
    week_ending,
    status,
    created_by,
    created_at,
    updated_at
  ) VALUES (
    v_employee_id,
    p_week_ending,
    'draft',
    v_user_id,
    now(),
    now()
  ) RETURNING id INTO v_new_week_id;
  
  -- Create ganger as first member
  INSERT INTO havs_week_members (
    havs_week_id,
    person_type,
    employee_id,
    role,
    created_at
  ) VALUES (
    v_new_week_id,
    'ganger',
    v_employee_id,
    COALESCE(v_employee_role, 'Ganger'),
    now()
  ) RETURNING id INTO v_new_member_id;
  
  -- Carry over selected members (people only, NOT data)
  IF array_length(p_carry_over_member_ids, 1) > 0 THEN
    FOR v_carry_member IN
      SELECT 
        person_type,
        employee_id,
        manual_name,
        role
      FROM havs_week_members
      WHERE id = ANY(p_carry_over_member_ids)
        AND person_type != 'ganger'  -- Don't duplicate ganger
    LOOP
      INSERT INTO havs_week_members (
        havs_week_id,
        person_type,
        employee_id,
        manual_name,
        role,
        created_at
      ) VALUES (
        v_new_week_id,
        v_carry_member.person_type,
        v_carry_member.employee_id,
        v_carry_member.manual_name,
        v_carry_member.role,
        now()
      );
    END LOOP;
  END IF;
  
  -- Return success with week data
  SELECT jsonb_build_object(
    'success', true,
    'week', jsonb_build_object(
      'id', hw.id,
      'ganger_id', hw.ganger_id,
      'week_ending', hw.week_ending,
      'status', hw.status,
      'created_at', hw.created_at
    ),
    'members', (
      SELECT jsonb_agg(jsonb_build_object(
        'id', m.id,
        'person_type', m.person_type,
        'employee_id', m.employee_id,
        'manual_name', m.manual_name,
        'role', m.role
      ))
      FROM havs_week_members m
      WHERE m.havs_week_id = hw.id
    )
  ) INTO v_result
  FROM havs_weeks hw
  WHERE hw.id = v_new_week_id;
  
  RETURN v_result;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.create_havs_week(date, uuid[]) TO authenticated;

-- ============================================================
-- 4. RLS POLICY FIXES
-- ============================================================

-- Drop and recreate havs_weeks INSERT policy with proper check
DROP POLICY IF EXISTS "Employees can create their own havs weeks" ON havs_weeks;

CREATE POLICY "Employees can create their own havs weeks"
ON havs_weeks
FOR INSERT
TO authenticated
WITH CHECK (
  -- User must be authenticated
  auth.uid() IS NOT NULL
  AND
  -- created_by must match authenticated user
  created_by = auth.uid()
  AND
  -- ganger_id must match user's employee_id
  ganger_id IN (
    SELECT employee_id FROM user_profiles WHERE id = auth.uid()
  )
);

-- Ensure user_profiles has proper policies
DROP POLICY IF EXISTS "Allow authenticated users to manage profiles" ON user_profiles;
DROP POLICY IF EXISTS "Users can read own profile" ON user_profiles;

-- Users can read their own profile
CREATE POLICY "Users can read own profile"
ON user_profiles
FOR SELECT
TO authenticated
USING (id = auth.uid());

-- Users can insert their own profile (for fallback creation)
CREATE POLICY "Users can insert own profile"
ON user_profiles
FOR INSERT
TO authenticated
WITH CHECK (id = auth.uid());

-- Users can update their own profile
CREATE POLICY "Users can update own profile"
ON user_profiles
FOR UPDATE
TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

-- Admins can view all profiles
CREATE POLICY "Admins can view all profiles"
ON user_profiles
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid() AND role = 'admin'
  )
);

-- ============================================================
-- 5. HELPER FUNCTION FOR GETTING AVAILABLE WEEKS (VIEW ONLY)
-- ============================================================

-- Function to get weeks available for viewing (past + current only)
CREATE OR REPLACE FUNCTION public.get_viewable_week_endings(
  p_count integer DEFAULT 8
)
RETURNS TABLE(week_ending date, is_current boolean)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_effective_week date;
BEGIN
  v_effective_week := get_havs_week_ending(CURRENT_DATE);
  
  -- Return current effective week plus previous weeks
  RETURN QUERY
  SELECT 
    (v_effective_week - (7 * i))::date as week_ending,
    (i = 0) as is_current
  FROM generate_series(0, p_count - 1) i
  ORDER BY week_ending DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_viewable_week_endings(integer) TO authenticated;

-- Function to get weeks available for starting new week
CREATE OR REPLACE FUNCTION public.get_startable_week_endings(
  p_ganger_id uuid
)
RETURNS TABLE(week_ending date, already_exists boolean)
LANGUAGE plpgsql
STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_effective_week date;
  v_next_week date;
BEGIN
  v_effective_week := get_havs_week_ending(CURRENT_DATE);
  v_next_week := v_effective_week + 7;
  
  -- Return effective week + next 2 weeks
  RETURN QUERY
  SELECT 
    we.week_ending,
    EXISTS (
      SELECT 1 FROM havs_weeks hw
      WHERE hw.ganger_id = p_ganger_id
      AND hw.week_ending = we.week_ending
    ) as already_exists
  FROM (
    SELECT v_effective_week as week_ending
    UNION ALL
    SELECT v_next_week
    UNION ALL
    SELECT v_next_week + 7
  ) we
  ORDER BY we.week_ending;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_startable_week_endings(uuid) TO authenticated;
