/*
  # Create HAVS Week Tables
  
  Creates the gang-based HAVS tracking system tables:
  
  1. New Tables
    - `havs_weeks` - Tracks weekly HAVS periods for gangers
      - `id` (uuid, primary key)
      - `ganger_id` (uuid, references employees)
      - `week_ending` (date) - Sunday of the week
      - `status` (text) - draft or submitted
      - `created_by` (uuid) - auth user who created it
      - timestamps
    
    - `havs_week_members` - People in a HAVS week
      - `id` (uuid, primary key)
      - `havs_week_id` (uuid, references havs_weeks)
      - `person_type` (text) - ganger or operative
      - `employee_id` (uuid, nullable, references employees)
      - `manual_name` (text, nullable) - for manual entries
      - `role` (text)
      - timestamps
    
    - `havs_exposure_entries` - Daily equipment exposure
      - `id` (uuid, primary key)
      - `havs_week_member_id` (uuid, references havs_week_members)
      - `equipment_name` (text)
      - `equipment_category` (text)
      - `day_of_week` (text)
      - `minutes` (integer)
      - timestamps

  2. Security
    - RLS enabled on all tables
    - Policies for authenticated users
*/

-- Create havs_weeks table
CREATE TABLE IF NOT EXISTS havs_weeks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ganger_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  week_ending date NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted')),
  submitted_at timestamptz,
  last_saved_at timestamptz,
  revision_number integer DEFAULT 0,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(ganger_id, week_ending)
);

-- Create havs_week_members table
CREATE TABLE IF NOT EXISTS havs_week_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  havs_week_id uuid NOT NULL REFERENCES havs_weeks(id) ON DELETE CASCADE,
  person_type text NOT NULL DEFAULT 'operative' CHECK (person_type IN ('ganger', 'operative')),
  employee_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  manual_name text,
  role text NOT NULL DEFAULT 'Operative',
  comments text,
  actions text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create havs_exposure_entries table
CREATE TABLE IF NOT EXISTS havs_exposure_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  havs_week_member_id uuid NOT NULL REFERENCES havs_week_members(id) ON DELETE CASCADE,
  equipment_name text NOT NULL,
  equipment_category text NOT NULL CHECK (equipment_category IN ('CIVILS', 'JOINTING', 'OVERHEADS', 'EARTH PIN DRIVER')),
  day_of_week text NOT NULL CHECK (day_of_week IN ('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday')),
  minutes integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE havs_weeks ENABLE ROW LEVEL SECURITY;
ALTER TABLE havs_week_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE havs_exposure_entries ENABLE ROW LEVEL SECURITY;

-- RLS Policies for havs_weeks
CREATE POLICY "Gangers can view their own weeks"
ON havs_weeks FOR SELECT
TO authenticated
USING (
  ganger_id IN (
    SELECT employee_id FROM user_profiles WHERE id = auth.uid()
  )
  OR
  EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin')
);

CREATE POLICY "Gangers can create their own weeks"
ON havs_weeks FOR INSERT
TO authenticated
WITH CHECK (
  ganger_id IN (
    SELECT employee_id FROM user_profiles WHERE id = auth.uid()
  )
);

CREATE POLICY "Gangers can update their own weeks"
ON havs_weeks FOR UPDATE
TO authenticated
USING (
  ganger_id IN (
    SELECT employee_id FROM user_profiles WHERE id = auth.uid()
  )
)
WITH CHECK (
  ganger_id IN (
    SELECT employee_id FROM user_profiles WHERE id = auth.uid()
  )
);

-- RLS Policies for havs_week_members
CREATE POLICY "Users can view members of their weeks"
ON havs_week_members FOR SELECT
TO authenticated
USING (
  havs_week_id IN (
    SELECT id FROM havs_weeks WHERE ganger_id IN (
      SELECT employee_id FROM user_profiles WHERE id = auth.uid()
    )
  )
  OR
  EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin')
);

