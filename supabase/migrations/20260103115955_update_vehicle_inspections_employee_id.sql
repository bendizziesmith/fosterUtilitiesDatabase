/*
  # Update Vehicle Inspections Table

  1. Changes
    - Add employee_id column if not exists
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'vehicle_inspections' AND column_name = 'employee_id'
  ) THEN
    ALTER TABLE vehicle_inspections ADD COLUMN employee_id uuid REFERENCES employees(id) ON DELETE SET NULL;
  END IF;
END $$;