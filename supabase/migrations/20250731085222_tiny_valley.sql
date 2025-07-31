/*
  # Add make_model field to vehicles table

  1. Schema Changes
    - Add `make_model` column to `vehicles` table
    - Migrate existing data by combining `make` and `model` columns
    - Remove old `make`, `model`, and `year` columns

  2. Data Migration
    - Combine existing make and model data into new make_model field
    - Preserve all existing vehicle data

  3. Security
    - Maintain existing RLS policies
*/

-- Add the new make_model column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'vehicles' AND column_name = 'make_model'
  ) THEN
    ALTER TABLE vehicles ADD COLUMN make_model text;
  END IF;
END $$;

-- Migrate existing data by combining make and model
UPDATE vehicles 
SET make_model = CONCAT(make, ' ', model)
WHERE make_model IS NULL AND make IS NOT NULL AND model IS NOT NULL;

-- Set make_model as NOT NULL after migration
ALTER TABLE vehicles ALTER COLUMN make_model SET NOT NULL;

-- Drop the old columns
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'vehicles' AND column_name = 'make'
  ) THEN
    ALTER TABLE vehicles DROP COLUMN make;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'vehicles' AND column_name = 'model'
  ) THEN
    ALTER TABLE vehicles DROP COLUMN model;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'vehicles' AND column_name = 'year'
  ) THEN
    ALTER TABLE vehicles DROP COLUMN year;
  END IF;
END $$;