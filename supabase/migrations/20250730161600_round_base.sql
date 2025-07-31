/*
  # Create ipsom_rates table

  1. New Tables
    - `ipsom_rates`
      - `id` (uuid, primary key)
      - `sheet_no` (integer)
      - `line_no` (integer)
      - `work_item` (text)
      - `col2` (text)
      - `col3` (text)
      - `col4` (text)
      - `rate_gbp` (numeric)
      - `is_active` (boolean)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

  2. Security
    - Enable RLS on ipsom_rates table
    - Add policy for authenticated users to manage rates
*/

-- Create ipsom_rates table
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

-- Enable RLS
ALTER TABLE ipsom_rates ENABLE ROW LEVEL SECURITY;

-- Create policy
CREATE POLICY "Allow authenticated users to manage ipsom rates"
  ON ipsom_rates
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_ipsom_rates_sheet_no ON ipsom_rates(sheet_no);
CREATE INDEX IF NOT EXISTS idx_ipsom_rates_line_no ON ipsom_rates(line_no);
CREATE INDEX IF NOT EXISTS idx_ipsom_rates_is_active ON ipsom_rates(is_active);

-- Add some sample data
INSERT INTO ipsom_rates (sheet_no, line_no, work_item, col2, col3, col4, rate_gbp) VALUES
(1, 1, 'EX/LAY/REIN', 'LV', 'SERVICE', 'SITE', 12.50),
(1, 2, 'EX/LAY/REIN', 'HV', 'SERVICE', 'SITE', 15.75),
(2, 1, 'MAIN/LV', 'LV', 'MAIN', 'AGRI', 18.25),
(2, 2, 'MAIN/HV', 'HV', 'MAIN', 'AGRI', 22.50)
ON CONFLICT DO NOTHING;