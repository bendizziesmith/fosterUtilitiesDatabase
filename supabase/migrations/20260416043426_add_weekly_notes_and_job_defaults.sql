/*
  # Add Weekly Notes and Job Default Times

  1. Modified Tables
    - `timesheet_weeks`
      - Added `weekly_notes` (text, nullable) - optional notes for the entire week
    - `timesheet_job_rows`
      - Added `default_start_time` (time, nullable) - default start time for this job
      - Added `default_finish_time` (time, nullable) - default finish time for this job

  2. Purpose
    - Weekly notes replace per-job notes with a single notes field per timesheet
    - Default start/finish times on job rows allow gangers to set a base schedule
      for the job, then override individual days as needed

  3. Important Notes
    - All new columns are nullable with no defaults, so existing data is unaffected
    - No destructive changes to existing columns or data
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'timesheet_weeks' AND column_name = 'weekly_notes'
  ) THEN
    ALTER TABLE timesheet_weeks ADD COLUMN weekly_notes text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'timesheet_job_rows' AND column_name = 'default_start_time'
  ) THEN
    ALTER TABLE timesheet_job_rows ADD COLUMN default_start_time time;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'timesheet_job_rows' AND column_name = 'default_finish_time'
  ) THEN
    ALTER TABLE timesheet_job_rows ADD COLUMN default_finish_time time;
  END IF;
END $$;
