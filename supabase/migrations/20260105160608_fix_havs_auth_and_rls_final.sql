/*
  # Fix HAVS Auth and RLS - Final Production Fix

  ## Problem Summary
  1. "User profile not found" error when creating HAVS weeks
  2. RLS policy violations on havs_weeks INSERT

  ## Root Causes
  - Users exist in auth.users but missing user_profiles rows
  - RLS policies not properly allowing week creation via RPC

  ## Fixes Applied
  1. Auth trigger to auto-create user_profiles on signup
  2. ensure_user_profile function to repair missing profiles at runtime
  3. Fixed RLS policies for havs_weeks to work with SECURITY DEFINER RPC
  4. Updated create_havs_week RPC to bypass RLS properly

  ## Security
  - All functions use SECURITY DEFINER where needed
  - RLS remains enabled on all tables
  - No global INSERT permissions - all properly scoped
*/

-- ============================================================
-- 1. FIX AUTH TRIGGER FOR USER PROFILE AUTO-CREATION
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_employee_id uuid;
  v_role text := 'employee';
  v_user_email text;
BEGIN
  v_user_email := NEW.email;
  
  SELECT id INTO v_employee_id
  FROM employees
  WHERE email = v_user_email
  LIMIT 1;

  IF NEW.raw_user_meta_data->>'role' = 'admin' THEN
    v_role := 'admin';
  END IF;

  INSERT INTO public.user_profiles (id, employee_id, role, created_at)
  VALUES (NEW.id, v_employee_id, v_role, now())
  ON CONFLICT (id) DO UPDATE SET
    employee_id = COALESCE(user_profiles.employee_id, EXCLUDED.employee_id),
    role = COALESCE(user_profiles.role, EXCLUDED.role);

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'handle_new_user failed for %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- 2. FIX ensure_user_profile FUNCTION (RUNTIME FALLBACK)
-- ============================================================

CREATE OR REPLACE FUNCTION public.ensure_user_profile()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_employee_id uuid;
  v_user_email text;
  v_profile_exists boolean;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT EXISTS (SELECT 1 FROM user_profiles WHERE id = v_user_id) INTO v_profile_exists;
  
  IF v_profile_exists THEN
    RETURN v_user_id;
  END IF;

  SELECT email INTO v_user_email
  FROM auth.users
  WHERE id = v_user_id;

  SELECT id INTO v_employee_id
  FROM employees
  WHERE email = v_user_email
  LIMIT 1;

  INSERT INTO user_profiles (id, employee_id, role, created_at)
  VALUES (v_user_id, v_employee_id, 'employee', now())
  ON CONFLICT (id) DO NOTHING;

  RETURN v_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_user_profile() TO authenticated;

-- ============================================================
-- 3. FIX create_havs_week RPC (ATOMIC TRANSACTIONAL)
-- ============================================================

DROP FUNCTION IF EXISTS create_havs_week(date, uuid[]);

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
  v_carry_member record;
BEGIN
  PERFORM ensure_user_profile();
  v_user_id := auth.uid();
  
  SELECT employee_id INTO v_employee_id
  FROM user_profiles
  WHERE id = v_user_id;
  
  IF v_employee_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'User profile not linked to an employee. Contact administrator.'
    );
  END IF;
  
  SELECT role INTO v_employee_role
  FROM employees
  WHERE id = v_employee_id;
  
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
  );
  
  IF array_length(p_carry_over_member_ids, 1) > 0 THEN
    FOR v_carry_member IN
      SELECT 
        person_type,
        employee_id,
        manual_name,
        role
      FROM havs_week_members
      WHERE id = ANY(p_carry_over_member_ids)
        AND person_type != 'ganger'
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
  
  RETURN (
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
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'id', m.id,
          'person_type', m.person_type,
          'employee_id', m.employee_id,
          'manual_name', m.manual_name,
          'role', m.role
        )), '[]'::jsonb)
        FROM havs_week_members m
        WHERE m.havs_week_id = hw.id
      )
    )
    FROM havs_weeks hw
    WHERE hw.id = v_new_week_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_havs_week(date, uuid[]) TO authenticated;

-- ============================================================
-- 4. FIX RLS POLICIES FOR havs_weeks
-- ============================================================

DROP POLICY IF EXISTS "Employees can create their own havs weeks" ON havs_weeks;
DROP POLICY IF EXISTS "Gangers can view own weeks" ON havs_weeks;
DROP POLICY IF EXISTS "Gangers can update own weeks" ON havs_weeks;
DROP POLICY IF EXISTS "Gangers can delete draft weeks" ON havs_weeks;

CREATE POLICY "Gangers can view own weeks"
ON havs_weeks
FOR SELECT
TO authenticated
USING (
  ganger_id IN (
    SELECT employee_id FROM user_profiles WHERE id = auth.uid()
  )
  OR
  EXISTS (
    SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin'
  )
);

CREATE POLICY "Gangers can insert own weeks"
ON havs_weeks
FOR INSERT
TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND
  ganger_id IN (
    SELECT employee_id FROM user_profiles WHERE id = auth.uid()
  )
);

CREATE POLICY "Gangers can update own weeks"
ON havs_weeks
FOR UPDATE
TO authenticated
USING (
  ganger_id IN (
    SELECT employee_id FROM user_profiles WHERE id = auth.uid()
  )
)
WITH CHECK (
  ganger_id IN (
    SELECT employee_id FROM user_profiles WHERE id = auth.uid()
  )
);

CREATE POLICY "Gangers can delete draft weeks"
ON havs_weeks
FOR DELETE
TO authenticated
USING (
  status = 'draft'
  AND
  ganger_id IN (
    SELECT employee_id FROM user_profiles WHERE id = auth.uid()
  )
);

