/*
  # Create checklist templates table

  1. New Tables
    - `checklist_templates`
      - `id` (uuid, primary key)
      - `name` (text, template name)
      - `items` (text[], array of checklist items)
      - `created_at` (timestamp)

  2. Security
    - Enable RLS on `checklist_templates` table
    - Add policy for authenticated users to read templates

  3. Sample Data
    - Default vehicle inspection checklist template
*/

CREATE TABLE IF NOT EXISTS checklist_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  items text[] NOT NULL DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE checklist_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated users to read checklist templates"
  ON checklist_templates
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to manage checklist templates"
  ON checklist_templates
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Insert default vehicle inspection checklist
INSERT INTO checklist_templates (name, items) VALUES (
  'Daily Vehicle Inspection',
  ARRAY[
    'Tyres (condition, pressure, tread depth)',
    'Lights (headlights, taillights, indicators)',
    'Mirrors (clean, properly adjusted)',
    'Windscreen (clean, no cracks)',
    'Wipers and washers',
    'Horn',
    'Seat belts',
    'Handbrake',
    'Footbrake',
    'Steering',
    'Engine oil level',
    'Coolant level',
    'Brake fluid level',
    'Warning lights on dashboard',
    'First aid kit present',
    'Fire extinguisher present',
    'High visibility clothing available',
    'Vehicle documents present'
  ]
);