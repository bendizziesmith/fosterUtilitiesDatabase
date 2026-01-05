/*
  # Create Employer HAVS Overview View

  1. New Views
    - `havs_employer_weekly_overview` - Aggregated view of all HAVS weeks for employers
      - week_id, week_ending, week_status
      - ganger details (id, name, role)
      - member counts, total exposure minutes
      - submission timestamps
  
  2. Security
    - View accessible to authenticated users
*/

CREATE OR REPLACE VIEW havs_employer_weekly_overview AS
SELECT 
  hw.id AS week_id,
  hw.week_ending,
  hw.status AS week_status,
  hw.submitted_at AS week_submitted_at,
  hw.last_saved_at,
  hw.revision_number,
  hw.ganger_id,
  e.full_name AS ganger_name,
  e.role AS ganger_role,
  hw.created_at,
  COALESCE(member_stats.total_members, 0)::integer AS total_members,
  COALESCE(member_stats.operative_count, 0)::integer AS operative_count,
  COALESCE(exposure_stats.total_gang_minutes, 0)::integer AS total_gang_minutes
FROM havs_weeks hw
JOIN employees e ON e.id = hw.ganger_id
LEFT JOIN (
  SELECT 
    havs_week_id,
    COUNT(*) AS total_members,
    COUNT(*) FILTER (WHERE role = 'Operative') AS operative_count
  FROM havs_week_members
  GROUP BY havs_week_id
) member_stats ON member_stats.havs_week_id = hw.id
LEFT JOIN (
  SELECT 
    hwm.havs_week_id,
    SUM(hee.minutes) AS total_gang_minutes
  FROM havs_week_members hwm
  JOIN havs_exposure_entries hee ON hee.havs_week_member_id = hwm.id
  GROUP BY hwm.havs_week_id
) exposure_stats ON exposure_stats.havs_week_id = hw.id;

COMMENT ON VIEW havs_employer_weekly_overview IS 'Aggregated HAVS week data for employer dashboard';
