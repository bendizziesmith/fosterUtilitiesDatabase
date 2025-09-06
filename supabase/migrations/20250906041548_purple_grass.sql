/*
  # Add defect tracking and follow-up system

  1. New Columns
    - Add `defect_fixed` column to inspection_items table
    - Add `previous_defect_id` column to track which defect was fixed
    - Add `defect_status` column to track defect lifecycle

  2. Defect Status Values
    - 'active' - defect is still present
    - 'fixed' - defect has been resolved
    - 'acknowledged' - defect noted but not yet fixed

  3. Security
    - Maintain existing RLS policies
    - Add indexes for better performance
*/

-- Add defect tracking columns to inspection_items table
DO $$
BEGIN
  -- Add defect_fixed column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'inspection_items' AND column_name = 'defect_fixed'
  ) THEN
    ALTER TABLE inspection_items ADD COLUMN defect_fixed boolean DEFAULT false;
  END IF;

  -- Add previous_defect_id column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'inspection_items' AND column_name = 'previous_defect_id'
  ) THEN
    ALTER TABLE inspection_items ADD COLUMN previous_defect_id uuid REFERENCES inspection_items(id) ON DELETE SET NULL;
  END IF;

  -- Add defect_status column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'inspection_items' AND column_name = 'defect_status'
  ) THEN
    ALTER TABLE inspection_items ADD COLUMN defect_status text DEFAULT 'active' CHECK (defect_status IN ('active', 'fixed', 'acknowledged'));
  END IF;
END $$;

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_inspection_items_defect_fixed ON inspection_items(defect_fixed);
CREATE INDEX IF NOT EXISTS idx_inspection_items_previous_defect_id ON inspection_items(previous_defect_id);
CREATE INDEX IF NOT EXISTS idx_inspection_items_defect_status ON inspection_items(defect_status);

-- Add comment to document the defect tracking system
COMMENT ON COLUMN inspection_items.defect_fixed IS 'Whether this item represents a fixed defect from a previous inspection';
COMMENT ON COLUMN inspection_items.previous_defect_id IS 'References the original defect item that was fixed';
COMMENT ON COLUMN inspection_items.defect_status IS 'Status of defect: active (still present), fixed (resolved), acknowledged (noted)';