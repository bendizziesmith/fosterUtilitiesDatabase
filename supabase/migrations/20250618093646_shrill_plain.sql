/*
  # Remove Weekly Timesheet System

  1. Drop Tables
    - Drop `timesheet_entries` table (dependent table first)
    - Drop `weekly_timesheets` table
    - Drop trigger function

  2. Clean Up
    - Remove all weekly timesheet data
    - Remove related policies and triggers
*/

-- Drop dependent table first
DROP TABLE IF EXISTS timesheet_entries CASCADE;

-- Drop main weekly timesheets table
DROP TABLE IF EXISTS weekly_timesheets CASCADE;

-- Drop trigger function if it exists
DROP FUNCTION IF EXISTS trigger_calculate_timesheet_totals() CASCADE;