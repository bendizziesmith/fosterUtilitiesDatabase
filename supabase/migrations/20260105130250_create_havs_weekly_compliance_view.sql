/*
  # Create HAVS Weekly Employee Compliance View

  ## Purpose
  Provides employer with per-employee HAVS compliance status for any week.
  Critical for legal H&S compliance monitoring.

  ## Features
  - Shows ALL employees (not just those who started HAVS)
  - Status: Not Started / Draft / Submitted
  - Total exposure minutes
  - Last updated timestamp
  - Gang membership tracking

  ## Business Rules
  - One HAVS record per employee per week (enforced by unique constraint)
  - Drafts are editable
  - Submitted records are immutable snapshots
  - All employees must be accounted for

  ## Legal Compliance
  Employer must see:
  - Who has not started (red flag)
  - Who is in draft (needs follow-up)
  - Who has submitted (compliant)
*/

-- =====================================================
-- FUNCTION: Get Active Week Ending (for Employer Dashboard)
-- =====================================================

CREATE OR REPLACE FUNCTION get_active_havs_week()
RETURNS date
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT get_havs_week_ending(CURRENT_DATE);
$$;

GRANT EXECUTE ON FUNCTION get_active_havs_week TO authenticated;

COMMENT ON FUNCTION get_active_havs_week IS 'Returns the active HAVS week ending for employer dashboard. Uses grace period logic: Mon/Tue → previous Sunday, Wed-Sun → upcoming Sunday.';

-- =====================================================
-- FUNCTION: Get Weekly Employee HAVS Compliance
-- =====================================================

