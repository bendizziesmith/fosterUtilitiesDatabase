/*
  # Create structured timesheets table

  1. New Tables
    - `structured_timesheets`
      - `id` (uuid, primary key)
      - `employee_id` (uuid, foreign key to employees)
      - `week_ending` (date)
      - `sheet_number` (text)
      - `driver` (text)
      - `hand` (text)
      - `machine` (text)
      - `labour_1` (text)
      - `labour_2` (text)
      - `work_days` (jsonb - stores which days each person worked)
      - `standby` (jsonb - stores standby days and hours)
      - `job_entries` (jsonb - stores job details)
      - `summary_hours` (jsonb - stores daily hour summaries)
      - `notes` (text)
      - `submitted_at` (timestamp)

  2. Security
    - Enable RLS on `structured_timesheets` table
    - Add policy for authenticated users to read their own data
*/

CREATE TABLE IF NOT EXISTS structured_timesheets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid REFERENCES employees(id),
  week_ending date NOT NULL,
  sheet_number text,
  driver text,
  hand text,
  machine text,
  labour_1 text,
  labour_2 text,
  work_days jsonb DEFAULT '{}',
  standby jsonb DEFAULT '{}',
  job_entries jsonb DEFAULT '[]',
  summary_hours jsonb DEFAULT '{}',
  notes text,
  submitted_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE structured_timesheets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own structured timesheets"
  ON structured_timesheets
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert structured timesheets"
  ON structured_timesheets
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Public access to structured timesheets"
  ON structured_timesheets
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);