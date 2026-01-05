/*
  # Create Employer HAVS Views and Functions

  ## Purpose
  Provide employer with accurate, trustworthy HAVS submission data directly from database.
  This is a legal health & safety record - accuracy is non-negotiable.

  ## Changes
  1. Create view for employer weekly overview (all gangs, all members)
  2. Create function to get detailed week submission with full audit trail
  3. Create function for CSV export data
  4. Add RLS policies for employer/admin access to all HAVS data
  5. Create atomic submission validation function

  ## Legal Requirements
  - One person = one entry per week (no duplicates)
  - Submission timestamp preserved immutably
  - Full audit trail maintained
  - Historical records never deleted
*/

-- =====================================================
-- EMPLOYER VIEW: Weekly HAVS Overview
-- =====================================================

CREATE OR REPLACE VIEW havs_employer_weekly_overview AS
SELECT 
  hw.id as week_id,
  hw.week_ending,
  hw.status as week_status,
  hw.submitted_at as week_submitted_at,
  hw.last_saved_at,
  hw.revision_number,
  hw.ganger_id,
  ganger.full_name as ganger_name,
  ganger.role as ganger_role,
  COUNT(DISTINCT hwm.id) as total_members,
  SUM(CASE WHEN hwm.person_type = 'operative' THEN 1 ELSE 0 END) as operative_count,
  SUM(member_totals.total_minutes) as total_gang_minutes,
  hw.created_at
FROM havs_weeks hw
JOIN employees ganger ON ganger.id = hw.ganger_id
LEFT JOIN havs_week_members hwm ON hwm.havs_week_id = hw.id
LEFT JOIN LATERAL (
  SELECT COALESCE(SUM(minutes), 0) as total_minutes
  FROM havs_exposure_entries
  WHERE havs_week_member_id = hwm.id
) member_totals ON true
GROUP BY 
  hw.id, 
  hw.week_ending, 
  hw.status, 
  hw.submitted_at, 
  hw.last_saved_at,
  hw.revision_number,
  hw.ganger_id, 
  ganger.full_name, 
  ganger.role,
  hw.created_at;

-- =====================================================
-- FUNCTION: Get Week Details for Employer
-- =====================================================

