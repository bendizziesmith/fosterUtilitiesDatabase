/*
  # Create new_timesheets table and related tables

  1. New Tables
    - `new_timesheets`
      - `id` (uuid, primary key)
      - `employee_id` (uuid, foreign key to employees)
      - `team_name` (text)
      - `job_number` (text)
      - `address` (text)
      - `week_ending` (date)
      - `sheet_number` (text)
      - `status` (text)
      - `total_value` (numeric)
      - `supervisor_signature` (text)
      - `employee_signature` (text)
      - `agreed_daywork_reason` (text)
      - `agreed_daywork_hours` (numeric)
      - `created_at` (timestamp)
      - `submitted_at` (timestamp)
      - `updated_at` (timestamp)
    - `timesheet_entries`
      - `id` (uuid, primary key)
      - `timesheet_id` (uuid, foreign key to new_timesheets)
      - `ipsom_rate_id` (uuid, foreign key to ipsom_rates)
      - `mollsworth_rate_id` (uuid, foreign key to mollsworth_work_rates)
      - `work_rate_id` (uuid, foreign key to work_rates)
      - Daily hour columns (monday through sunday)
      - `total_hours` (numeric)
      - `quantity` (numeric)
      - `line_total` (numeric)
      - `created_at` (timestamp)
    - `work_rates`
      - `id` (uuid, primary key)
      - `work_type` (text)
      - `voltage_type` (text)
      - `site_type` (text)
      - `rate_type` (text)
      - `rate_value` (numeric)
      - `unit` (text)
      - `is_active` (boolean)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

  2. Security
    - Enable RLS on all tables
    - Add policies for authenticated users to manage data
*/

-- Create work_rates table
CREATE TABLE IF NOT EXISTS work_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_type text NOT NULL,
  voltage_type text CHECK (voltage_type IN ('LV', 'HV', 'ANY')),
  site_type text,
  rate_type text CHECK (rate_type IN ('price_work', 'day_rate')),
  rate_value numeric(10,2) NOT NULL,
  unit text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create new_timesheets table
CREATE TABLE IF NOT EXISTS new_timesheets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  team_name text,
  job_number text NOT NULL,
  address text,
  week_ending date NOT NULL,
  sheet_number text,
  status text CHECK (status IN ('draft', 'submitted', 'approved')) DEFAULT 'draft',
  total_value numeric(10,2) DEFAULT 0,
  supervisor_signature text,
  employee_signature text,
  agreed_daywork_reason text,
  agreed_daywork_hours numeric(5,2),
  created_at timestamptz DEFAULT now(),
  submitted_at timestamptz,
  updated_at timestamptz DEFAULT now()
);

-- Create timesheet_entries table
CREATE TABLE IF NOT EXISTS timesheet_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  timesheet_id uuid REFERENCES new_timesheets(id) ON DELETE CASCADE,
  ipsom_rate_id uuid,
  mollsworth_rate_id uuid,
  work_rate_id uuid REFERENCES work_rates(id) ON DELETE SET NULL,
  work_item text,
  col2 text,
  col3 text,
  col4 text,
  quantity numeric(10,2),
  rate_gbp numeric(10,2),
  monday numeric(5,2) DEFAULT 0,
  tuesday numeric(5,2) DEFAULT 0,
  wednesday numeric(5,2) DEFAULT 0,
  thursday numeric(5,2) DEFAULT 0,
  friday numeric(5,2) DEFAULT 0,
  saturday numeric(5,2) DEFAULT 0,
  sunday numeric(5,2) DEFAULT 0,
  total_hours numeric(5,2) DEFAULT 0,
  line_total numeric(10,2) DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE work_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE new_timesheets ENABLE ROW LEVEL SECURITY;
ALTER TABLE timesheet_entries ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Allow authenticated users to manage work rates"
  ON work_rates
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to manage timesheets"
  ON new_timesheets
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to manage timesheet entries"
  ON timesheet_entries
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_new_timesheets_employee_id ON new_timesheets(employee_id);
CREATE INDEX IF NOT EXISTS idx_new_timesheets_week_ending ON new_timesheets(week_ending);
CREATE INDEX IF NOT EXISTS idx_new_timesheets_status ON new_timesheets(status);
CREATE INDEX IF NOT EXISTS idx_timesheet_entries_timesheet_id ON timesheet_entries(timesheet_id);
CREATE INDEX IF NOT EXISTS idx_work_rates_work_type ON work_rates(work_type);
CREATE INDEX IF NOT EXISTS idx_work_rates_is_active ON work_rates(is_active);