/*
  # Clear test employee data

  1. Data Cleanup
    - Remove all existing employees (test data)
    - Remove all related inspection records
    - Remove all related plant records
    - Remove all related timesheet data
    - Remove all user profiles linked to employees
  
  2. Fresh Start
    - Clean slate for adding real employees
    - Maintains all table structures and relationships
    - Keeps admin accounts intact
*/

-- Clear timesheet entries first (foreign key dependency)
DELETE FROM timesheet_entries;

-- Clear timesheets
DELETE FROM new_timesheets;

-- Clear inspection items first (foreign key dependency)
DELETE FROM inspection_items;

-- Clear vehicle inspections
DELETE FROM vehicle_inspections;

-- Clear plant records
DELETE FROM plant_records;

-- Clear user profiles for employees (keep admin profiles)
DELETE FROM user_profiles WHERE role = 'employee';

-- Clear all employees
DELETE FROM employees;

-- Reset any sequences if needed
-- Note: UUIDs don't use sequences, so this is mainly for reference