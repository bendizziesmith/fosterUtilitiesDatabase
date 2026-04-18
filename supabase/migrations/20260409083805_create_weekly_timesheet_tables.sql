/*
  # Create Weekly Timesheet Tables

  This migration creates the data model for the weekly timesheet feature,
  allowing gangers to record their weekly work and submit to employers.

  1. New Tables
    - `timesheet_weeks`
      - `id` (uuid, primary key)
      - `ganger_employee_id` (uuid, FK to employees) - the ganger who owns the timesheet
      - `week_ending` (date) - Sunday of the week
      - `status` (text) - draft / submitted / returned
      - `ganger_name_snapshot` (text) - snapshot of ganger name at creation
      - `vehicle_id` (uuid, FK to vehicles, nullable) - assigned vehicle
      - `vehicle_registration_snapshot` (text, nullable) - snapshot of vehicle reg
      - `labourer_1_name` (text, nullable) - optional labourer name
      - `labourer_2_name` (text, nullable) - optional labourer name
      - `weekly_total_hours` (numeric, default 0) - calculated total
      - `submitted_at` (timestamptz, nullable)
      - `returned_at` (timestamptz, nullable)
      - `returned_reason` (text, nullable)
      - `submission_count` (integer, default 0)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
    - `timesheet_job_rows`
      - `id` (uuid, primary key)
      - `timesheet_week_id` (uuid, FK to timesheet_weeks)
      - `sort_order` (integer) - ordering
      - `job_number` (text) - job number
      - `job_address` (text) - job address
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
    - `timesheet_day_entries`
      - `id` (uuid, primary key)
      - `timesheet_job_row_id` (uuid, FK to timesheet_job_rows)
      - `day_of_week` (text) - monday through sunday
      - `start_time` (time, nullable)
      - `finish_time` (time, nullable)
      - `office_duration` (interval, nullable) - extra office time
      - `hours_total` (numeric, default 0) - calculated hours for this day
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - RLS enabled on all three tables
    - Gangers can manage their own timesheet data
    - Admins can view all timesheets and update status (return flow)

  3. Constraints
    - Unique constraint on (ganger_employee_id, week_ending) for timesheet_weeks
    - Check constraint on status values
    - Check constraint on day_of_week values
    - Cascading deletes from parent to children
*/

-- timesheet_weeks: one row per ganger per week
CREATE TABLE IF NOT EXISTS timesheet_weeks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ganger_employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  week_ending date NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  ganger_name_snapshot text NOT NULL DEFAULT '',
  vehicle_id uuid REFERENCES vehicles(id) ON DELETE SET NULL,
  vehicle_registration_snapshot text,
  labourer_1_name text,
  labourer_2_name text,
  weekly_total_hours numeric NOT NULL DEFAULT 0,
  submitted_at timestamptz,
  returned_at timestamptz,
  returned_reason text,
  submission_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT timesheet_weeks_status_check CHECK (status IN ('draft', 'submitted', 'returned')),
  CONSTRAINT timesheet_weeks_unique_ganger_week UNIQUE (ganger_employee_id, week_ending)
);

ALTER TABLE timesheet_weeks ENABLE ROW LEVEL SECURITY;

-- timesheet_job_rows: one row per job block within a week
CREATE TABLE IF NOT EXISTS timesheet_job_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  timesheet_week_id uuid NOT NULL REFERENCES timesheet_weeks(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  job_number text NOT NULL DEFAULT '',
  job_address text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE timesheet_job_rows ENABLE ROW LEVEL SECURITY;

-- timesheet_day_entries: one row per job row per day
CREATE TABLE IF NOT EXISTS timesheet_day_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  timesheet_job_row_id uuid NOT NULL REFERENCES timesheet_job_rows(id) ON DELETE CASCADE,
  day_of_week text NOT NULL,
  start_time time,
  finish_time time,
  office_duration interval DEFAULT '00:00:00',
  hours_total numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT timesheet_day_entries_day_check CHECK (
    day_of_week IN ('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday')
  ),
  CONSTRAINT timesheet_day_entries_unique_row_day UNIQUE (timesheet_job_row_id, day_of_week)
);

ALTER TABLE timesheet_day_entries ENABLE ROW LEVEL SECURITY;

-- RLS Policies for timesheet_weeks

CREATE POLICY "Gangers can view own timesheets"
  ON timesheet_weeks FOR SELECT
  TO authenticated
  USING (
    ganger_employee_id IN (
      SELECT e.id FROM employees e
      JOIN user_profiles up ON up.employee_id = e.id
      WHERE up.id = auth.uid()
    )
  );

CREATE POLICY "Gangers can insert own timesheets"
  ON timesheet_weeks FOR INSERT
  TO authenticated
  WITH CHECK (
    ganger_employee_id IN (
      SELECT e.id FROM employees e
      JOIN user_profiles up ON up.employee_id = e.id
      WHERE up.id = auth.uid()
    )
  );

CREATE POLICY "Gangers can update own draft or returned timesheets"
  ON timesheet_weeks FOR UPDATE
  TO authenticated
  USING (
    ganger_employee_id IN (
      SELECT e.id FROM employees e
      JOIN user_profiles up ON up.employee_id = e.id
      WHERE up.id = auth.uid()
    )
    AND status IN ('draft', 'returned')
  )
  WITH CHECK (
    ganger_employee_id IN (
      SELECT e.id FROM employees e
      JOIN user_profiles up ON up.employee_id = e.id
      WHERE up.id = auth.uid()
    )
  );

CREATE POLICY "Admins can view all timesheets"
  ON timesheet_weeks FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can update timesheet status"
  ON timesheet_weeks FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

