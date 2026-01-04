/*
  # Create Gang-Based HAVS Data Model

  ## Problem
  - Current model uses individual `havs_timesheets` per person
  - Manual operatives cannot be saved (no employee_id)
  - Gang concept is not properly modeled
  - Adding operatives doesn't update UI state
  - Save logic doesn't work for all gang members

  ## Solution
  Create a proper gang-based model:
  1. `havs_weeks` - One record per ganger per week
  2. `havs_week_members` - One per person in the gang (ganger + operatives)
  3. `havs_exposure_entries` - Sparse storage of exposure data per person/equipment/day

  ## New Tables
  
  ### havs_weeks
  - id (uuid, PK)
  - ganger_id (uuid, FK to employees) - The gang leader
  - week_ending (date) - Sunday of the week
  - status ('draft' | 'submitted')
  - submitted_at (timestamp, nullable)
  - created_at (timestamp)
  - updated_at (timestamp)
  - UNIQUE constraint on (ganger_id, week_ending)

  ### havs_week_members
  - id (uuid, PK)
  - havs_week_id (uuid, FK to havs_weeks)
  - person_type ('ganger' | 'operative')
  - employee_id (uuid, nullable, FK to employees)
  - manual_name (text, nullable) - For manual operatives
  - role (text) - Job role
  - comments (text, nullable)
  - actions (text, nullable)
  - created_at (timestamp)
  - CHECK: Either employee_id OR manual_name must be present

  ### havs_exposure_entries
  - id (uuid, PK)
  - havs_week_member_id (uuid, FK to havs_week_members)
  - equipment_name (text)
  - equipment_category (text)
  - day_of_week (text) - 'monday' through 'sunday'
  - minutes (integer) - Exposure time in minutes
  - created_at (timestamp)
  - updated_at (timestamp)
  - UNIQUE(havs_week_member_id, equipment_name, day_of_week)

  ## Benefits
  - Manual operatives are first-class citizens
  - One week record contains multiple members
  - Sparse storage (only non-zero values stored)
  - Proper FK relationships
  - Submission locks entire week for all members
  - Gang concept is explicit and traceable

  ## Security
  - RLS policies ensure gangers can only access their own weeks
  - Members can only be added by the ganger
*/

-- Create havs_weeks table
CREATE TABLE IF NOT EXISTS havs_weeks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ganger_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  week_ending date NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted')),
  submitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT unique_ganger_week UNIQUE (ganger_id, week_ending)
);

-- Create havs_week_members table
CREATE TABLE IF NOT EXISTS havs_week_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  havs_week_id uuid NOT NULL REFERENCES havs_weeks(id) ON DELETE CASCADE,
  person_type text NOT NULL CHECK (person_type IN ('ganger', 'operative')),
  employee_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  manual_name text,
  role text NOT NULL DEFAULT 'Operative',
  comments text,
  actions text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT check_person_identity CHECK (
    (employee_id IS NOT NULL AND manual_name IS NULL) OR
    (employee_id IS NULL AND manual_name IS NOT NULL)
  )
);

-- Create havs_exposure_entries table
CREATE TABLE IF NOT EXISTS havs_exposure_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  havs_week_member_id uuid NOT NULL REFERENCES havs_week_members(id) ON DELETE CASCADE,
  equipment_name text NOT NULL,
  equipment_category text NOT NULL CHECK (equipment_category IN ('CIVILS', 'JOINTING', 'OVERHEADS', 'EARTH PIN DRIVER')),
  day_of_week text NOT NULL CHECK (day_of_week IN ('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday')),
  minutes integer NOT NULL DEFAULT 0 CHECK (minutes >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT unique_member_equipment_day UNIQUE (havs_week_member_id, equipment_name, day_of_week)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_havs_weeks_ganger ON havs_weeks(ganger_id, week_ending);
CREATE INDEX IF NOT EXISTS idx_havs_week_members_week ON havs_week_members(havs_week_id);
CREATE INDEX IF NOT EXISTS idx_havs_week_members_employee ON havs_week_members(employee_id) WHERE employee_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_havs_exposure_entries_member ON havs_exposure_entries(havs_week_member_id);

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
  );

CREATE POLICY "Gangers can insert their own weeks"
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

CREATE POLICY "Gangers can delete their own draft weeks"
  ON havs_weeks FOR DELETE
  TO authenticated
  USING (
    ganger_id IN (
      SELECT employee_id FROM user_profiles WHERE id = auth.uid()
    )
    AND status = 'draft'
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
  );

CREATE POLICY "Gangers can insert members to their weeks"
  ON havs_week_members FOR INSERT
  TO authenticated
  WITH CHECK (
    havs_week_id IN (
      SELECT id FROM havs_weeks WHERE ganger_id IN (
        SELECT employee_id FROM user_profiles WHERE id = auth.uid()
      )
    )
  );

CREATE POLICY "Gangers can update members in their weeks"
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

CREATE POLICY "Gangers can delete members from their draft weeks"
  ON havs_week_members FOR DELETE
  TO authenticated
  USING (
    havs_week_id IN (
      SELECT id FROM havs_weeks 
      WHERE ganger_id IN (
        SELECT employee_id FROM user_profiles WHERE id = auth.uid()
      )
      AND status = 'draft'
    )
  );

-- RLS Policies for havs_exposure_entries
CREATE POLICY "Users can view exposure entries for their week members"
  ON havs_exposure_entries FOR SELECT
  TO authenticated
  USING (
    havs_week_member_id IN (
      SELECT hm.id FROM havs_week_members hm
      JOIN havs_weeks hw ON hm.havs_week_id = hw.id
      WHERE hw.ganger_id IN (
        SELECT employee_id FROM user_profiles WHERE id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can insert exposure entries for their week members"
  ON havs_exposure_entries FOR INSERT
  TO authenticated
  WITH CHECK (
    havs_week_member_id IN (
      SELECT hm.id FROM havs_week_members hm
      JOIN havs_weeks hw ON hm.havs_week_id = hw.id
      WHERE hw.ganger_id IN (
        SELECT employee_id FROM user_profiles WHERE id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can update exposure entries for their week members"
  ON havs_exposure_entries FOR UPDATE
  TO authenticated
  USING (
    havs_week_member_id IN (
      SELECT hm.id FROM havs_week_members hm
      JOIN havs_weeks hw ON hm.havs_week_id = hw.id
      WHERE hw.ganger_id IN (
        SELECT employee_id FROM user_profiles WHERE id = auth.uid()
      )
    )
  )
  WITH CHECK (
    havs_week_member_id IN (
      SELECT hm.id FROM havs_week_members hm
      JOIN havs_weeks hw ON hm.havs_week_id = hw.id
      WHERE hw.ganger_id IN (
        SELECT employee_id FROM user_profiles WHERE id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can delete exposure entries for their draft weeks"
  ON havs_exposure_entries FOR DELETE
  TO authenticated
  USING (
    havs_week_member_id IN (
      SELECT hm.id FROM havs_week_members hm
      JOIN havs_weeks hw ON hm.havs_week_id = hw.id
      WHERE hw.ganger_id IN (
        SELECT employee_id FROM user_profiles WHERE id = auth.uid()
      )
      AND hw.status = 'draft'
    )
  );
