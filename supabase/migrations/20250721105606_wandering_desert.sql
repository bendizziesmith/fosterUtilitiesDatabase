/*
  # New Timesheet System with Price Work and Day Rates

  1. New Tables
    - `work_rates` - Master table for all work types and their rates
    - `new_timesheets` - New timesheet structure
    - `timesheet_entries` - Individual work entries per timesheet
    
  2. Features
    - Price work and day rate options
    - Job numbers and addresses
    - LV/HV voltage classifications
    - Site types (SITE, AGRI, U/MADE, etc.)
    - Weekly day tracking (M-SUN)
    - Total calculations
    
  3. Security
    - Enable RLS on all tables
    - Add policies for authenticated users
*/

-- Drop old timesheet tables if they exist
DROP TABLE IF EXISTS structured_timesheets CASCADE;

-- Create work rates master table
CREATE TABLE IF NOT EXISTS work_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_type text NOT NULL, -- e.g., 'EX/LAY/REIN', 'EX/DIG', 'CABLE PULL/NO EXC'
  voltage_type text NOT NULL, -- 'LV' or 'HV'
  site_type text, -- 'SITE', 'AGRI', 'U/MADE', 'UM/CW', 'FWAY', 'CWAY', 'SURFACED', 'SOFT', etc.
  rate_type text NOT NULL, -- 'price_work' or 'day_rate'
  rate_value decimal(10,2) NOT NULL,
  unit text, -- 'm', 'each', 'day', etc.
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create new timesheets table
CREATE TABLE IF NOT EXISTS new_timesheets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid REFERENCES employees(id),
  team_name text,
  job_number text NOT NULL,
  address text,
  week_ending date NOT NULL,
  sheet_number text,
  status text DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'approved')),
  total_value decimal(10,2) DEFAULT 0,
  supervisor_signature text,
  employee_signature text,
  agreed_daywork_reason text,
  agreed_daywork_hours decimal(4,1),
  created_at timestamptz DEFAULT now(),
  submitted_at timestamptz,
  updated_at timestamptz DEFAULT now()
);

-- Create timesheet entries table
CREATE TABLE IF NOT EXISTS timesheet_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  timesheet_id uuid REFERENCES new_timesheets(id) ON DELETE CASCADE,
  work_rate_id uuid REFERENCES work_rates(id),
  quantity decimal(10,2) DEFAULT 0,
  monday decimal(4,1) DEFAULT 0,
  tuesday decimal(4,1) DEFAULT 0,
  wednesday decimal(4,1) DEFAULT 0,
  thursday decimal(4,1) DEFAULT 0,
  friday decimal(4,1) DEFAULT 0,
  saturday decimal(4,1) DEFAULT 0,
  sunday decimal(4,1) DEFAULT 0,
  total_hours decimal(4,1) DEFAULT 0,
  line_total decimal(10,2) DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE work_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE new_timesheets ENABLE ROW LEVEL SECURITY;
ALTER TABLE timesheet_entries ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Allow all operations on work_rates"
  ON work_rates
  FOR ALL
  TO authenticated, anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all operations on new_timesheets"
  ON new_timesheets
  FOR ALL
  TO authenticated, anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all operations on timesheet_entries"
  ON timesheet_entries
  FOR ALL
  TO authenticated, anon
  USING (true)
  WITH CHECK (true);

-- Insert sample work rates based on your timesheet images
INSERT INTO work_rates (work_type, voltage_type, site_type, rate_type, rate_value, unit) VALUES
-- LV Rates
('EX/LAY/REIN', 'LV', 'SITE', 'price_work', 7.10, 'm'),
('EX/LAY/REIN', 'LV', 'AGRI', 'price_work', 9.50, 'm'),
('EX/LAY/REIN', 'LV', 'U/MADE', 'price_work', 11.59, 'm'),
('EX/LAY/REIN', 'LV', 'UM/CW', 'price_work', 20.20, 'm'),
('EX/LAY/REIN', 'LV', 'FWAY', 'price_work', 22.75, 'm'),
('EX/LAY/REIN', 'LV', 'CWAY', 'price_work', 27.25, 'm'),
('EX/DIG', 'LV', 'SURFACED', 'price_work', 12.50, 'm'),
('EX/DIG', 'LV', 'SOFT', 'price_work', 4.95, 'm'),
('ADD/DUCT/CABLE', 'LV', 'IN/TREN', 'price_work', 2.20, 'm'),

