/*
  # Create mollsworth_work_rates table

  1. New Tables
    - `mollsworth_work_rates`
      - `id` (uuid, primary key)
      - `col1_work_item` (text)
      - `col2_param` (text)
      - `col3_param` (text)
      - `col4_param` (text)
      - `rate_gbp` (numeric)
      - `is_active` (boolean)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

  2. Security
    - Enable RLS on mollsworth_work_rates table
    - Add policy for authenticated users to manage rates
*/

-- Create mollsworth_work_rates table
CREATE TABLE IF NOT EXISTS mollsworth_work_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  col1_work_item text NOT NULL,
  col2_param text DEFAULT '',
  col3_param text DEFAULT '',
  col4_param text DEFAULT '',
  rate_gbp numeric(10,2) NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE mollsworth_work_rates ENABLE ROW LEVEL SECURITY;

-- Create policy
CREATE POLICY "Allow authenticated users to manage mollsworth work rates"
  ON mollsworth_work_rates
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_mollsworth_work_rates_work_item ON mollsworth_work_rates(col1_work_item);
CREATE INDEX IF NOT EXISTS idx_mollsworth_work_rates_is_active ON mollsworth_work_rates(is_active);

-- Add some sample data
INSERT INTO mollsworth_work_rates (col1_work_item, col2_param, col3_param, col4_param, rate_gbp) VALUES
('EXCAVATION', 'SHALLOW', 'URBAN', 'STANDARD', 25.00),
('EXCAVATION', 'DEEP', 'URBAN', 'STANDARD', 35.00),
('LAYING', 'CABLE', 'RURAL', 'STANDARD', 20.00),
('REINSTATEMENT', 'TARMAC', 'URBAN', 'PREMIUM', 30.00)
ON CONFLICT DO NOTHING;