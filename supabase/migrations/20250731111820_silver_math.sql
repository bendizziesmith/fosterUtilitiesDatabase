/*
  # Update Mollsworth Work Rates from Chart

  1. Data Changes
    - Clear all existing mollsworth_work_rates data
    - Insert new rates from provided chart in exact order
    - Maintain all existing column names (col1_work_item, col2_param, col3_param, col4_param, rate_gbp)
    
  2. Rate Structure
    - 18 EX/LAY/REIN entries (11KV and 33KV variants)
    - 4 EX/DIG entries with variations
    - 2 ADD/DUCT/CABLE entries
    - 4 CABLE PULL/NO EXC entries
    - 4 EX/JHOLE and B/FILL/JH entries
    
  3. Notes
    - All rates include voltage type (11KV/33KV)
    - Site types include SITE, AGRI, U/MADE, UM/CW, FWAY, CWAY, SURFACED, SOFT, IN/TREN
    - Excavation types include blank, FW/CW, NO/EXC, O/EXC, DUCT
*/

-- Clear existing data
DELETE FROM mollsworth_work_rates WHERE is_active = true;

-- Insert new rates from chart in exact order
INSERT INTO mollsworth_work_rates (col1_work_item, col2_param, col3_param, col4_param, rate_gbp, is_active) VALUES
-- EX/LAY/REIN 11KV entries
('EX/LAY/REIN', '11KV', '', 'SITE', 8.65, true),
('EX/LAY/REIN', '11KV', '', 'AGRI', 8.70, true),
('EX/LAY/REIN', '11KV', '', 'U/MADE', 10.10, true),
('EX/LAY/REIN', '11KV', '', 'UM/CW', 18.23, true),
('EX/LAY/REIN', '11KV', '', 'FWAY', 24.10, true),
('EX/LAY/REIN', '11KV', '', 'CWAY', 26.50, true),

-- EX/DIG entries 11KV
('EX/DIG', '11KV', 'FW/CW', 'SURFACED', 6.69, true),
('EX/DIG', '11KV', '', 'SOFT', 4.15, true),

-- ADD/DUCT/CABLE 11KV
('ADD/DUCT/CABLE', '11KV', 'NO/EXC', 'IN/TREN', 1.85, true),

-- EX/LAY/REIN 33KV entries
('EX/LAY/REIN', '33KV', '', 'SITE', 9.95, true),
('EX/LAY/REIN', '33KV', '', 'AGRI', 10.25, true),
('EX/LAY/REIN', '33KV', '', 'U/MADE', 11.25, true),
('EX/LAY/REIN', '33KV', '', 'UM/CW', 22.90, true),
('EX/LAY/REIN', '33KV', '', 'FWAY', 28.75, true),
('EX/LAY/REIN', '33KV', '', 'CWAY', 32.70, true),

-- EX/DIG entries 33KV
('EX/DIG/S', '33KV', 'FW/CW', 'SURFACED', 7.89, true),
('EX/DIG', '33KV', '', 'SOFT', 4.75, true),

-- ADD/DUCT/CABLE 33KV
('ADD/DUCT/CABLE', '33KV', 'NO/EXC', 'IN/TREN', 1.95, true),

-- CABLE PULL/NO EXC entries
('CABLE PULL/NO EXC', '11KV', 'O/EXC', '', 2.20, true),
('CABLE PULL/NO EXC', '11KV', 'DUCT', '', 2.69, true),
('CABLE PULL/NO EXC', '33KV', 'O/EXC', '', 2.75, true),
('CABLE PULL/NO EXC', '33KV', 'DUCT', '', 3.25, true),

-- EX/JHOLE and B/FILL/JH entries
('EX/JHOLE', '11KV', '', '', 350.00, true),
('B/FILL/JH', '11KV', '', '', 150.00, true),
('EX/JHOLE', '33KV', '', '', 210.00, true),
('B/FILL/JH', '33KV', '', '', 150.00, true);