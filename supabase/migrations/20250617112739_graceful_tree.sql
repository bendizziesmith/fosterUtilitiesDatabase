/*
  # Weekly Timesheet System

  1. New Tables
    - `weekly_timesheets`
      - `id` (uuid, primary key)
      - `employee_id` (uuid, foreign key)
      - `week_starting` (date) - Monday of the week
      - `status` (text) - draft, submitted, approved
      - `total_hours` (numeric) - calculated total
      - `total_overtime_hours` (numeric) - calculated overtime
      - `notes` (text) - weekly notes
      - `submitted_at` (timestamp)
      - `created_at` (timestamp)
    
    - `timesheet_entries`
      - `id` (uuid, primary key)
      - `timesheet_id` (uuid, foreign key)
      - `day_of_week` (integer) - 1=Monday, 7=Sunday
      - `start_time` (time) - start time
      - `finish_time` (time) - finish time
      - `break_minutes` (integer) - break time in minutes
      - `notes` (text) - daily notes
      - `created_at` (timestamp)

  2. Security
    - Enable RLS on both tables
    - Add policies for authenticated users
*/

-- Create weekly_timesheets table
CREATE TABLE IF NOT EXISTS weekly_timesheets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid REFERENCES employees(id) ON DELETE CASCADE,
  week_starting date NOT NULL,
  status text DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'approved')),
  total_hours numeric DEFAULT 0,
  total_overtime_hours numeric DEFAULT 0,
  notes text,
  submitted_at timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE(employee_id, week_starting)
);

-- Create timesheet_entries table
CREATE TABLE IF NOT EXISTS timesheet_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  timesheet_id uuid REFERENCES weekly_timesheets(id) ON DELETE CASCADE,
  day_of_week integer NOT NULL CHECK (day_of_week >= 1 AND day_of_week <= 7),
  start_time time,
  finish_time time,
  break_minutes integer DEFAULT 30,
  notes text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(timesheet_id, day_of_week)
);

-- Enable RLS
ALTER TABLE weekly_timesheets ENABLE ROW LEVEL SECURITY;
ALTER TABLE timesheet_entries ENABLE ROW LEVEL SECURITY;

-- Create policies for weekly_timesheets
CREATE POLICY "Public access to weekly timesheets"
  ON weekly_timesheets
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- Create policies for timesheet_entries
CREATE POLICY "Public access to timesheet entries"
  ON timesheet_entries
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- Create function to calculate timesheet totals
CREATE OR REPLACE FUNCTION calculate_timesheet_totals(timesheet_id_param uuid)
RETURNS void AS $$
DECLARE
  entry_record RECORD;
  daily_hours numeric;
  daily_overtime numeric;
  total_regular numeric := 0;
  total_ot numeric := 0;
  start_minutes integer;
  finish_minutes integer;
  worked_minutes integer;
  break_mins integer;
BEGIN
  -- Loop through all entries for this timesheet
  FOR entry_record IN 
    SELECT start_time, finish_time, break_minutes
    FROM timesheet_entries 
    WHERE timesheet_id = timesheet_id_param
    AND start_time IS NOT NULL 
    AND finish_time IS NOT NULL
  LOOP
    -- Convert times to minutes since midnight
    start_minutes := EXTRACT(HOUR FROM entry_record.start_time) * 60 + EXTRACT(MINUTE FROM entry_record.start_time);
    finish_minutes := EXTRACT(HOUR FROM entry_record.finish_time) * 60 + EXTRACT(MINUTE FROM entry_record.finish_time);
    break_mins := COALESCE(entry_record.break_minutes, 30);
    
    -- Handle overnight shifts
    IF finish_minutes < start_minutes THEN
      finish_minutes := finish_minutes + (24 * 60); -- Add 24 hours
    END IF;
    
    -- Calculate worked minutes (minus break)
    worked_minutes := finish_minutes - start_minutes - break_mins;
    
    -- Convert to hours
    daily_hours := worked_minutes / 60.0;
    
    -- Calculate overtime (anything over 8 hours per day)
    IF daily_hours > 8 THEN
      daily_overtime := daily_hours - 8;
      daily_hours := 8;
    ELSE
      daily_overtime := 0;
    END IF;
    
    -- Add to totals
    total_regular := total_regular + daily_hours;
    total_ot := total_ot + daily_overtime;
  END LOOP;
  
  -- Update the timesheet with calculated totals
  UPDATE weekly_timesheets 
  SET 
    total_hours = total_regular,
    total_overtime_hours = total_ot
  WHERE id = timesheet_id_param;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-calculate totals when entries change
CREATE OR REPLACE FUNCTION trigger_calculate_timesheet_totals()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM calculate_timesheet_totals(OLD.timesheet_id);
    RETURN OLD;
  ELSE
    PERFORM calculate_timesheet_totals(NEW.timesheet_id);
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Create triggers
DROP TRIGGER IF EXISTS timesheet_entries_calculate_totals ON timesheet_entries;
CREATE TRIGGER timesheet_entries_calculate_totals
  AFTER INSERT OR UPDATE OR DELETE ON timesheet_entries
  FOR EACH ROW EXECUTE FUNCTION trigger_calculate_timesheet_totals();