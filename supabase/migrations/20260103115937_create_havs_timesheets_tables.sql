/*
  # Create HAVS Timesheets Tables

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
      - `status` (text - draft/submitted)
      - `submitted_at` (timestamptz)
      - `total_hours` (numeric)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

    - `havs_timesheet_entries`
      - `id` (uuid, primary key)
      - `timesheet_id` (uuid, foreign key to havs_timesheets)
      - `equipment_name` (text)
      - `equipment_category` (text)
      - Daily hours columns (monday-sunday)
      - `total_hours` (numeric)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on both tables
    - Policies for authenticated users
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
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted')),
  submitted_at timestamptz,
  total_hours numeric DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS havs_timesheet_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  timesheet_id uuid REFERENCES havs_timesheets(id) ON DELETE CASCADE,
  equipment_name text NOT NULL,
  equipment_category text DEFAULT 'CIVILS',
  monday_hours numeric DEFAULT 0,
  tuesday_hours numeric DEFAULT 0,
  wednesday_hours numeric DEFAULT 0,
  thursday_hours numeric DEFAULT 0,
  friday_hours numeric DEFAULT 0,
  saturday_hours numeric DEFAULT 0,
  sunday_hours numeric DEFAULT 0,
  total_hours numeric DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE havs_timesheets ENABLE ROW LEVEL SECURITY;
ALTER TABLE havs_timesheet_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view havs_timesheets"
  ON havs_timesheets FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert havs_timesheets"
  ON havs_timesheets FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update havs_timesheets"
  ON havs_timesheets FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete havs_timesheets"
  ON havs_timesheets FOR DELETE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can view havs_timesheet_entries"
  ON havs_timesheet_entries FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert havs_timesheet_entries"
  ON havs_timesheet_entries FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update havs_timesheet_entries"
  ON havs_timesheet_entries FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete havs_timesheet_entries"
  ON havs_timesheet_entries FOR DELETE
  TO authenticated
  USING (true);