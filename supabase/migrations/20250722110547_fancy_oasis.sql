/*
  # Create Mollsworth Rates Management System

  1. New Tables
    - `mollsworth_work_rates`
      - `id` (uuid, primary key)
      - `col1_work_item` (text) - Work item description
      - `col2_param` (text) - Voltage parameter (11KV, 33KV)
      - `col3_param` (text) - Excavation parameter (NO/EXC, O/EXC, DUCT, -)
      - `col4_param` (text) - Site/surface parameter (SITE, AGRI, etc.)
      - `rate_gbp` (numeric) - Rate in GBP
      - `is_active` (boolean) - Active status
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

  2. Security
    - Enable RLS on `mollsworth_work_rates` table
    - Add policy for public access (matching ipsom_rates pattern)

  3. Sample Data
    - Insert all the Mollsworth rates provided
*/

CREATE TABLE IF NOT EXISTS mollsworth_work_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  col1_work_item text NOT NULL,
  col2_param text DEFAULT '',
  col3_param text DEFAULT '',
  col4_param text DEFAULT '',
  rate_gbp numeric(10,2),
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE mollsworth_work_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on mollsworth_work_rates"
  ON mollsworth_work_rates
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_mollsworth_rates_active ON mollsworth_work_rates (is_active);
CREATE INDEX IF NOT EXISTS idx_mollsworth_rates_work_item ON mollsworth_work_rates (col1_work_item);
CREATE INDEX IF NOT EXISTS idx_mollsworth_rates_voltage ON mollsworth_work_rates (col2_param);

-- Insert the Mollsworth rates data
INSERT INTO mollsworth_work_rates (col1_work_item, col2_param, col3_param, col4_param, rate_gbp) VALUES
('EX/LAY/REIN', '11KV', '-', 'SITE', 8.65),
('EX/LAY/REIN', '11KV', '-', 'AGRI', 8.70),
('EX/LAY/REIN', '11KV', '-', 'U/MADE', 10.10),
('EX/LAY/REIN', '11KV', '-', 'UM/CW', 18.23),
('EX/LAY/REIN', '11KV', '-', 'FWAY', 24.10),
('EX/LAY/REIN', '11KV', '-', 'CWAY', 26.50),
('EX/DIG (FW/CW)', '11KV', '-', 'SURFACED', 6.69),
('EX/DIG', '11KV', '-', 'SOFT', 4.15),
('ADD/DUCT/CABLE', '11KV', 'NO/EXC', 'IN/TREN', 1.85),
('EX/LAY/REIN', '33KV', '-', 'SITE', 9.95),
('EX/LAY/REIN', '33KV', '-', 'AGRI', 10.25),
('EX/LAY/REIN', '33KV', '-', 'U/MADE', 11.25),
('EX/LAY/REIN', '33KV', '-', 'UM/CW', 22.90),
('EX/LAY/REIN', '33KV', '-', 'FWAY', 28.75),
('EX/LAY/REIN', '33KV', '-', 'CWAY', 32.70),
('EX/DIG/S (FW/CW)', '33KV', '-', 'SURFACED', 7.89),
('EX/DIG', '33KV', '-', 'SOFT', 4.75),
('ADD/DUCT/CABLE', '33KV', 'NO/EXC', 'IN/TREN', 1.95),
('CABLE PULL/NO EXC', '11KV', 'O/EXC', '-', NULL),
('CABLE PULL/NO EXC', '11KV', 'DUCT', '-', NULL),
('CABLE PULL/NO EXC', '33KV', 'O/EXC', '-', NULL),
('CABLE PULL/NO EXC', '33KV', 'DUCT', '-', NULL),
('EX/JHOLE', '11KV', '-', '-', 350.00),
('B/FILL/JH', '11KV', '-', '-', 150.00),
('EX/JHOLE', '33KV', '-', '-', 210.00),
('B/FILL/JH', '33KV', '-', '-', 150.00);