-- Update structured_timesheets table to support gang system and enhanced standby tracking

-- Update the standby column structure to support split tracking
-- This will be handled in the application layer, but we'll ensure the column can store the new format

-- Add a comment to document the new standby structure
COMMENT ON COLUMN structured_timesheets.standby IS 'JSON object with mon_thu and fri_sun arrays for split standby tracking';

-- Add a comment to document the summary_hours structure
COMMENT ON COLUMN structured_timesheets.summary_hours IS 'JSON object with basic_shift, overtime, and work_day_reasons for incomplete work days';

-- Ensure the table structure supports the gang system
-- labour_1 will be used for Ganger
-- labour_2 will be used for Labourer
-- driver, hand, machine will be set to null in gang system

COMMENT ON COLUMN structured_timesheets.labour_1 IS 'Ganger name in gang system';
COMMENT ON COLUMN structured_timesheets.labour_2 IS 'Labourer name in gang system';