CREATE OR REPLACE FUNCTION get_weekly_havs_compliance(
  target_week_ending date DEFAULT NULL
)
RETURNS TABLE (
  employee_id uuid,
  employee_name text,
  employee_role text,
  havs_status text,
  havs_week_id uuid,
  total_exposure_minutes integer,
  last_updated timestamptz,
  submitted_at timestamptz,
  revision_number integer,
  gang_id uuid,
  gang_name text,
  is_ganger boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  week_ending_date date;
BEGIN
  -- Use provided week ending or calculate active week
  week_ending_date := COALESCE(target_week_ending, get_active_havs_week());

  RETURN QUERY
  SELECT
    e.id as employee_id,
    e.name as employee_name,
    e.role as employee_role,
    
    -- Status logic: Not Started / Draft / Submitted
    CASE
      WHEN hw.id IS NULL THEN 'not_started'
      WHEN hw.status = 'submitted' THEN 'submitted'
      WHEN hw.status = 'draft' THEN 'draft'
      ELSE 'not_started'
    END as havs_status,
    
    hw.id as havs_week_id,
    
    -- Total exposure minutes (sum across all equipment and days)
    COALESCE(
      (SELECT SUM(exposure_minutes)
       FROM havs_exposure_entries hee
       WHERE hee.havs_week_id = hw.id),
      0
    )::integer as total_exposure_minutes,
    
    COALESCE(hw.last_saved_at, hw.updated_at) as last_updated,
    hw.submitted_at,
    COALESCE(hw.revision_number, 0) as revision_number,
    
    -- Gang information (if employee is a ganger)
    e.id as gang_id,
    e.name as gang_name,
    (e.role = 'Ganger') as is_ganger
    
  FROM employees e
  
  -- LEFT JOIN to include employees who haven't started HAVS
  LEFT JOIN havs_weeks hw ON (
    hw.ganger_id = e.id
    AND hw.week_ending = week_ending_date
  )
  
  -- Only include gangers and operatives (not admin)
  WHERE e.role IN ('Ganger', 'Operative')
  
  ORDER BY
    -- Gangers first, then operatives
    CASE WHEN e.role = 'Ganger' THEN 0 ELSE 1 END,
    -- Then by status: Not Started → Draft → Submitted
    CASE
      WHEN hw.id IS NULL THEN 0
      WHEN hw.status = 'draft' THEN 1
      WHEN hw.status = 'submitted' THEN 2
      ELSE 3
    END,
    e.name;
END;
$$;

GRANT EXECUTE ON FUNCTION get_weekly_havs_compliance TO authenticated;

COMMENT ON FUNCTION get_weekly_havs_compliance IS 'Returns per-employee HAVS compliance for a given week. Shows ALL employees with status: not_started/draft/submitted. Used by employer dashboard.';

-- =====================================================
-- FUNCTION: Get Gang Members for a Specific HAVS Week
-- =====================================================

CREATE OR REPLACE FUNCTION get_havs_week_members_detailed(
  target_week_ending date,
  target_ganger_id uuid
)
RETURNS TABLE (
  member_id uuid,
  member_name text,
  member_role text,
  person_type text,
  total_exposure_minutes integer,
  has_exposure_data boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  havs_week_record_id uuid;
BEGIN
  -- Get the HAVS week ID for this ganger and week ending
  SELECT hw.id INTO havs_week_record_id
  FROM havs_weeks hw
  WHERE hw.ganger_id = target_ganger_id
    AND hw.week_ending = target_week_ending;

  -- If no HAVS week exists yet, return empty
  IF havs_week_record_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    e.id as member_id,
    e.name as member_name,
    e.role as member_role,
    hwm.person_type,
    
    -- Total exposure minutes for this member
    COALESCE(
      (SELECT SUM(exposure_minutes)
       FROM havs_exposure_entries hee
       WHERE hee.havs_week_id = havs_week_record_id
         AND hee.employee_id = e.id),
      0
    )::integer as total_exposure_minutes,
    
    -- Check if they have any exposure data
    EXISTS(
      SELECT 1
      FROM havs_exposure_entries hee
      WHERE hee.havs_week_id = havs_week_record_id
        AND hee.employee_id = e.id
    ) as has_exposure_data
    
  FROM havs_week_members hwm
  JOIN employees e ON e.id = hwm.employee_id
  WHERE hwm.havs_week_id = havs_week_record_id
  ORDER BY
    -- Ganger first, then operatives
    CASE WHEN hwm.person_type = 'ganger' THEN 0 ELSE 1 END,
    e.name;
END;
$$;

GRANT EXECUTE ON FUNCTION get_havs_week_members_detailed TO authenticated;

COMMENT ON FUNCTION get_havs_week_members_detailed IS 'Returns detailed member list for a specific HAVS week submission, including exposure totals.';

-- =====================================================
-- FUNCTION: Get HAVS Week Summary Stats
-- =====================================================

CREATE OR REPLACE FUNCTION get_havs_week_stats(
  target_week_ending date DEFAULT NULL
)
RETURNS TABLE (
  week_ending date,
  total_employees integer,
  not_started_count integer,
  draft_count integer,
  submitted_count integer,
  total_exposure_minutes integer,
  compliance_percentage numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  week_ending_date date;
BEGIN
  week_ending_date := COALESCE(target_week_ending, get_active_havs_week());

  RETURN QUERY
  WITH employee_stats AS (
    SELECT
      COUNT(*) as total_employees,
      COUNT(*) FILTER (WHERE havs_status = 'not_started') as not_started,
      COUNT(*) FILTER (WHERE havs_status = 'draft') as draft,
      COUNT(*) FILTER (WHERE havs_status = 'submitted') as submitted,
      COALESCE(SUM(total_exposure_minutes), 0) as total_minutes
    FROM get_weekly_havs_compliance(week_ending_date)
  )
  SELECT
    week_ending_date,
    es.total_employees::integer,
    es.not_started::integer,
    es.draft::integer,
    es.submitted::integer,
    es.total_minutes::integer,
    CASE
      WHEN es.total_employees > 0 THEN
        ROUND((es.submitted::numeric / es.total_employees::numeric) * 100, 1)
      ELSE 0
    END as compliance_percentage
  FROM employee_stats es;
END;
$$;

GRANT EXECUTE ON FUNCTION get_havs_week_stats TO authenticated;

COMMENT ON FUNCTION get_havs_week_stats IS 'Returns summary statistics for HAVS compliance for a given week. Used for employer dashboard KPIs.';

-- =====================================================
-- TEST QUERIES (For Documentation)
-- =====================================================

/*
-- Get active week ending
SELECT get_active_havs_week();

-- Get compliance for active week
SELECT * FROM get_weekly_havs_compliance();

-- Get compliance for specific week
SELECT * FROM get_weekly_havs_compliance('2026-01-11'::date);

-- Get week stats for active week
SELECT * FROM get_havs_week_stats();

-- Get week stats for specific week
SELECT * FROM get_havs_week_stats('2026-01-11'::date);

-- Get members for a specific ganger's HAVS week
SELECT * FROM get_havs_week_members_detailed(
  '2026-01-11'::date,
  '[ganger_id]'::uuid
);
*/