CREATE POLICY "Users can insert members to their weeks"
ON havs_week_members FOR INSERT
TO authenticated
WITH CHECK (
  havs_week_id IN (
    SELECT id FROM havs_weeks WHERE ganger_id IN (
      SELECT employee_id FROM user_profiles WHERE id = auth.uid()
    )
  )
);

CREATE POLICY "Users can update members of their weeks"
ON havs_week_members FOR UPDATE
TO authenticated
USING (
  havs_week_id IN (
    SELECT id FROM havs_weeks WHERE ganger_id IN (
      SELECT employee_id FROM user_profiles WHERE id = auth.uid()
    )
  )
)
WITH CHECK (
  havs_week_id IN (
    SELECT id FROM havs_weeks WHERE ganger_id IN (
      SELECT employee_id FROM user_profiles WHERE id = auth.uid()
    )
  )
);

CREATE POLICY "Users can delete members from their weeks"
ON havs_week_members FOR DELETE
TO authenticated
USING (
  havs_week_id IN (
    SELECT id FROM havs_weeks WHERE ganger_id IN (
      SELECT employee_id FROM user_profiles WHERE id = auth.uid()
    )
  )
);

-- RLS Policies for havs_exposure_entries
CREATE POLICY "Users can view exposure entries"
ON havs_exposure_entries FOR SELECT
TO authenticated
USING (
  havs_week_member_id IN (
    SELECT hwm.id FROM havs_week_members hwm
    JOIN havs_weeks hw ON hw.id = hwm.havs_week_id
    WHERE hw.ganger_id IN (
      SELECT employee_id FROM user_profiles WHERE id = auth.uid()
    )
  )
  OR
  EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin')
);

CREATE POLICY "Users can insert exposure entries"
ON havs_exposure_entries FOR INSERT
TO authenticated
WITH CHECK (
  havs_week_member_id IN (
    SELECT hwm.id FROM havs_week_members hwm
    JOIN havs_weeks hw ON hw.id = hwm.havs_week_id
    WHERE hw.ganger_id IN (
      SELECT employee_id FROM user_profiles WHERE id = auth.uid()
    )
  )
);

CREATE POLICY "Users can update exposure entries"
ON havs_exposure_entries FOR UPDATE
TO authenticated
USING (
  havs_week_member_id IN (
    SELECT hwm.id FROM havs_week_members hwm
    JOIN havs_weeks hw ON hw.id = hwm.havs_week_id
    WHERE hw.ganger_id IN (
      SELECT employee_id FROM user_profiles WHERE id = auth.uid()
    )
  )
)
WITH CHECK (
  havs_week_member_id IN (
    SELECT hwm.id FROM havs_week_members hwm
    JOIN havs_weeks hw ON hw.id = hwm.havs_week_id
    WHERE hw.ganger_id IN (
      SELECT employee_id FROM user_profiles WHERE id = auth.uid()
    )
  )
);

CREATE POLICY "Users can delete exposure entries"
ON havs_exposure_entries FOR DELETE
TO authenticated
USING (
  havs_week_member_id IN (
    SELECT hwm.id FROM havs_week_members hwm
    JOIN havs_weeks hw ON hw.id = hwm.havs_week_id
    WHERE hw.ganger_id IN (
      SELECT employee_id FROM user_profiles WHERE id = auth.uid()
    )
  )
);

-- Service role full access for edge functions
CREATE POLICY "Service role full access weeks"
ON havs_weeks FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Service role full access members"
ON havs_week_members FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Service role full access entries"
ON havs_exposure_entries FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_havs_weeks_ganger_id ON havs_weeks(ganger_id);
CREATE INDEX IF NOT EXISTS idx_havs_weeks_week_ending ON havs_weeks(week_ending);
CREATE INDEX IF NOT EXISTS idx_havs_week_members_week_id ON havs_week_members(havs_week_id);
CREATE INDEX IF NOT EXISTS idx_havs_exposure_entries_member_id ON havs_exposure_entries(havs_week_member_id);
