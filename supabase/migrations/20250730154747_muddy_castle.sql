/*
  # Delete All Employee Management Tables and Data

  This migration removes all employee-related tables, authentication data, and resets the system.
  
  1. Tables to Delete
    - employees
    - user_profiles  
    - users
    - timesheet_entries
    - new_timesheets
    - work_rates
    - ipsom_rates
    - mollsworth_work_rates
    - vehicle_inspections
    - inspection_items
    - plant_records
    - checklist_templates
    - vehicles

  2. Functions to Delete
    - All edge functions related to user management

  3. Complete Reset
    - All authentication users except system users
    - All RLS policies
    - All triggers and functions
*/

-- Drop all tables in correct order (respecting foreign key constraints)
DROP TABLE IF EXISTS timesheet_entries CASCADE;
DROP TABLE IF EXISTS new_timesheets CASCADE;
DROP TABLE IF EXISTS inspection_items CASCADE;
DROP TABLE IF EXISTS vehicle_inspections CASCADE;
DROP TABLE IF EXISTS plant_records CASCADE;
DROP TABLE IF EXISTS user_profiles CASCADE;
DROP TABLE IF EXISTS employees CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS work_rates CASCADE;
DROP TABLE IF EXISTS ipsom_rates CASCADE;
DROP TABLE IF EXISTS mollsworth_work_rates CASCADE;
DROP TABLE IF EXISTS checklist_templates CASCADE;
DROP TABLE IF EXISTS vehicles CASCADE;

-- Drop any custom functions
DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;

-- Note: Auth users will need to be deleted manually through Supabase dashboard
-- or via service role if needed