-- RLS Policies for timesheet_job_rows

CREATE POLICY "Gangers can view own job rows"
  ON timesheet_job_rows FOR SELECT
  TO authenticated
  USING (
    timesheet_week_id IN (
      SELECT tw.id FROM timesheet_weeks tw
      JOIN employees e ON e.id = tw.ganger_employee_id
      JOIN user_profiles up ON up.employee_id = e.id
      WHERE up.id = auth.uid()
    )
  );

CREATE POLICY "Gangers can insert own job rows"
  ON timesheet_job_rows FOR INSERT
  TO authenticated
  WITH CHECK (
    timesheet_week_id IN (
      SELECT tw.id FROM timesheet_weeks tw
      JOIN employees e ON e.id = tw.ganger_employee_id
      JOIN user_profiles up ON up.employee_id = e.id
      WHERE up.id = auth.uid()
      AND tw.status IN ('draft', 'returned')
    )
  );

CREATE POLICY "Gangers can update own job rows"
  ON timesheet_job_rows FOR UPDATE
  TO authenticated
  USING (
    timesheet_week_id IN (
      SELECT tw.id FROM timesheet_weeks tw
      JOIN employees e ON e.id = tw.ganger_employee_id
      JOIN user_profiles up ON up.employee_id = e.id
      WHERE up.id = auth.uid()
      AND tw.status IN ('draft', 'returned')
    )
  )
  WITH CHECK (
    timesheet_week_id IN (
      SELECT tw.id FROM timesheet_weeks tw
      JOIN employees e ON e.id = tw.ganger_employee_id
      JOIN user_profiles up ON up.employee_id = e.id
      WHERE up.id = auth.uid()
    )
  );

CREATE POLICY "Gangers can delete own job rows"
  ON timesheet_job_rows FOR DELETE
  TO authenticated
  USING (
    timesheet_week_id IN (
      SELECT tw.id FROM timesheet_weeks tw
      JOIN employees e ON e.id = tw.ganger_employee_id
      JOIN user_profiles up ON up.employee_id = e.id
      WHERE up.id = auth.uid()
      AND tw.status IN ('draft', 'returned')
    )
  );

CREATE POLICY "Admins can view all job rows"
  ON timesheet_job_rows FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

-- RLS Policies for timesheet_day_entries

CREATE POLICY "Gangers can view own day entries"
  ON timesheet_day_entries FOR SELECT
  TO authenticated
  USING (
    timesheet_job_row_id IN (
      SELECT tjr.id FROM timesheet_job_rows tjr
      JOIN timesheet_weeks tw ON tw.id = tjr.timesheet_week_id
      JOIN employees e ON e.id = tw.ganger_employee_id
      JOIN user_profiles up ON up.employee_id = e.id
      WHERE up.id = auth.uid()
    )
  );

CREATE POLICY "Gangers can insert own day entries"
  ON timesheet_day_entries FOR INSERT
  TO authenticated
  WITH CHECK (
    timesheet_job_row_id IN (
      SELECT tjr.id FROM timesheet_job_rows tjr
      JOIN timesheet_weeks tw ON tw.id = tjr.timesheet_week_id
      JOIN employees e ON e.id = tw.ganger_employee_id
      JOIN user_profiles up ON up.employee_id = e.id
      WHERE up.id = auth.uid()
      AND tw.status IN ('draft', 'returned')
    )
  );

CREATE POLICY "Gangers can update own day entries"
  ON timesheet_day_entries FOR UPDATE
  TO authenticated
  USING (
    timesheet_job_row_id IN (
      SELECT tjr.id FROM timesheet_job_rows tjr
      JOIN timesheet_weeks tw ON tw.id = tjr.timesheet_week_id
      JOIN employees e ON e.id = tw.ganger_employee_id
      JOIN user_profiles up ON up.employee_id = e.id
      WHERE up.id = auth.uid()
      AND tw.status IN ('draft', 'returned')
    )
  )
  WITH CHECK (
    timesheet_job_row_id IN (
      SELECT tjr.id FROM timesheet_job_rows tjr
      JOIN timesheet_weeks tw ON tw.id = tjr.timesheet_week_id
      JOIN employees e ON e.id = tw.ganger_employee_id
      JOIN user_profiles up ON up.employee_id = e.id
      WHERE up.id = auth.uid()
    )
  );

CREATE POLICY "Gangers can delete own day entries"
  ON timesheet_day_entries FOR DELETE
  TO authenticated
  USING (
    timesheet_job_row_id IN (
      SELECT tjr.id FROM timesheet_job_rows tjr
      JOIN timesheet_weeks tw ON tw.id = tjr.timesheet_week_id
      JOIN employees e ON e.id = tw.ganger_employee_id
      JOIN user_profiles up ON up.employee_id = e.id
      WHERE up.id = auth.uid()
      AND tw.status IN ('draft', 'returned')
    )
  );

CREATE POLICY "Admins can view all day entries"
  ON timesheet_day_entries FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

-- Create indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_timesheet_weeks_ganger ON timesheet_weeks(ganger_employee_id);
CREATE INDEX IF NOT EXISTS idx_timesheet_weeks_week_ending ON timesheet_weeks(week_ending);
CREATE INDEX IF NOT EXISTS idx_timesheet_weeks_status ON timesheet_weeks(status);
CREATE INDEX IF NOT EXISTS idx_timesheet_job_rows_week ON timesheet_job_rows(timesheet_week_id);
CREATE INDEX IF NOT EXISTS idx_timesheet_day_entries_row ON timesheet_day_entries(timesheet_job_row_id);
