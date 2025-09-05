/*
  # Create HAVs Timesheets System

  1. New Tables
    - `havs_timesheets`
      - `id` (uuid, primary key)
      - `employee_id` (uuid, foreign key to employees)
      - `employee_name` (text)
      - `employee_no` (text)
      - `week_ending` (date)
      - `comments` (text)
      - `actions` (text)
      - `supervisor_name` (text)
      - `supervisor_signature` (text)
      - `date_signed` (date)
      - `status` (text: draft, submitted)
      - `submitted_at` (timestamp)
      - `total_hours` (numeric)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)
    
    - `havs_timesheet_entries`
      - `id` (uuid, primary key)
      - `timesheet_id` (uuid, foreign key to havs_timesheets)
      - `equipment_name` (text)
      - `equipment_category` (text: CIVILS, JOINTING, OVERHEADS, EARTH PIN DRIVER)
      - `monday_hours` (numeric)
      - `tuesday_hours` (numeric)
      - `wednesday_hours` (numeric)
      - `thursday_hours` (numeric)
      - `friday_hours` (numeric)
      - `saturday_hours` (numeric)
      - `sunday_hours` (numeric)
      - `total_hours` (numeric)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

  2. Security
    - Enable RLS on both tables
    - Add policies for authenticated users to manage their own timesheets
    - Add policies for admins to view all timesheets
*/

CREATE TABLE IF NOT EXISTS havs_timesheets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid REFERENCES employees(id) ON DELETE CASCADE,
  employee_name text NOT NULL,
  employee_no text,
  week_ending date NOT NULL,
  comments text,
  actions text,
  supervisor_name text,
  supervisor_signature text,
  date_signed date,
  status text DEFAULT 'draft' CHECK (status IN ('draft', 'submitted')),
  submitted_at timestamptz,
  total_hours numeric(5,2) DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS havs_timesheet_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  timesheet_id uuid REFERENCES havs_timesheets(id) ON DELETE CASCADE,
  equipment_name text NOT NULL,
  equipment_category text NOT NULL CHECK (equipment_category IN ('CIVILS', 'JOINTING', 'OVERHEADS', 'EARTH PIN DRIVER')),
  monday_hours numeric(5,2) DEFAULT 0,
  tuesday_hours numeric(5,2) DEFAULT 0,
  wednesday_hours numeric(5,2) DEFAULT 0,
  thursday_hours numeric(5,2) DEFAULT 0,
  friday_hours numeric(5,2) DEFAULT 0,
  saturday_hours numeric(5,2) DEFAULT 0,
  sunday_hours numeric(5,2) DEFAULT 0,
  total_hours numeric(5,2) DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE havs_timesheets ENABLE ROW LEVEL SECURITY;
ALTER TABLE havs_timesheet_entries ENABLE ROW LEVEL SECURITY;

-- Policies for havs_timesheets
CREATE POLICY "Users can manage their own HAVs timesheets"
  ON havs_timesheets
  FOR ALL
  TO authenticated
  USING (
    employee_id IN (
      SELECT employee_id FROM user_profiles WHERE id = auth.uid()
    )
  )
  WITH CHECK (
    employee_id IN (
      SELECT employee_id FROM user_profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Admins can manage all HAVs timesheets"
  ON havs_timesheets
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Policies for havs_timesheet_entries
CREATE POLICY "Users can manage their own HAVs timesheet entries"
  ON havs_timesheet_entries
  FOR ALL
  TO authenticated
  USING (
    timesheet_id IN (
      SELECT id FROM havs_timesheets 
      WHERE employee_id IN (
        SELECT employee_id FROM user_profiles WHERE id = auth.uid()
      )
    )
  )
  WITH CHECK (
    timesheet_id IN (
      SELECT id FROM havs_timesheets 
      WHERE employee_id IN (
        SELECT employee_id FROM user_profiles WHERE id = auth.uid()
      )
    )
  );

CREATE POLICY "Admins can manage all HAVs timesheet entries"
  ON havs_timesheet_entries
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_havs_timesheets_employee_id ON havs_timesheets(employee_id);
CREATE INDEX IF NOT EXISTS idx_havs_timesheets_week_ending ON havs_timesheets(week_ending);
CREATE INDEX IF NOT EXISTS idx_havs_timesheets_status ON havs_timesheets(status);
CREATE INDEX IF NOT EXISTS idx_havs_timesheet_entries_timesheet_id ON havs_timesheet_entries(timesheet_id);
CREATE INDEX IF NOT EXISTS idx_havs_timesheet_entries_equipment_category ON havs_timesheet_entries(equipment_category);