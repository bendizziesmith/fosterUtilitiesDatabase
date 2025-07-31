/*
  # Create vehicle inspections table

  1. New Tables
    - `vehicle_inspections`
      - `id` (uuid, primary key)
      - `vehicle_id` (uuid, foreign key to vehicles)
      - `employee_id` (uuid, foreign key to employees)
      - `submitted_at` (timestamp)
      - `has_defects` (boolean)
      - `override_vehicle_registration` (text, optional)
    - `inspection_items`
      - `id` (uuid, primary key)
      - `inspection_id` (uuid, foreign key to vehicle_inspections)
      - `item_name` (text)
      - `status` (text)
      - `notes` (text, optional)

  2. Security
    - Enable RLS on both tables
    - Add policies for authenticated users to manage inspection data

  3. Indexes
    - Add indexes for common query patterns
*/

-- Create vehicle_inspections table
CREATE TABLE IF NOT EXISTS vehicle_inspections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid REFERENCES vehicles(id) ON DELETE CASCADE,
  employee_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  submitted_at timestamptz DEFAULT now(),
  has_defects boolean DEFAULT false,
  override_vehicle_registration text,
  created_at timestamptz DEFAULT now()
);

-- Create inspection_items table
CREATE TABLE IF NOT EXISTS inspection_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id uuid REFERENCES vehicle_inspections(id) ON DELETE CASCADE,
  item_name text NOT NULL,
  status text NOT NULL DEFAULT 'ok',
  notes text,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE vehicle_inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE inspection_items ENABLE ROW LEVEL SECURITY;

-- Add RLS policies
CREATE POLICY "Allow authenticated users to manage vehicle inspections"
  ON vehicle_inspections
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to manage inspection items"
  ON inspection_items
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_vehicle_inspections_vehicle_id ON vehicle_inspections(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_inspections_employee_id ON vehicle_inspections(employee_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_inspections_submitted_at ON vehicle_inspections(submitted_at);
CREATE INDEX IF NOT EXISTS idx_inspection_items_inspection_id ON inspection_items(inspection_id);