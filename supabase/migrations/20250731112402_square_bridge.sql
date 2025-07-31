/*
  # Update Ipsom Rates from Chart Data

  1. Data Changes
    - Clear all existing Ipsom rates
    - Insert new rates from provided chart in exact order
    - Maintain sheet_no and line_no structure
    - Include all work items with proper column parameters

  2. Rate Structure
    - Sheet 1: Service rates (LV work items)
    - Sheet 2: Main/LV & HV rates (ANY voltage items)
    - Proper column mappings for work parameters

  3. Data Integrity
    - All rates marked as active
    - Proper decimal formatting for GBP rates
    - Sequential line numbering within sheets
*/

-- Clear existing Ipsom rates
DELETE FROM ipsom_rates WHERE is_active = true;

-- Insert new Ipsom rates from chart (in order shown)
INSERT INTO ipsom_rates (sheet_no, line_no, work_item, col2, col3, col4, rate_gbp, is_active) VALUES
-- Sheet 1 - Service Rates (LV)
(1, 1, 'EX/LAY/REIN', 'LV', 'service', 'SITE', 9.25, true),
(1, 2, 'EX/LAY/REIN', 'LV', 'service', 'AGRI', 10.10, true),
(1, 3, 'EX/LAY/REIN', 'LV', 'service', 'U/MADE', 11.62, true),
(1, 4, 'EX/LAY/REIN', 'LV', 'service', 'FWAY', 16.22, true),
(1, 5, 'EX/LAY/REIN', 'LV', 'service', 'CWAY', 26.98, true),

(1, 6, 'EX/JOIN BAY', 'LV', 'SERVICE', 'ANY', 40.00, true),
(1, 7, 'B/FILL J/BAY', 'LV', 'SERVICE', 'AGRI', 40.00, true),
(1, 8, 'B/FILL J/BAY', 'LV', 'SERVICE', 'U/MADE', 40.00, true),
(1, 9, 'B/FILL J/BAY', 'LV', 'SERVICE', 'FWAY', 67.75, true),
(1, 10, 'B/FILL J/BAY', 'LV', 'SERVICE', 'CWAY', 85.95, true),

(1, 11, 'ADD/SERV/CABLE', 'LV', 'SAME/EXC', 'ANY', 2.12, true),
(1, 12, 'PULL/CABLE IN DUCT', 'LV', 'SERVICE', 'ANY', 4.25, true),
(1, 13, 'PULL/CABLE/O-TRE', 'LV', 'SERVICE', 'ANY', 6.10, true),
(1, 14, 'MOLE<35MM', 'LV', 'SERVICE', 'ANY', 21.08, true),

-- Sheet 2 - Main/LV & HV Rates (ANY voltage)
(2, 1, 'LAY/EARTH/CABLE', 'ANY', 'ANY', 'ANY', 1.38, true),
(2, 2, 'EX/DD-PIT/BFILL', 'ANY', 'ANY', 'UN/MADE', 109.95, true);