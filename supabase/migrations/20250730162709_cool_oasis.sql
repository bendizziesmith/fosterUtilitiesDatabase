/*
  # Add foreign key relationships to timesheet_entries

  1. Changes
    - Add `ipsom_rate_id` column as foreign key to `ipsom_rates(id)`
    - Add `mollsworth_rate_id` column as foreign key to `mollsworth_work_rates(id)`
    - Both columns are nullable since entries may use different rate types
    - Add indexes for performance

  2. Security
    - No RLS changes needed as timesheet_entries already has proper policies
*/

-- Add ipsom_rate_id foreign key column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'timesheet_entries' AND column_name = 'ipsom_rate_id'
  ) THEN
    ALTER TABLE timesheet_entries ADD COLUMN ipsom_rate_id uuid;
  END IF;
END $$;

-- Add mollsworth_rate_id foreign key column
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
    FOREIGN KEY (ipsom_rate_id) REFERENCES ipsom_rates(id) ON DELETE SET NULL;
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
    FOREIGN KEY (mollsworth_rate_id) REFERENCES mollsworth_work_rates(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_timesheet_entries_ipsom_rate_id 
ON timesheet_entries(ipsom_rate_id);

CREATE INDEX IF NOT EXISTS idx_timesheet_entries_mollsworth_rate_id 
ON timesheet_entries(mollsworth_rate_id);