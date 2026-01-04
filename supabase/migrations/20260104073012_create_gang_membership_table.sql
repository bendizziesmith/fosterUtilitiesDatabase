/*
  # Create Gang Membership Table

  1. New Tables
    - `gang_membership`
      - `id` (uuid, primary key)
      - `week_ending` (date) - The Sunday date for the week
      - `ganger_id` (uuid, references employees) - The ganger (team leader)
      - `operative_id` (uuid, nullable, references employees) - System employee operative
      - `operative_name` (text, nullable) - Name for manual operatives
      - `operative_role` (text) - Role description (always "Operative")
      - `is_manual` (boolean, default false) - Whether this is a manual entry
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on `gang_membership` table
    - Add policy for authenticated users to manage their own gang memberships

  3. Notes
    - Gang membership persists week-to-week
    - Operatives can be system employees OR manual entries
    - Each ganger can have up to 2 operatives per week
    - Unique constraint prevents duplicate entries
*/

CREATE TABLE IF NOT EXISTS gang_membership (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_ending date NOT NULL,
  ganger_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  operative_id uuid REFERENCES employees(id) ON DELETE CASCADE,
  operative_name text,
  operative_role text DEFAULT 'Operative',
  is_manual boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE gang_membership ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS gang_membership_unique_operative 
  ON gang_membership(week_ending, ganger_id, operative_id) 
  WHERE operative_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS gang_membership_unique_manual 
  ON gang_membership(week_ending, ganger_id, operative_name) 
  WHERE is_manual = true;

CREATE POLICY "Users can view gang memberships where they are ganger"
  ON gang_membership FOR SELECT
  TO authenticated
  USING (
    ganger_id = auth.uid() 
    OR operative_id = auth.uid()
  );

CREATE POLICY "Users can insert their own gang memberships"
  ON gang_membership FOR INSERT
  TO authenticated
  WITH CHECK (ganger_id = auth.uid());

CREATE POLICY "Users can update their own gang memberships"
  ON gang_membership FOR UPDATE
  TO authenticated
  USING (ganger_id = auth.uid())
  WITH CHECK (ganger_id = auth.uid());

CREATE POLICY "Users can delete their own gang memberships"
  ON gang_membership FOR DELETE
  TO authenticated
  USING (ganger_id = auth.uid());
