/*
  # Add odometer reading column to vehicle inspections

  1. Schema Changes
    - Add `odometer_reading` column to `vehicle_inspections` table
    - Column type: numeric(10,2) to store mileage/odometer values
    - Allow null values for backward compatibility with existing records

  2. Purpose
    - Store vehicle mileage/odometer readings during daily inspections
    - Enable tracking of vehicle usage and maintenance scheduling
*/

-- Add odometer_reading column to vehicle_inspections table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'vehicle_inspections' AND column_name = 'odometer_reading'
  ) THEN
    ALTER TABLE vehicle_inspections ADD COLUMN odometer_reading numeric(10,2);
  END IF;
END $$;

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_vehicle_inspections_odometer_reading 
ON vehicle_inspections(odometer_reading);