-- ============================================================
-- 5. FIX RLS POLICIES FOR havs_week_members
-- ============================================================

DROP POLICY IF EXISTS "Users can view members in their weeks" ON havs_week_members;
DROP POLICY IF EXISTS "Users can insert members in their weeks" ON havs_week_members;
DROP POLICY IF EXISTS "Users can update members in their weeks" ON havs_week_members;
DROP POLICY IF EXISTS "Users can delete members from their weeks" ON havs_week_members;

CREATE POLICY "Users can view members in their weeks"
ON havs_week_members
FOR SELECT
TO authenticated
USING (
  havs_week_id IN (
    SELECT id FROM havs_weeks 
    WHERE ganger_id IN (
      SELECT employee_id FROM user_profiles WHERE id = auth.uid()
    )
  )
  OR
  EXISTS (
    SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin'
  )
);

CREATE POLICY "Users can insert members in their weeks"
ON havs_week_members
FOR INSERT
TO authenticated
WITH CHECK (
  havs_week_id IN (
    SELECT id FROM havs_weeks 
    WHERE ganger_id IN (
      SELECT employee_id FROM user_profiles WHERE id = auth.uid()
    )
  )
);

CREATE POLICY "Users can update members in their weeks"
ON havs_week_members
FOR UPDATE
TO authenticated
USING (
  havs_week_id IN (
    SELECT id FROM havs_weeks 
    WHERE ganger_id IN (
      SELECT employee_id FROM user_profiles WHERE id = auth.uid()
    )
  )
)
WITH CHECK (
  havs_week_id IN (
    SELECT id FROM havs_weeks 
    WHERE ganger_id IN (
      SELECT employee_id FROM user_profiles WHERE id = auth.uid()
    )
  )
);

CREATE POLICY "Users can delete members from their weeks"
ON havs_week_members
FOR DELETE
TO authenticated
USING (
  havs_week_id IN (
    SELECT id FROM havs_weeks 
    WHERE ganger_id IN (
      SELECT employee_id FROM user_profiles WHERE id = auth.uid()
    )
  )
);

-- ============================================================
-- 6. FIX RLS POLICIES FOR havs_exposure_entries
-- ============================================================

DROP POLICY IF EXISTS "Users can view entries for their week members" ON havs_exposure_entries;
DROP POLICY IF EXISTS "Users can insert entries for their week members" ON havs_exposure_entries;
DROP POLICY IF EXISTS "Users can update entries for their week members" ON havs_exposure_entries;
DROP POLICY IF EXISTS "Users can delete entries from their weeks" ON havs_exposure_entries;

CREATE POLICY "Users can view entries for their week members"
ON havs_exposure_entries
FOR SELECT
TO authenticated
USING (
  havs_week_member_id IN (
    SELECT hwm.id FROM havs_week_members hwm
    JOIN havs_weeks hw ON hw.id = hwm.havs_week_id
    WHERE hw.ganger_id IN (
      SELECT employee_id FROM user_profiles WHERE id = auth.uid()
    )
  )
  OR
  EXISTS (
    SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin'
  )
);

CREATE POLICY "Users can insert entries for their week members"
ON havs_exposure_entries
FOR INSERT
TO authenticated
WITH CHECK (
  havs_week_member_id IN (
    SELECT hwm.id FROM havs_week_members hwm
    JOIN havs_weeks hw ON hw.id = hwm.havs_week_id
    WHERE hw.ganger_id IN (
      SELECT employee_id FROM user_profiles WHERE id = auth.uid()
    )
  )
);

CREATE POLICY "Users can update entries for their week members"
ON havs_exposure_entries
FOR UPDATE
TO authenticated
USING (
  havs_week_member_id IN (
    SELECT hwm.id FROM havs_week_members hwm
    JOIN havs_weeks hw ON hw.id = hwm.havs_week_id
    WHERE hw.ganger_id IN (
      SELECT employee_id FROM user_profiles WHERE id = auth.uid()
    )
  )
)
WITH CHECK (
  havs_week_member_id IN (
    SELECT hwm.id FROM havs_week_members hwm
    JOIN havs_weeks hw ON hw.id = hwm.havs_week_id
    WHERE hw.ganger_id IN (
      SELECT employee_id FROM user_profiles WHERE id = auth.uid()
    )
  )
);

CREATE POLICY "Users can delete entries from their weeks"
ON havs_exposure_entries
FOR DELETE
TO authenticated
USING (
  havs_week_member_id IN (
    SELECT hwm.id FROM havs_week_members hwm
    JOIN havs_weeks hw ON hw.id = hwm.havs_week_id
    WHERE hw.ganger_id IN (
      SELECT employee_id FROM user_profiles WHERE id = auth.uid()
    )
  )
);

-- ============================================================
-- 7. BACKFILL user_profiles FOR EXISTING USERS
-- ============================================================

INSERT INTO user_profiles (id, employee_id, role, created_at)
SELECT 
  au.id,
  e.id,
  COALESCE(au.raw_user_meta_data->>'role', 'employee'),
  now()
FROM auth.users au
LEFT JOIN employees e ON e.email = au.email
WHERE NOT EXISTS (
  SELECT 1 FROM user_profiles up WHERE up.id = au.id
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 8. VERIFY get_havs_week_ending FUNCTION EXISTS
-- ============================================================

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
  v_day_of_week := EXTRACT(DOW FROM reference_date)::integer;
  
  IF v_day_of_week = 0 THEN
    v_result := reference_date;
  ELSIF v_day_of_week IN (1, 2) THEN
    v_result := reference_date - v_day_of_week;
  ELSE
    v_result := reference_date + (7 - v_day_of_week);
  END IF;
  
  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_havs_week_ending(date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_havs_week_ending(date, text) TO anon;
