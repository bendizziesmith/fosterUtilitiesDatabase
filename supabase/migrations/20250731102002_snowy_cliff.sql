/*
  # Add missing columns for vehicle and plant inspections

  1. New Columns for inspection_items table
    - `photo_url` (text, nullable) - for storing photo URLs of inspection items
    - `defect_severity` (text, nullable) - for categorizing defect severity levels
    - `action_required` (boolean, default false) - flag for items requiring action
    - `completion_date` (timestamptz, nullable) - when defect was resolved

  2. Security
    - Maintain existing RLS policies
    - Add indexes for better performance

  3. Changes
    - Extends inspection_items table to support photo uploads and defect tracking
    - Ensures compatibility with vehicle and plant inspection workflows
*/

-- Add missing columns to inspection_items table
DO $$
BEGIN
  -- Add photo_url column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'inspection_items' AND column_name = 'photo_url'
  ) THEN
    ALTER TABLE inspection_items ADD COLUMN photo_url text;
  END IF;

  -- Add defect_severity column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'inspection_items' AND column_name = 'defect_severity'
  ) THEN
    ALTER TABLE inspection_items ADD COLUMN defect_severity text;
  END IF;

  -- Add action_required column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'inspection_items' AND column_name = 'action_required'
  ) THEN
    ALTER TABLE inspection_items ADD COLUMN action_required boolean DEFAULT false;
  END IF;

  -- Add completion_date column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'inspection_items' AND column_name = 'completion_date'
  ) THEN
    ALTER TABLE inspection_items ADD COLUMN completion_date timestamptz;
  END IF;
END $$;

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_inspection_items_photo_url ON inspection_items(photo_url);
CREATE INDEX IF NOT EXISTS idx_inspection_items_defect_severity ON inspection_items(defect_severity);
CREATE INDEX IF NOT EXISTS idx_inspection_items_action_required ON inspection_items(action_required);

-- Add constraint for defect_severity values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'inspection_items_defect_severity_check'
  ) THEN
    ALTER TABLE inspection_items ADD CONSTRAINT inspection_items_defect_severity_check
    CHECK (defect_severity IS NULL OR defect_severity IN ('low', 'medium', 'high', 'critical'));
  END IF;
END $$;