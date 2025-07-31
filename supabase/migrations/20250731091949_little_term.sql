/*
  # Fix vehicle inspections foreign key relationship

  1. Foreign Key Constraints
    - Add missing foreign key constraint between vehicle_inspections.vehicle_id and vehicles.id
    - This enables Supabase to properly join these tables in queries

  2. Notes
    - The vehicles table was rebuilt, breaking the existing foreign key
    - This migration restores the relationship needed for inspection queries
*/

-- Add the missing foreign key constraint between vehicle_inspections and vehicles
DO $$
BEGIN
  -- Check if the foreign key constraint doesn't already exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'vehicle_inspections_vehicle_id_fkey'
    AND table_name = 'vehicle_inspections'
  ) THEN
    ALTER TABLE vehicle_inspections 
    ADD CONSTRAINT vehicle_inspections_vehicle_id_fkey 
    FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE SET NULL;
  END IF;
END $$;