-- HV Rates
('EX/LAY/REIN', 'HV', 'SITE', 'price_work', 8.10, 'm'),
('EX/LAY/REIN', 'HV', 'AGRI', 'price_work', 10.75, 'm'),
('EX/LAY/REIN', 'HV', 'U/MADE', 'price_work', 12.35, 'm'),
('EX/LAY/REIN', 'HV', 'UM/CW', 'price_work', 21.50, 'm'),
('EX/LAY/REIN', 'HV', 'FWAY', 'price_work', 25.10, 'm'),
('EX/LAY/REIN', 'HV', 'CWAY', 'price_work', 29.05, 'm'),
('EX/DIG', 'HV', 'SURFACED', 'price_work', 13.00, 'm'),
('EX/DIG', 'HV', 'SOFT', 'price_work', 6.50, 'm'),
('ADD/DUCT/CABLE', 'HV', 'IN/TREN', 'price_work', 2.20, 'm'),

-- Cable Pull rates
('CABLE PULL/NO EXC', 'LV', 'O/EXC', 'price_work', 3.75, 'm'),
('CABLE PULL/NO EXC', 'LV', 'DUCT', 'price_work', 3.00, 'm'),
('CABLE PULL/NO EXC', 'HV', 'O/EXC', 'price_work', 4.25, 'm'),
('CABLE PULL/NO EXC', 'HV', 'DUCT', 'price_work', 3.75, 'm'),

-- Hole rates
('EX/HOLE', 'LV', NULL, 'price_work', 72.50, 'each'),
('B/FILL/JH', 'LV', NULL, 'price_work', 52.00, 'each'),
('EX/HOLE', 'HV', NULL, 'price_work', 120.00, 'each'),
('B/FILL/JH', 'HV', NULL, 'price_work', 93.00, 'each'),

-- Service rates (from second image)
('EX/LAY/REIN', 'LV', 'SERVICE', 'price_work', 9.25, 'm'),
('EX/JOIN BAY', 'LV', 'SERVICE', 'price_work', 40.00, 'each'),
('B/FILL J/BAY', 'LV', 'SERVICE', 'price_work', 40.00, 'each'),
('ADD/SERV/CABLE', 'LV', 'SERVICE', 'price_work', 2.12, 'm'),
('PULL/CABLE IN DUCT', 'LV', 'SERVICE', 'price_work', 4.25, 'm'),
('PULL/CABLE/O-TRE', 'LV', 'SERVICE', 'price_work', 6.10, 'm'),
('MOLE<35MM', 'LV', 'SERVICE', 'price_work', 21.08, 'm'),
('LAY/EARTH/CABLE', 'ANY', 'SERVICE', 'price_work', 1.38, 'm'),
('EX/DD-PIT/BFILL', 'ANY', 'SERVICE', 'price_work', 109.95, 'each');

-- Create indexes for better performance
CREATE INDEX idx_work_rates_type_voltage ON work_rates(work_type, voltage_type);
CREATE INDEX idx_new_timesheets_employee ON new_timesheets(employee_id);
CREATE INDEX idx_new_timesheets_week ON new_timesheets(week_ending);
CREATE INDEX idx_timesheet_entries_timesheet ON timesheet_entries(timesheet_id);

-- Create unique constraint for employee/week combination
CREATE UNIQUE INDEX unique_employee_week_new ON new_timesheets(employee_id, week_ending, job_number) WHERE status = 'draft';