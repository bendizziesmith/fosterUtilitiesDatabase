/*
  # Remove Legacy Timesheet System

  1. Tables to Drop
    - `timesheets` table (legacy simple timesheet)
  
  2. Keep Professional System
    - `structured_timesheets` table remains intact
    - All structured timesheet data preserved
*/

-- Drop legacy timesheets table
DROP TABLE IF EXISTS timesheets CASCADE;