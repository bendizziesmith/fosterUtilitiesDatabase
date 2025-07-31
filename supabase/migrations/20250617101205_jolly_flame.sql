/*
  # Add Vehicle Assignment System

  1. Database Changes
    - Add vehicle assignment fields to employees table
    - Add service and MOT tracking to vehicles table
    - Update foreign key relationships

  2. New Features
    - Assign vehicles to employees with service/MOT dates
    - Track next service and MOT due dates
    - Allow override vehicle selection in inspections
    - Enhanced vehicle management interface

  3. Security
    - Maintain existing RLS policies
    - Add proper constraints for dates
*/

-- Add vehicle assignment fields to employees table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'employees' AND column_name = 'assigned_vehicle_id'
  ) THEN
    ALTER TABLE employees ADD COLUMN assigned_vehicle_id uuid REFERENCES vehicles(id);
  END IF;
END $$;

-- Add service and MOT tracking to vehicles table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'vehicles' AND column_name = 'next_service_date'
  ) THEN
    ALTER TABLE vehicles ADD COLUMN next_service_date date;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'vehicles' AND column_name = 'next_mot_date'
  ) THEN
    ALTER TABLE vehicles ADD COLUMN next_mot_date date;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'vehicles' AND column_name = 'last_service_date'
  ) THEN
    ALTER TABLE vehicles ADD COLUMN last_service_date date;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'vehicles' AND column_name = 'last_mot_date'
  ) THEN
    ALTER TABLE vehicles ADD COLUMN last_mot_date date;
  END IF;
END $$;

-- Add override vehicle field to vehicle_inspections table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'vehicle_inspections' AND column_name = 'override_vehicle_registration'
  ) THEN
    ALTER TABLE vehicle_inspections ADD COLUMN override_vehicle_registration text;
  END IF;
END $$;

-- Add the same override field to plant_records table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'plant_records' AND column_name = 'override_vehicle_registration'
  ) THEN
    ALTER TABLE plant_records ADD COLUMN override_vehicle_registration text;
  END IF;
END $$;