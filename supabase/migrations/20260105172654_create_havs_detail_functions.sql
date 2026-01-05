/*
  # Create HAVS Detail Functions

  1. New Functions
    - `get_havs_week_details` - Get full details for a HAVS week including members and exposure
    - `get_havs_csv_export` - Export HAVS week data as CSV-friendly format
  
  2. Purpose
    - Enable employer dashboard to view and download HAVS records
*/

CREATE OR REPLACE FUNCTION get_havs_week_details(week_id_param uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result json;
BEGIN
  SELECT json_build_object(
    'id', hw.id,
    'week_ending', hw.week_ending,
    'status', hw.status,
    'submitted_at', hw.submitted_at,
    'last_saved_at', hw.last_saved_at,
    'revision_number', hw.revision_number,
    'created_at', hw.created_at,
    'ganger', json_build_object(
      'id', e.id,
      'full_name', e.full_name,
      'role', e.role
    ),
    'members', COALESCE((
      SELECT json_agg(
        json_build_object(
          'member_id', hwm.id,
          'person_type', hwm.person_type,
          'employee_id', hwm.employee_id,
          'display_name', COALESCE(emp.full_name, hwm.manual_name, 'Unknown'),
          'role', hwm.role,
          'is_manual', hwm.manual_name IS NOT NULL,
          'total_minutes', COALESCE((
            SELECT SUM(hee.minutes)
            FROM havs_exposure_entries hee
            WHERE hee.havs_week_member_id = hwm.id
          ), 0),
          'comments', hwm.comments,
          'actions', hwm.actions,
          'exposure_entries', COALESCE((
            SELECT json_agg(
              json_build_object(
                'equipment_name', hee.equipment_name,
                'equipment_category', hee.equipment_category,
                'day_of_week', hee.day_of_week,
                'minutes', hee.minutes
              )
            )
            FROM havs_exposure_entries hee
            WHERE hee.havs_week_member_id = hwm.id
          ), '[]'::json)
        )
      )
      FROM havs_week_members hwm
      LEFT JOIN employees emp ON emp.id = hwm.employee_id
      WHERE hwm.havs_week_id = hw.id
    ), '[]'::json),
    'revisions', '[]'::json
  ) INTO result
  FROM havs_weeks hw
  JOIN employees e ON e.id = hw.ganger_id
  WHERE hw.id = week_id_param;
  
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION get_havs_csv_export(week_id_param uuid)
RETURNS TABLE(
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
    e.full_name AS ganger_name,
    COALESCE(emp.full_name, hwm.manual_name, 'Unknown') AS member_name,
    hwm.person_type AS member_type,
    CASE WHEN hwm.manual_name IS NOT NULL THEN 'Manual' ELSE 'System' END AS member_source,
    hwm.role,
    hee.equipment_name,
    hee.equipment_category,
    hee.day_of_week,
    hee.minutes::integer,
    COALESCE((
      SELECT SUM(hee2.minutes)
      FROM havs_exposure_entries hee2
      WHERE hee2.havs_week_member_id = hwm.id
    ), 0) AS total_member_minutes,
    hw.status,
    hw.submitted_at
  FROM havs_weeks hw
  JOIN employees e ON e.id = hw.ganger_id
  JOIN havs_week_members hwm ON hwm.havs_week_id = hw.id
  LEFT JOIN employees emp ON emp.id = hwm.employee_id
  LEFT JOIN havs_exposure_entries hee ON hee.havs_week_member_id = hwm.id
  WHERE hw.id = week_id_param
  ORDER BY hwm.person_type DESC, member_name, hee.equipment_name, hee.day_of_week;
END;
$$;

COMMENT ON FUNCTION get_havs_week_details IS 'Get full HAVS week details for employer view';
COMMENT ON FUNCTION get_havs_csv_export IS 'Export HAVS week data for CSV download';