CREATE OR REPLACE FUNCTION get_havs_week_details(week_id_param uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result jsonb;
  member_record record;
  members_array jsonb := '[]'::jsonb;
BEGIN
  -- Get week header
  SELECT jsonb_build_object(
    'id', hw.id,
    'week_ending', hw.week_ending,
    'status', hw.status,
    'submitted_at', hw.submitted_at,
    'last_saved_at', hw.last_saved_at,
    'revision_number', hw.revision_number,
    'created_at', hw.created_at,
    'ganger', jsonb_build_object(
      'id', e.id,
      'full_name', e.full_name,
      'role', e.role
    )
  ) INTO result
  FROM havs_weeks hw
  JOIN employees e ON e.id = hw.ganger_id
  WHERE hw.id = week_id_param;

  -- Get all members with their exposure data
  FOR member_record IN
    SELECT 
      hwm.id as member_id,
      hwm.person_type,
      hwm.manual_name,
      hwm.role,
      hwm.comments,
      hwm.actions,
      hwm.created_at,
      COALESCE(e.id, NULL) as employee_id,
      COALESCE(e.full_name, hwm.manual_name) as display_name,
      COALESCE(SUM(hee.minutes), 0) as total_minutes
    FROM havs_week_members hwm
    LEFT JOIN employees e ON e.id = hwm.employee_id
    LEFT JOIN havs_exposure_entries hee ON hee.havs_week_member_id = hwm.id
    WHERE hwm.havs_week_id = week_id_param
    GROUP BY 
      hwm.id, 
      hwm.person_type, 
      hwm.manual_name, 
      hwm.role, 
      hwm.comments, 
      hwm.actions,
      hwm.created_at,
      e.id, 
      e.full_name
    ORDER BY 
      CASE hwm.person_type WHEN 'ganger' THEN 0 ELSE 1 END,
      hwm.created_at
  LOOP
    -- Get exposure breakdown for this member
    members_array := members_array || jsonb_build_object(
      'member_id', member_record.member_id,
      'person_type', member_record.person_type,
      'employee_id', member_record.employee_id,
      'display_name', member_record.display_name,
      'role', member_record.role,
      'is_manual', member_record.manual_name IS NOT NULL,
      'total_minutes', member_record.total_minutes,
      'comments', member_record.comments,
      'actions', member_record.actions,
      'exposure_entries', (
        SELECT jsonb_agg(
          jsonb_build_object(
            'equipment_name', equipment_name,
            'equipment_category', equipment_category,
            'day_of_week', day_of_week,
            'minutes', minutes
          ) ORDER BY 
            equipment_category,
            equipment_name,
            CASE day_of_week
              WHEN 'monday' THEN 1
              WHEN 'tuesday' THEN 2
              WHEN 'wednesday' THEN 3
              WHEN 'thursday' THEN 4
              WHEN 'friday' THEN 5
              WHEN 'saturday' THEN 6
              WHEN 'sunday' THEN 7
            END
        )
        FROM havs_exposure_entries
        WHERE havs_week_member_id = member_record.member_id
      )
    );
  END LOOP;

  result := result || jsonb_build_object('members', members_array);

  -- Get revision history
  result := result || jsonb_build_object(
    'revisions',
    COALESCE(
      (SELECT jsonb_agg(
        jsonb_build_object(
          'revision_number', revision_number,
          'created_at', created_at,
          'notes', notes
        ) ORDER BY revision_number DESC
      )
      FROM havs_revisions
      WHERE havs_week_id = week_id_param),
      '[]'::jsonb
    )
  );

  RETURN result;
END;
$$;

-- =====================================================
-- FUNCTION: Get CSV Export Data
-- =====================================================

CREATE OR REPLACE FUNCTION get_havs_csv_export(week_id_param uuid)
RETURNS TABLE (
  week_ending date,
  ganger_name text,
  member_name text,
  member_type text,
  member_source text,
  role text,
  equipment_name text,
  equipment_category text,
  day_of_week text,
  minutes integer,
  total_member_minutes bigint,
  status text,
  submitted_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    hw.week_ending,
    ganger.full_name as ganger_name,
    COALESCE(emp.full_name, hwm.manual_name) as member_name,
    hwm.person_type as member_type,
    CASE 
      WHEN hwm.manual_name IS NOT NULL THEN 'manual'
      ELSE 'employee'
    END as member_source,
    hwm.role,
    hee.equipment_name,
    hee.equipment_category,
    hee.day_of_week,
    hee.minutes,
    member_totals.total_minutes as total_member_minutes,
    hw.status,
    hw.submitted_at
  FROM havs_weeks hw
  JOIN employees ganger ON ganger.id = hw.ganger_id
  JOIN havs_week_members hwm ON hwm.havs_week_id = hw.id
  LEFT JOIN employees emp ON emp.id = hwm.employee_id
  LEFT JOIN havs_exposure_entries hee ON hee.havs_week_member_id = hwm.id
  LEFT JOIN LATERAL (
    SELECT SUM(minutes) as total_minutes
    FROM havs_exposure_entries
    WHERE havs_week_member_id = hwm.id
  ) member_totals ON true
  WHERE hw.id = week_id_param
  ORDER BY 
    CASE hwm.person_type WHEN 'ganger' THEN 0 ELSE 1 END,
    hwm.created_at,
    hee.equipment_category,
    hee.equipment_name,
    CASE hee.day_of_week
      WHEN 'monday' THEN 1
      WHEN 'tuesday' THEN 2
      WHEN 'wednesday' THEN 3
      WHEN 'thursday' THEN 4
      WHEN 'friday' THEN 5
      WHEN 'saturday' THEN 6
      WHEN 'sunday' THEN 7
    END;
END;
$$;

-- =====================================================
-- FUNCTION: Validate and Submit HAVS Week (Atomic)
-- =====================================================

CREATE OR REPLACE FUNCTION submit_havs_week(week_id_param uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  member_count integer;
  zero_exposure_count integer;
  week_status text;
  result jsonb;
BEGIN
  -- Check if week exists and is owned by current user
  SELECT status INTO week_status
  FROM havs_weeks
  WHERE id = week_id_param
    AND ganger_id IN (
      SELECT employee_id FROM user_profiles WHERE id = auth.uid()
    );

  IF week_status IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Week not found or access denied'
    );
  END IF;

  -- Count members
  SELECT COUNT(*) INTO member_count
  FROM havs_week_members
  WHERE havs_week_id = week_id_param;

  IF member_count = 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'No gang members added. Please add at least yourself (ganger).'
    );
  END IF;

  -- Check for members with zero exposure
  SELECT COUNT(*) INTO zero_exposure_count
  FROM havs_week_members hwm
  WHERE hwm.havs_week_id = week_id_param
    AND NOT EXISTS (
      SELECT 1 FROM havs_exposure_entries hee
      WHERE hee.havs_week_member_id = hwm.id
        AND hee.minutes > 0
    );

  IF zero_exposure_count > 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'All gang members must have exposure time recorded before submission.'
    );
  END IF;

  -- All validation passed - submit atomically
  UPDATE havs_weeks
  SET 
    status = 'submitted',
    submitted_at = now(),
    updated_at = now()
  WHERE id = week_id_param;

  -- Create revision snapshot
  PERFORM create_havs_revision(week_id_param);

  -- Return success with summary
  SELECT jsonb_build_object(
    'success', true,
    'member_count', COUNT(*),
    'total_minutes', SUM(totals.minutes)
  ) INTO result
  FROM havs_week_members hwm
  LEFT JOIN LATERAL (
    SELECT COALESCE(SUM(minutes), 0) as minutes
    FROM havs_exposure_entries
    WHERE havs_week_member_id = hwm.id
  ) totals ON true
  WHERE hwm.havs_week_id = week_id_param;

  RETURN result;
