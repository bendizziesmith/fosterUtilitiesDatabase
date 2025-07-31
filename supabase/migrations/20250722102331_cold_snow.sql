/*
  # Fix Ipsom rates column structure

  1. Changes
    - col2: Only "LV SERVICE", "LV", "HV" 
    - col3: Only "NO/EXC", "O/EXC", "DUCT"
    - Move EXC/SERVICE entries to have "LV SERVICE" in col2
    - Remove non-existent "HV SERVICE"
*/

-- Fix SERVICE entries - move to LV SERVICE in col2
UPDATE ipsom_rates 
SET col2 = 'LV SERVICE', col3 = ''
WHERE work_item LIKE '%SERVICE%';

-- Fix LV entries that should be in col2
UPDATE ipsom_rates 
SET col2 = 'LV', col3 = ''
WHERE col3 = 'LV' AND col2 != 'LV SERVICE';

-- Fix HV entries that should be in col2  
UPDATE ipsom_rates 
SET col2 = 'HV', col3 = ''
WHERE col3 = 'HV' AND col2 != 'LV SERVICE';

-- Fix excavation entries
UPDATE ipsom_rates 
SET col2 = 'LV', col3 = 'NO/EXC'
WHERE work_item IN ('EX/LAY/REIN', 'EX/DIG') AND col3 LIKE '%NO/EXC%';

UPDATE ipsom_rates 
SET col2 = 'LV', col3 = 'O/EXC'  
WHERE work_item IN ('EX/LAY/REIN', 'EX/DIG') AND col3 LIKE '%O/EXC%';

-- Fix duct entries
UPDATE ipsom_rates 
SET col2 = 'LV', col3 = 'DUCT'
WHERE col3 LIKE '%DUCT%' OR col4 LIKE '%DUCT%';

-- Clean up any remaining inconsistencies
UPDATE ipsom_rates 
SET col3 = ''
WHERE col3 NOT IN ('NO/EXC', 'O/EXC', 'DUCT', '');

-- Ensure col2 only has correct values
UPDATE ipsom_rates 
SET col2 = 'LV'
WHERE col2 NOT IN ('LV SERVICE', 'LV', 'HV', '');