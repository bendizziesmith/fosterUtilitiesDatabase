-- Add status column to structured_timesheets table to track draft vs submitted status

-- Add status column with default value
ALTER TABLE structured_timesheets 
ADD COLUMN IF NOT EXISTS status text DEFAULT 'draft';

-- Add check constraint to ensure valid status values
ALTER TABLE structured_timesheets 
ADD CONSTRAINT structured_timesheets_status_check 
CHECK (status IN ('draft', 'submitted'));

-- Update existing records to have 'submitted' status if they have a submitted_at date
UPDATE structured_timesheets 
SET status = 'submitted' 
WHERE submitted_at IS NOT NULL AND status = 'draft';

-- Add comment to document the status column
COMMENT ON COLUMN structured_timesheets.status IS 'Status of timesheet: draft (editable) or submitted (read-only for employee, visible to employer)';