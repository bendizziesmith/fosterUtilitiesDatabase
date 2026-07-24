/*
  # Add optional per-job notes to timesheet job rows

  1. Modified Tables
    - `timesheet_job_rows`
      - Added `notes` (text, nullable) - free-text note the ganger can add against a job
        for anything the fixed fields do not capture (access, delays, materials, extra work).

  2. Security
    - No RLS changes. The new column inherits the existing `timesheet_job_rows` policies.

  3. Important Notes
    - Nullable with no default, so existing rows are unaffected.
    - Separate from `timesheet_weeks.weekly_notes`, which stays for week-level notes.
    - This column was already applied to production directly; this file is kept for repo
      history parity and is written to be idempotent, so re-running it is safe.
*/

ALTER TABLE public.timesheet_job_rows ADD COLUMN IF NOT EXISTS notes text;
