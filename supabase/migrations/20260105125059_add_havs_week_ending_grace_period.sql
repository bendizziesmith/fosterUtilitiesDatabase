/*
  # Add HAVS Week Ending Grace Period Logic

  ## Purpose
  Implements Monday/Tuesday grace period for HAVS submissions.
  Real-world gangs often submit late - this prevents lost records.

  ## Business Rules
  - HAVS weeks always end on Sunday
  - Submissions on Monday/Tuesday apply to PREVIOUS Sunday
  - Submissions on Wednesday-Sunday apply to UPCOMING Sunday
  - Week ending stored in DB, never inferred from UI

  ## Example
  - Submit on Mon 12 Jan → Week Ending: 11 Jan (previous Sunday)
  - Submit on Tue 13 Jan → Week Ending: 11 Jan (previous Sunday)
  - Submit on Wed 14 Jan → Week Ending: 18 Jan (upcoming Sunday)

  ## Legal Compliance
  Ensures employer can search by week ending and find ALL submissions
  including late Monday/Tuesday entries.
*/

-- =====================================================
-- FUNCTION: Calculate Effective Week Ending with Grace Period
-- =====================================================

CREATE OR REPLACE FUNCTION get_havs_week_ending(reference_date date DEFAULT CURRENT_DATE)
RETURNS date
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  day_of_week integer;
  days_until_sunday integer;
  week_ending_date date;
BEGIN
  -- Get day of week (0=Sunday, 1=Monday, 2=Tuesday, etc.)
  day_of_week := EXTRACT(DOW FROM reference_date);

  -- Monday (1) or Tuesday (2): Use PREVIOUS Sunday
  IF day_of_week IN (1, 2) THEN
    -- Calculate days back to previous Sunday
    -- Monday: 1 day back, Tuesday: 2 days back
    week_ending_date := reference_date - day_of_week;
  
  -- Sunday (0): Use today (already Sunday)
  ELSIF day_of_week = 0 THEN
    week_ending_date := reference_date;
  
  -- Wednesday-Saturday: Use UPCOMING Sunday
  ELSE
    -- Calculate days forward to next Sunday
    -- Wed(3): 4 days forward, Thu(4): 3 days, Fri(5): 2 days, Sat(6): 1 day
    days_until_sunday := 7 - day_of_week;
    week_ending_date := reference_date + days_until_sunday;
  END IF;

  RETURN week_ending_date;
END;
$$;

-- =====================================================
-- FUNCTION: Get or Create HAVS Week with Grace Period Logic
-- =====================================================

CREATE OR REPLACE FUNCTION get_or_create_havs_week(
  ganger_employee_id uuid,
  reference_date date DEFAULT CURRENT_DATE
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  calculated_week_ending date;
  existing_week record;
  new_week_id uuid;
  result jsonb;
BEGIN
  -- Calculate the effective week ending using grace period logic
  calculated_week_ending := get_havs_week_ending(reference_date);

  -- Check if week already exists for this ganger
  SELECT 
    id,
    week_ending,
    status,
    submitted_at,
    last_saved_at,
    revision_number,
    created_at,
    updated_at
  INTO existing_week
  FROM havs_weeks
  WHERE ganger_id = ganger_employee_id
    AND week_ending = calculated_week_ending;

  -- If exists, return it
  IF FOUND THEN
    RETURN jsonb_build_object(
      'id', existing_week.id,
      'week_ending', existing_week.week_ending,
      'status', existing_week.status,
      'submitted_at', existing_week.submitted_at,
      'last_saved_at', existing_week.last_saved_at,
      'revision_number', existing_week.revision_number,
      'created_at', existing_week.created_at,
      'updated_at', existing_week.updated_at,
      'is_new', false
    );
  END IF;

  -- Create new week
  INSERT INTO havs_weeks (
    ganger_id,
    week_ending,
    status,
    revision_number,
    created_at,
    updated_at
  )
  VALUES (
    ganger_employee_id,
    calculated_week_ending,
    'draft',
    0,
    now(),
    now()
  )
  RETURNING id INTO new_week_id;

  -- Return new week
  RETURN jsonb_build_object(
    'id', new_week_id,
    'week_ending', calculated_week_ending,
    'status', 'draft',
    'submitted_at', null,
    'last_saved_at', null,
    'revision_number', 0,
    'created_at', now(),
    'updated_at', now(),
    'is_new', true
  );
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_havs_week_ending TO authenticated;
GRANT EXECUTE ON FUNCTION get_or_create_havs_week TO authenticated;

-- Add helpful comments
COMMENT ON FUNCTION get_havs_week_ending IS 'Calculates HAVS week ending with Monday/Tuesday grace period. Mon/Tue → previous Sunday, Wed-Sun → upcoming Sunday. Critical for legal compliance.';
COMMENT ON FUNCTION get_or_create_havs_week IS 'Gets existing or creates new HAVS week using grace period logic. Ensures one week per ganger per week_ending. Call this instead of direct INSERT.';

-- Example usage queries (for documentation)
/*
-- Test the week ending calculation for different days:
SELECT 
  date::date as submission_date,
  to_char(date, 'Dy') as day_name,
  get_havs_week_ending(date::date) as week_ending,
  to_char(get_havs_week_ending(date::date), 'Dy DD Mon') as week_ending_formatted
FROM generate_series(
  '2026-01-11'::date,  -- Sunday
  '2026-01-17'::date,  -- Saturday
  '1 day'::interval
) as date;

Expected Results:
submission_date | day_name | week_ending | week_ending_formatted
----------------|----------|-------------|----------------------
2026-01-11      | Sun      | 2026-01-11  | Sun 11 Jan
2026-01-12      | Mon      | 2026-01-11  | Sun 11 Jan  (GRACE PERIOD)
2026-01-13      | Tue      | 2026-01-11  | Sun 11 Jan  (GRACE PERIOD)
2026-01-14      | Wed      | 2026-01-18  | Sun 18 Jan
2026-01-15      | Thu      | 2026-01-18  | Sun 18 Jan
2026-01-16      | Fri      | 2026-01-18  | Sun 18 Jan
2026-01-17      | Sat      | 2026-01-18  | Sun 18 Jan
*/