END;
$$;

-- =====================================================
-- RLS POLICIES: Employer/Admin Access
-- =====================================================

-- Admin/Employer can view all HAVS weeks
CREATE POLICY "Admins can view all HAVS weeks"
  ON havs_weeks FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
        AND user_profiles.role = 'admin'
    )
  );

-- Admin/Employer can view all HAVS members
CREATE POLICY "Admins can view all HAVS members"
  ON havs_week_members FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
        AND user_profiles.role = 'admin'
    )
  );

-- Admin/Employer can view all exposure entries
CREATE POLICY "Admins can view all exposure entries"
  ON havs_exposure_entries FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
        AND user_profiles.role = 'admin'
    )
  );

-- Admin/Employer can view all revisions
CREATE POLICY "Admins can view all revisions"
  ON havs_revisions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
        AND user_profiles.role = 'admin'
    )
  );

-- Grant execute permissions on functions
GRANT EXECUTE ON FUNCTION get_havs_week_details TO authenticated;
GRANT EXECUTE ON FUNCTION get_havs_csv_export TO authenticated;
GRANT EXECUTE ON FUNCTION submit_havs_week TO authenticated;

-- Grant select on view
GRANT SELECT ON havs_employer_weekly_overview TO authenticated;

COMMENT ON VIEW havs_employer_weekly_overview IS 'Employer view of all HAVS weeks with gang summaries - legal HSE record';
COMMENT ON FUNCTION get_havs_week_details IS 'Get complete week details including all members and exposure data for employer review';
COMMENT ON FUNCTION get_havs_csv_export IS 'Export HAVS week data as CSV-ready rows for legal record keeping';
COMMENT ON FUNCTION submit_havs_week IS 'Atomic submission with validation - ensures data integrity for legal compliance';
