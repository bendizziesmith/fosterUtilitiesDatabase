/*
  # Fix LV/HV column structure for Ipsom rates

  1. Database Changes
    - Move LV/HV from col3 to col2 for main rates
    - Create "LV SERVICE" and "HV SERVICE" entries in col2
    - Clear col3 for service entries
    - Keep col4 (SITE, AGRI, etc.) unchanged

  2. Structure After Fix
    - SERVICE entries: col2 = "LV SERVICE" or "HV SERVICE", col3 = empty
    - MAIN entries: col2 = "LV" or "HV", col3 = empty, col4 = surface types
    - EXCAVATION entries: col2 = "FW/CW", col3 = empty, col4 = surface types
*/

-- First, update SERVICE entries to have "LV SERVICE" or "HV SERVICE" in col2
UPDATE ipsom_rates 
SET col2 = CASE 
  WHEN col3 = 'LV' AND col3 != '' THEN 'LV SERVICE'
  WHEN col3 = 'HV' AND col3 != '' THEN 'HV SERVICE'
  ELSE col2
END,
col3 = ''
WHERE col3 IN ('LV', 'HV') AND work_item LIKE '%SERVICE%' OR work_item IN (
  'EX/LAY/REIN',
  'EX/DIG', 
  'ADD/DUCT/CABLE',
  'CABLE PULL/NO EXC',
  'EX/HOLE',
  'B/FILL/JH',
  'EX/JOIN BAY',
  'B/FILL J/BAY',
  'ADD/SERV/CABLE',
  'PULL/CABLE IN DUCT',
  'PULL/CABLE/O-TRE',
  'MOLE<35MM',
  'LAY/EARTH/CABLE',
  'EX/DD-PIT/BFILL'
);

-- For main rates (non-service), move LV/HV from col3 to col2
UPDATE ipsom_rates 
SET col2 = col3,
    col3 = ''
WHERE col3 IN ('LV', 'HV') 
  AND col2 NOT LIKE '%SERVICE%'
  AND work_item NOT LIKE '%SERVICE%';

-- Clean up any remaining inconsistencies
UPDATE ipsom_rates 
SET col3 = ''
WHERE col3 IN ('LV', 'HV');