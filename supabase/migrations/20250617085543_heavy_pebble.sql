/*
  # Vehicle Inspection Management System Schema

  1. New Tables
    - `vehicles`
      - `id` (uuid, primary key)
      - `registration_number` (text, unique)
      - `make` (text)
      - `model` (text)
      - `year` (integer)
      - `created_at` (timestamp)

    - `checklist_templates`
      - `id` (uuid, primary key)
      - `name` (text)
      - `items` (jsonb array)
      - `created_at` (timestamp)

    - `vehicle_inspections`
      - `id` (uuid, primary key)
      - `vehicle_id` (uuid, foreign key)
      - `submitted_at` (timestamp)
      - `has_defects` (boolean)

    - `inspection_items`
      - `id` (uuid, primary key)
      - `inspection_id` (uuid, foreign key)
      - `item_name` (text)
      - `status` (text, check constraint)
      - `comments` (text)
      - `photo_url` (text)

  2. Security
    - Enable RLS on all tables
    - Add policies for public access (no auth required initially)

  3. Storage
    - Create inspection-photos bucket
    - Enable public access for uploaded images
*/

-- Create vehicles table
CREATE TABLE IF NOT EXISTS vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_number text UNIQUE NOT NULL,
  make text NOT NULL,
  model text NOT NULL,
  year int NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Create checklist templates table
CREATE TABLE IF NOT EXISTS checklist_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  items jsonb NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Create vehicle inspections table
CREATE TABLE IF NOT EXISTS vehicle_inspections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid REFERENCES vehicles(id) NOT NULL,
  submitted_at timestamptz DEFAULT now(),
  has_defects boolean NOT NULL DEFAULT false
);

-- Create inspection items table
CREATE TABLE IF NOT EXISTS inspection_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id uuid REFERENCES vehicle_inspections(id) ON DELETE CASCADE NOT NULL,
  item_name text NOT NULL,
  status text CHECK (status IN ('no_defect', 'defect')) NOT NULL,
  comments text,
  photo_url text
);

-- Enable Row Level Security
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE checklist_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE inspection_items ENABLE ROW LEVEL SECURITY;

-- Create policies for public access (no authentication required)
CREATE POLICY "Public access to vehicles"
  ON vehicles
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Public access to checklist templates"
  ON checklist_templates
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Public access to vehicle inspections"
  ON vehicle_inspections
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Public access to inspection items"
  ON inspection_items
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- Insert sample vehicles
INSERT INTO vehicles (registration_number, make, model, year) VALUES
  ('ABC123', 'Ford', 'Transit', 2022),
  ('DEF456', 'Mercedes', 'Sprinter', 2021),
  ('GHI789', 'Volkswagen', 'Crafter', 2023),
  ('JKL012', 'Iveco', 'Daily', 2020),
  ('MNO345', 'Renault', 'Master', 2022)
ON CONFLICT (registration_number) DO NOTHING;

-- Insert sample checklist template
INSERT INTO checklist_templates (name, items) VALUES
  ('Standard Vehicle Inspection', '[
    "Lights (headlights, brake lights, indicators)",
    "Tyres (tread depth, condition, pressure)",
    "Brakes (operation, fluid levels)",
    "Steering (responsiveness, alignment)",
    "Engine (oil level, coolant, battery)",
    "Body (damage, rust, paintwork)",
    "Interior (seats, mirrors, instruments)",
    "Documentation (insurance, MOT, tax)"
  ]'::jsonb)
ON CONFLICT DO NOTHING;

-- Create storage bucket for inspection photos
INSERT INTO storage.buckets (id, name, public) 
VALUES ('inspection-photos', 'inspection-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Create storage policy for public access
CREATE POLICY "Public upload access"
ON storage.objects FOR ALL
TO anon, authenticated
USING (bucket_id = 'inspection-photos')
WITH CHECK (bucket_id = 'inspection-photos');