/*
  # Create Mollsworth Work Rates Table

  1. New Tables
    - `mollsworth_work_rates`
      - `id` (uuid, primary key)
      - `col1_work_item` (text, work item description)
      - `col2_param` (text, voltage parameter - 11KV/33KV)
      - `col3_param` (text, excavation parameter)
      - `col4_param` (text, site/surface parameter)
      - `rate_gbp` (numeric, rate in GBP)
      - `is_active` (boolean, default true)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

  2. Security
    - Enable RLS on `mollsworth_work_rates` table
    - Add policy for public access to all operations

  3. Data
    - Insert all Mollsworth work rates data
*/

-- Drop table if exists
DROP TABLE IF EXISTS mollsworth_work_rates;

-- Create mollsworth_work_rates table
CREATE TABLE mollsworth_work_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  col1_work_item text NOT NULL,
  col2_param text NOT NULL DEFAULT '',
  col3_param text NOT NULL DEFAULT '',
  col4_param text NOT NULL DEFAULT '',
  rate_gbp numeric(10,2),
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE mollsworth_work_rates ENABLE ROW LEVEL SECURITY;

-- Create policy for public access
CREATE POLICY "Allow all operations on mollsworth_work_rates"
  ON mollsworth_work_rates
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- Create indexes for performance
CREATE INDEX idx_mollsworth_work_rates_active ON mollsworth_work_rates(is_active);
CREATE INDEX idx_mollsworth_work_rates_work_item ON mollsworth_work_rates(col1_work_item);
CREATE INDEX idx_mollsworth_work_rates_voltage ON mollsworth_work_rates(col2_param);

