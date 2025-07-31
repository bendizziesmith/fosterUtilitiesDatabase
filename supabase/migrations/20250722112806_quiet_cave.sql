/*
  # Update Mollsworth Work Rates with Exact Data

  1. Database Changes
    - Clear all existing mollsworth_work_rates data
    - Insert only the 26 specific rates provided
    - Maintain exact order as specified
    - Handle NULL values for rates without pricing

  2. Data Structure
    - 26 total rates (18 with prices, 8 without)
    - 11KV and 33KV voltage types
    - Various work items and site conditions
    - Exact order preservation
*/

-- Clear all existing data
DELETE FROM mollsworth_work_rates WHERE is_active = true;

-- Insert the exact 26 rates in the specified order
INSERT INTO mollsworth_work_rates (col1_work_item, col2_param, col3_param, col4_param, rate_gbp) VALUES
('EX/LAY/REIN', '11KV', '-', 'SITE', 8.65),
('EX/LAY/REIN', '11KV', '-', 'AGRI', 8.70),
('EX/LAY/REIN', '11KV', '-', 'U/MADE', 10.10),
('EX/LAY/REIN', '11KV', '-', 'UM/CW', 18.23),
('EX/LAY/REIN', '11KV', '-', 'FWAY', 24.10),
('EX/LAY/REIN', '11KV', '-', 'CWAY', 26.50),
('EX/DIG (FW/CW)', '11KV', '-', 'SURFACED', 6.69),
('EX/DIG', '11KV', '-', 'SOFT', 4.15),
('ADD/DUCT/CABLE', '11KV', 'NO/EXC', 'IN/TREN', 1.85),
('EX/LAY/REIN', '33KV', '-', 'SITE', 9.95),
('EX/LAY/REIN', '33KV', '-', 'AGRI', 10.25),
('EX/LAY/REIN', '33KV', '-', 'U/MADE', 11.25),
('EX/LAY/REIN', '33KV', '-', 'UM/CW', 22.90),
('EX/LAY/REIN', '33KV', '-', 'FWAY', 28.75),
('EX/LAY/REIN', '33KV', '-', 'CWAY', 32.70),
('EX/DIG/S (FW/CW)', '33KV', '-', 'SURFACED', 7.89),
('EX/DIG', '33KV', '-', 'SOFT', 4.75),
('ADD/DUCT/CABLE', '33KV', 'NO/EXC', 'IN/TREN', 1.95),
('CABLE PULL/NO EXC', '11KV', 'O/EXC', '-', NULL),
('CABLE PULL/NO EXC', '11KV', 'DUCT', '-', NULL),
('CABLE PULL/NO EXC', '33KV', 'O/EXC', '-', NULL),
('CABLE PULL/NO EXC', '33KV', 'DUCT', '-', NULL),
('EX/JHOLE', '11KV', '-', '-', 350.00),
('B/FILL/JH', '11KV', '-', '-', 150.00),
('EX/JHOLE', '33KV', '-', '-', 210.00),
('B/FILL/JH', '33KV', '-', '-', 150.00);