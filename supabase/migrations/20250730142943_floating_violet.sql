/*
  # Add fuel_card column to vehicles table

  1. Changes
    - Add `fuel_card` column to `vehicles` table
    - Column is nullable text type for storing fuel card numbers
    - This resolves the "Could not find the 'fuel_card' column" error

  2. Notes
    - Optional field for tracking fuel card assignments
    - Allows null values as not all vehicles may have fuel cards
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'vehicles' AND column_name = 'fuel_card'
  ) THEN
    ALTER TABLE vehicles ADD COLUMN fuel_card text;
  END IF;
END $$;