/*
  # Add Price Work quantities to timesheet job rows

  1. Modified Tables
    - `timesheet_job_rows`
      - Trench work (metres, decimals allowed):
        - Added `pw_trench_verge` (numeric, nullable)
        - Added `pw_trench_footway` (numeric, nullable)
        - Added `pw_trench_carriageway` (numeric, nullable)
      - Joint Hole work (whole count):
        - Added `pw_joint_verge` (integer, nullable)
        - Added `pw_joint_footway` (integer, nullable)
        - Added `pw_joint_carriageway` (integer, nullable)

  2. Purpose
    - Lets a ganger record priced work per job on the weekly timesheet: Trench in
      metres and Joint Hole as a count, each split Verge / Footway (F/W) /
      Carriageway (C/W). No monetary value is stored in this build.

  3. Security
    - No RLS changes. The new columns inherit the existing `timesheet_job_rows`
      row-level security policies.

  4. Important Notes
    - All new columns are nullable with no defaults, so existing rows are unaffected.
    - Additive only: no existing columns, constraints, or policies are changed.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'timesheet_job_rows' AND column_name = 'pw_trench_verge'
  ) THEN
    ALTER TABLE timesheet_job_rows ADD COLUMN pw_trench_verge numeric;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'timesheet_job_rows' AND column_name = 'pw_trench_footway'
  ) THEN
    ALTER TABLE timesheet_job_rows ADD COLUMN pw_trench_footway numeric;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'timesheet_job_rows' AND column_name = 'pw_trench_carriageway'
  ) THEN
    ALTER TABLE timesheet_job_rows ADD COLUMN pw_trench_carriageway numeric;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'timesheet_job_rows' AND column_name = 'pw_joint_verge'
  ) THEN
    ALTER TABLE timesheet_job_rows ADD COLUMN pw_joint_verge integer;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'timesheet_job_rows' AND column_name = 'pw_joint_footway'
  ) THEN
    ALTER TABLE timesheet_job_rows ADD COLUMN pw_joint_footway integer;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'timesheet_job_rows' AND column_name = 'pw_joint_carriageway'
  ) THEN
    ALTER TABLE timesheet_job_rows ADD COLUMN pw_joint_carriageway integer;
  END IF;
END $$;