-- Insert Mollsworth work rates data
INSERT INTO mollsworth_work_rates (col1_work_item, col2_param, col3_param, col4_param, rate_gbp) VALUES
('EX/LAY/REIN', '11KV', '-', '-', 4.50),
('EX/LAY/REIN', '11KV', '-', 'SITE', 5.40),
('EX/LAY/REIN', '11KV', '-', 'AGRI', 4.95),
('EX/LAY/REIN', '11KV', '-', 'U/MADE', 6.75),
('EX/LAY/REIN', '11KV', '-', 'UM/CW', 8.10),
('EX/LAY/REIN', '11KV', '-', 'FWAY', 9.45),
('EX/LAY/REIN', '11KV', '-', 'CWAY', 10.80),
('EX/LAY/REIN', '33KV', '-', '-', 5.85),
('EX/LAY/REIN', '33KV', '-', 'SITE', 7.02),
('EX/LAY/REIN', '33KV', '-', 'AGRI', 6.44),
('EX/LAY/REIN', '33KV', '-', 'U/MADE', 8.78),
('EX/LAY/REIN', '33KV', '-', 'UM/CW', 10.53),
('EX/LAY/REIN', '33KV', '-', 'FWAY', 12.29),
('EX/LAY/REIN', '33KV', '-', 'CWAY', 14.04),
('EX/DIG (FW/CW)', '11KV', '-', 'SURFACED', 13.50),
('EX/DIG (FW/CW)', '11KV', '-', 'SOFT', 9.45),
('EX/DIG (FW/CW)', '33KV', '-', 'SURFACED', 17.55),
('EX/DIG (FW/CW)', '33KV', '-', 'SOFT', 12.29),
('EX/DIG', '11KV', '-', '-', 4.50),
('EX/DIG', '11KV', '-', 'SITE', 5.40),
('EX/DIG', '11KV', '-', 'AGRI', 4.95),
('EX/DIG', '11KV', '-', 'U/MADE', 6.75),
('EX/DIG', '11KV', '-', 'UM/CW', 8.10),
('EX/DIG', '11KV', '-', 'FWAY', 9.45),
('EX/DIG', '11KV', '-', 'CWAY', 10.80),
('EX/DIG', '33KV', '-', '-', 5.85),
('EX/DIG', '33KV', '-', 'SITE', 7.02),
('EX/DIG', '33KV', '-', 'AGRI', 6.44),
('EX/DIG', '33KV', '-', 'U/MADE', 8.78),
('EX/DIG', '33KV', '-', 'UM/CW', 10.53),
('EX/DIG', '33KV', '-', 'FWAY', 12.29),
('EX/DIG', '33KV', '-', 'CWAY', 14.04),
('EX/DIG/S (FW/CW)', '11KV', '-', 'SURFACED', 13.50),
('EX/DIG/S (FW/CW)', '11KV', '-', 'SOFT', 9.45),
('EX/DIG/S (FW/CW)', '33KV', '-', 'SURFACED', 17.55),
('EX/DIG/S (FW/CW)', '33KV', '-', 'SOFT', 12.29),
('ADD/DUCT/CABLE', '11KV', 'NO/EXC', '-', 2.25),
('ADD/DUCT/CABLE', '11KV', 'NO/EXC', 'SITE', 2.70),
('ADD/DUCT/CABLE', '11KV', 'NO/EXC', 'AGRI', 2.48),
('ADD/DUCT/CABLE', '11KV', 'NO/EXC', 'U/MADE', 3.38),
('ADD/DUCT/CABLE', '11KV', 'NO/EXC', 'UM/CW', 4.05),
('ADD/DUCT/CABLE', '11KV', 'NO/EXC', 'FWAY', 4.73),
('ADD/DUCT/CABLE', '11KV', 'NO/EXC', 'CWAY', 5.40),
('ADD/DUCT/CABLE', '11KV', 'O/EXC', 'IN/TREN', 1.35),
('ADD/DUCT/CABLE', '33KV', 'NO/EXC', '-', 2.93),
('ADD/DUCT/CABLE', '33KV', 'NO/EXC', 'SITE', 3.51),
('ADD/DUCT/CABLE', '33KV', 'NO/EXC', 'AGRI', 3.22),
('ADD/DUCT/CABLE', '33KV', 'NO/EXC', 'U/MADE', 4.39),
('ADD/DUCT/CABLE', '33KV', 'NO/EXC', 'UM/CW', 5.27),
('ADD/DUCT/CABLE', '33KV', 'NO/EXC', 'FWAY', 6.15),
('ADD/DUCT/CABLE', '33KV', 'NO/EXC', 'CWAY', 7.02),
('ADD/DUCT/CABLE', '33KV', 'O/EXC', 'IN/TREN', 1.76),
('CABLE PULL/NO EXC', '11KV', 'NO/EXC', 'SERVICE', 1.35),
('CABLE PULL/NO EXC', '11KV', 'NO/EXC', 'DUCT', 0.90),
('CABLE PULL/NO EXC', '33KV', 'NO/EXC', 'SERVICE', 1.76),
('CABLE PULL/NO EXC', '33KV', 'NO/EXC', 'DUCT', 1.17),
('EX/JHOLE', '11KV', '-', '-', 67.50),
('EX/JHOLE', '11KV', '-', 'SITE', 81.00),
('EX/JHOLE', '11KV', '-', 'AGRI', 74.25),
('EX/JHOLE', '11KV', '-', 'U/MADE', 101.25),
('EX/JHOLE', '11KV', '-', 'UM/CW', 121.50),
('EX/JHOLE', '11KV', '-', 'FWAY', 141.75),
('EX/JHOLE', '11KV', '-', 'CWAY', 162.00),
('EX/JHOLE', '33KV', '-', '-', 87.75),
('EX/JHOLE', '33KV', '-', 'SITE', 105.30),
('EX/JHOLE', '33KV', '-', 'AGRI', 96.53),
('EX/JHOLE', '33KV', '-', 'U/MADE', 131.63),
('EX/JHOLE', '33KV', '-', 'UM/CW', 157.95),
('EX/JHOLE', '33KV', '-', 'FWAY', 184.28),
('EX/JHOLE', '33KV', '-', 'CWAY', 210.60),
('B/FILL/JH', '11KV', '-', '-', 31.50),
('B/FILL/JH', '11KV', '-', 'SITE', 37.80),
('B/FILL/JH', '11KV', '-', 'AGRI', 34.65),
('B/FILL/JH', '11KV', '-', 'U/MADE', 47.25),
('B/FILL/JH', '11KV', '-', 'UM/CW', 56.70),
('B/FILL/JH', '11KV', '-', 'FWAY', 66.15),
('B/FILL/JH', '11KV', '-', 'CWAY', 75.60),
('B/FILL/JH', '33KV', '-', '-', 40.95),
('B/FILL/JH', '33KV', '-', 'SITE', 49.14),
('B/FILL/JH', '33KV', '-', 'AGRI', 45.05),
('B/FILL/JH', '33KV', '-', 'U/MADE', 61.43),
('B/FILL/JH', '33KV', '-', 'UM/CW', 73.71),
('B/FILL/JH', '33KV', '-', 'FWAY', 86.00),
('B/FILL/JH', '33KV', '-', 'CWAY', 98.28);