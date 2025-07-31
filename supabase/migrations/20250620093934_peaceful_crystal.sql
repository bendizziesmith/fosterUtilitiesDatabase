/*
  # Add inspection fields to vehicle_inspections table

  1. New Fields
    - `odometer_reading` (numeric) - Current odometer reading at time of inspection
    - `inspection_date` (date) - Date when inspection was performed
    - `pulling_trailer` (boolean) - Whether vehicle was pulling trailer/generator

  2. Changes
    - Add new columns to vehicle_inspections table
    - Set appropriate defaults and constraints
*/

-- Add new fields to vehicle_inspections table
ALTER TABLE vehicle_inspections 
ADD COLUMN IF NOT EXISTS odometer_reading numeric,
ADD COLUMN IF NOT EXISTS inspection_date date DEFAULT CURRENT_DATE,
ADD COLUMN IF NOT EXISTS pulling_trailer boolean DEFAULT false;

-- Add comments for documentation
COMMENT ON COLUMN vehicle_inspections.odometer_reading IS 'Current odometer/mileage reading at time of inspection';
COMMENT ON COLUMN vehicle_inspections.inspection_date IS 'Date when the inspection was performed';
COMMENT ON COLUMN vehicle_inspections.pulling_trailer IS 'Whether the vehicle was pulling a trailer or generator';