/*
  # Add Mains and HV Rates to Ipsom Rates

  1. New Rates Added
    - Sheet 2 (Mains/HV): Additional LV and HV rates from the updated chart
    - EX/LAY/REIN rates for both LV and HV voltages
    - EX/DIG rates with FW/CW and standard variants
    - ADD/DUCT/CABLE rates for LV and HV
    - CABLE PULL/NO EXC rates for LV and HV
    - EX/JHOLE and B/FILL/JH rates for LV and HV

  2. Data Structure
    - All rates added to sheet_no = 2 (Mains/HV sheet)
    - Line numbers continue from existing entries
    - Proper voltage classifications (LV, HV)
    - Site types and excavation parameters included
*/

-- Add the mains and HV rates to Sheet 2
INSERT INTO ipsom_rates (sheet_no, line_no, work_item, col2, col3, col4, rate_gbp, is_active) VALUES
-- LV Mains rates (continuing line numbers from existing Sheet 2)
(2, 3, 'EX/LAY/REIN', 'LV', '', 'SITE', 7.10, true),
(2, 4, 'EX/LAY/REIN', 'LV', '', 'AGRI', 9.50, true),
(2, 5, 'EX/LAY/REIN', 'LV', '', 'U/MADE', 11.59, true),
(2, 6, 'EX/LAY/REIN', 'LV', '', 'UM/CW', 20.20, true),
(2, 7, 'EX/LAY/REIN', 'LV', '', 'FWAY', 22.75, true),
(2, 8, 'EX/LAY/REIN', 'LV', '', 'CWAY', 27.25, true),
(2, 9, 'EX/DIG', 'LV', 'FW/CW', 'SURFACED', 12.50, true),
(2, 10, 'EX/DIG', 'LV', '', 'SOFT', 4.95, true),
(2, 11, 'ADD/DUCT/CABLE', 'LV', 'NO/EXC', 'IN/TREN', 2.20, true),

-- HV Mains rates
(2, 12, 'EX/LAY/REIN', 'HV', '', 'SITE', 8.10, true),
(2, 13, 'EX/LAY/REIN', 'HV', '', 'AGRI', 10.75, true),
(2, 14, 'EX/LAY/REIN', 'HV', '', 'U/MADE', 12.35, true),
(2, 15, 'EX/LAY/REIN', 'HV', '', 'UM/CW', 21.50, true),
(2, 16, 'EX/LAY/REIN', 'HV', '', 'FWAY', 25.10, true),
(2, 17, 'EX/LAY/REIN', 'HV', '', 'CWAY', 29.05, true),
(2, 18, 'EX/DIG/S', 'HV', 'FW/CW', 'SURFACED', 13.00, true),
(2, 19, 'EX/DIG', 'HV', '', 'SOFT', 6.50, true),
(2, 20, 'ADD/DUCT/CABLE', 'HV', 'NO/EXC', 'IN/TREN', 2.20, true),

-- CABLE PULL/NO EXC rates
(2, 21, 'CABLE PULL/NO EXC', 'LV', 'O/EXC', '', 3.75, true),
(2, 22, 'CABLE PULL/NO EXC', 'LV', 'DUCT', '', 3.00, true),
(2, 23, 'CABLE PULL/NO EXC', 'HV', 'O/EXC', '', 4.25, true),
(2, 24, 'CABLE PULL/NO EXC', 'HV', 'DUCT', '', 3.75, true),

-- EX/JHOLE and B/FILL/JH rates
(2, 25, 'EX/JHOLE', 'LV', '', '', 72.50, true),
(2, 26, 'B/FILL/JH', 'LV', '', '', 52.00, true),
(2, 27, 'EX/JHOLE', 'HV', '', '', 120.00, true),
(2, 28, 'B/FILL/JH', 'HV', '', '', 93.00, true);