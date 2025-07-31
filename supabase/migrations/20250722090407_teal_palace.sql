/*
  # Create Ipsom Rates System

  1. New Tables
    - `ipsom_rates`
      - `id` (uuid, primary key)
      - `sheet_no` (integer) - Sheet number (1 for Service, 2 for Main)
      - `line_no` (integer) - Line number within sheet
      - `work_item` (text) - Work item code (e.g., EX/LAY/REIN)
      - `col2` (text) - Second column (voltage or modifier)
      - `col3` (text) - Third column (voltage or type)
      - `col4` (text) - Fourth column (surface/location)
      - `rate_gbp` (numeric) - Rate in GBP
      - `is_active` (boolean) - Whether rate is active
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

  2. Security
    - Enable RLS on `ipsom_rates` table
    - Add policy for public access (read/write for authenticated users)
</*/

CREATE TABLE IF NOT EXISTS ipsom_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sheet_no integer NOT NULL,
  line_no integer NOT NULL,
  work_item text NOT NULL,
  col2 text DEFAULT '',
  col3 text DEFAULT '',
  col4 text DEFAULT '',
  rate_gbp numeric(10,2) NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE ipsom_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on ipsom_rates"
  ON ipsom_rates
  FOR ALL
  TO authenticated, anon
  USING (true)
  WITH CHECK (true);

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_ipsom_rates_sheet_line ON ipsom_rates(sheet_no, line_no);
CREATE INDEX IF NOT EXISTS idx_ipsom_rates_work_item ON ipsom_rates(work_item);
CREATE INDEX IF NOT EXISTS idx_ipsom_rates_active ON ipsom_rates(is_active);

-- Insert Service Sheet data (Sheet 1)
INSERT INTO ipsom_rates (sheet_no, line_no, work_item, col2, col3, col4, rate_gbp) VALUES
(1,  1,'EX/LAY/REIN','LV','SERVICE','SITE',9.25),
(1,  2,'EX/LAY/REIN','LV','SERVICE','AGRI',10.10),
(1,  3,'EX/LAY/REIN','LV','SERVICE','U/MADE',11.62),
(1,  4,'EX/LAY/REIN','LV','SERVICE','FWAY',16.22),
(1,  5,'EX/LAY/REIN','LV','SERVICE','CWAY',26.98),
(1,  6,'EX/JOIN BAY','LV','SERVICE','ANY',40.00),
(1,  7,'B/FILL J/BAY','LV','SERVICE','AGRI',40.00),
(1,  8,'B/FILL J/BAY','LV','SERVICE','U/MADE',40.00),
(1,  9,'B/FILL J/BAY','LV','SERVICE','FWAY',67.75),
(1, 10,'B/FILL J/BAY','LV','SERVICE','CWAY',85.95),
(1, 11,'ADD/SERV/CABLE','LV','SAME/EXC','ANY',2.12),
(1, 12,'PULL/CABLE IN DUCT','LV','SERVICE','ANY',4.25),
(1, 13,'PULL/CABLE/O-TRE','LV','SERVICE','ANY',6.10),
(1, 14,'MOLE<35MM','LV','SERVICE','ANY',21.08),
(1, 15,'LAY/EARTH/CABLE','ANY','ANY','ANY',1.38),
(1, 16,'EX/DD-PIT/BFILL','ANY','ANY','UN/MADE',109.95);

-- Insert Main/LV & HV Sheet data (Sheet 2)
INSERT INTO ipsom_rates (sheet_no, line_no, work_item, col2, col3, col4, rate_gbp) VALUES
(2,  1,'EX/LAY/REIN','', 'LV','SITE',7.10),
(2,  2,'EX/LAY/REIN','', 'LV','AGRI',9.50),
(2,  3,'EX/LAY/REIN','', 'LV','U/MADE',11.59),
(2,  4,'EX/LAY/REIN','', 'LV','UM/CW',20.20),
(2,  5,'EX/LAY/REIN','', 'LV','FWAY',22.75),
(2,  6,'EX/LAY/REIN','', 'LV','CWAY',27.25),
(2,  7,'EX/DIG','FW/CW','LV','SURFACED',12.50),
(2,  8,'EX/DIG','', 'LV','SOFT',4.95),
(2,  9,'ADD/DUCT/CABLE','LV','NO/EXC','IN/TREN',2.20),
(2, 10,'EX/LAY/REIN','', 'HV','SITE',8.10),
(2, 11,'EX/LAY/REIN','', 'HV','AGRI',10.75),
(2, 12,'EX/LAY/REIN','', 'HV','U/MADE',12.35),
(2, 13,'EX/LAY/REIN','', 'HV','UM/CW',21.50),
(2, 14,'EX/LAY/REIN','', 'HV','FWAY',25.10),
(2, 15,'EX/LAY/REIN','', 'HV','CWAY',29.05),
(2, 16,'EX/DIG/S','FW/CW','HV','SURFACED',13.00),
(2, 17,'EX/DIG','', 'HV','SOFT',6.50),
(2, 18,'ADD/DUCT/CABLE','HV','NO/EXC','IN/TREN',2.20),
(2, 19,'CABLE PULL/NO EXC','LV','O/EXC','',3.75),
(2, 20,'CABLE PULL/NO EXC','LV','','DUCT',3.00),
(2, 21,'CABLE PULL/NO EXC','HV','O/EXC','',4.25),
(2, 22,'CABLE PULL/NO EXC','HV','','DUCT',3.75),
(2, 23,'EX/JHOLE','', 'LV','',72.50),
(2, 24,'B/FILL/JH','', 'LV','',52.00),
(2, 25,'EX/JHOLE','', 'HV','',120.00),
(2, 26,'B/FILL/JH','', 'HV','',93.00);