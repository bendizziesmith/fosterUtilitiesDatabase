/*
  # Fix SERVICE voltage structure

  This migration restructures the ipsom_rates table to combine SERVICE with voltage
  in col2 instead of having it as a separate descriptor in col3.
  
  Changes:
  - SERVICE entries: col2 becomes "LV SERVICE" or "HV SERVICE"
  - col3 (descriptor) becomes empty for service entries
  - Maintains all other entries as-is
*/

-- Update SERVICE entries to combine voltage with SERVICE in col2
UPDATE ipsom_rates 
SET 
  col2 = CASE 
    WHEN col2 = 'LV' AND col3 = 'SERVICE' THEN 'LV SERVICE'
    WHEN col2 = 'HV' AND col3 = 'SERVICE' THEN 'HV SERVICE'
    ELSE col2
  END,
  col3 = CASE 
    WHEN col3 = 'SERVICE' THEN ''
    ELSE col3
  END
WHERE col3 = 'SERVICE';

-- Also handle any entries where col2 is empty but col3 is SERVICE
UPDATE ipsom_rates 
SET 
  col2 = CASE 
    WHEN (col2 = '' OR col2 IS NULL) AND col3 = 'SERVICE' THEN 'SERVICE'
    ELSE col2
  END,
  col3 = CASE 
    WHEN col3 = 'SERVICE' AND (col2 = '' OR col2 IS NULL) THEN ''
    ELSE col3
  END
WHERE col3 = 'SERVICE' AND (col2 = '' OR col2 IS NULL);