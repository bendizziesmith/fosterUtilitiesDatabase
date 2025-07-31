/*
  # Add missing rate columns to timesheet_entries

  1. Schema Changes
    - Add `ipsom_rate_id` column to `timesheet_entries` table
    - Add `mollsworth_rate_id` column to `timesheet_entries` table
    - Add foreign key constraints to link with rate tables

  2. Security
    - Maintain existing RLS policies
*/

-- Add the missing columns to timesheet_entries
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'timesheet_entries' AND column_name = 'ipsom_rate_id'
  ) THEN
    ALTER TABLE timesheet_entries ADD COLUMN ipsom_rate_id uuid;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'timesheet_entries' AND column_name = 'mollsworth_rate_id'
  ) THEN
    ALTER TABLE timesheet_entries ADD COLUMN mollsworth_rate_id uuid;
  END IF;
END $$;

-- Add foreign key constraints
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'timesheet_entries_ipsom_rate_id_fkey'
  ) THEN
    ALTER TABLE timesheet_entries 
    ADD CONSTRAINT timesheet_entries_ipsom_rate_id_fkey 
    FOREIGN KEY (ipsom_rate_id) REFERENCES ipsom_rates(id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'timesheet_entries_mollsworth_rate_id_fkey'
  ) THEN
    ALTER TABLE timesheet_entries 
    ADD CONSTRAINT timesheet_entries_mollsworth_rate_id_fkey 
    FOREIGN KEY (mollsworth_rate_id) REFERENCES mollsworth_work_rates(id);
  END IF;
END $$;