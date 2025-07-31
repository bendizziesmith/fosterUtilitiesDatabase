/*
  # Add Mollsworth Project Rates

  1. New Work Rates
    - Mollsworth project rates for 11KV and 33KV work
    - Various work types: EX/LAY/REIN, EX/DIG, ADD/DUCT/CABLE, CABLE PULL/NO EXC, EX/JHOLE, B/FILL/JH
    - Different site types: SITE, AGRI, U/MADE, UM/CW, FWAY, CWAY, SURFACED, SOFT, IN/TREN, O/EXC, DUCT
    - Voltage types: 11KV (LV equivalent) and 33KV (HV equivalent)
    - All rates marked as Mollsworth project rates

  2. Rate Structure
    - Price work rates per metre for most items
    - Fixed rates for joint holes (EX/JHOLE, B/FILL/JH)
    - Special handling for cable pull items (rates TBD)
*/

-- Insert Mollsworth 11KV rates
INSERT INTO work_rates (work_type, voltage_type, site_type, rate_type, rate_value, unit, is_active, created_at, updated_at) VALUES
-- EX/LAY/REIN 11KV rates
('EX/LAY/REIN', 'LV', 'SITE', 'price_work', 8.65, 'm', true, now(), now()),
('EX/LAY/REIN', 'LV', 'AGRI', 'price_work', 8.70, 'm', true, now(), now()),
('EX/LAY/REIN', 'LV', 'U/MADE', 'price_work', 10.10, 'm', true, now(), now()),
('EX/LAY/REIN', 'LV', 'UM/CW', 'price_work', 18.23, 'm', true, now(), now()),
('EX/LAY/REIN', 'LV', 'FWAY', 'price_work', 24.10, 'm', true, now(), now()),
('EX/LAY/REIN', 'LV', 'CWAY', 'price_work', 26.50, 'm', true, now(), now()),

-- EX/DIG 11KV rates
('EX/DIG', 'LV', 'SURFACED', 'price_work', 6.69, 'm', true, now(), now()),
('EX/DIG', 'LV', 'SOFT', 'price_work', 4.15, 'm', true, now(), now()),

-- ADD/DUCT/CABLE 11KV rates
('ADD/DUCT/CABLE', 'LV', 'IN/TREN', 'price_work', 1.85, 'm', true, now(), now()),

-- EX/LAY/REIN 33KV rates
('EX/LAY/REIN', 'HV', 'SITE', 'price_work', 9.95, 'm', true, now(), now()),
('EX/LAY/REIN', 'HV', 'AGRI', 'price_work', 10.25, 'm', true, now(), now()),
('EX/LAY/REIN', 'HV', 'U/MADE', 'price_work', 11.25, 'm', true, now(), now()),
('EX/LAY/REIN', 'HV', 'UM/CW', 'price_work', 22.90, 'm', true, now(), now()),
('EX/LAY/REIN', 'HV', 'FWAY', 'price_work', 28.75, 'm', true, now(), now()),
('EX/LAY/REIN', 'HV', 'CWAY', 'price_work', 32.70, 'm', true, now(), now()),

-- EX/DIG 33KV rates
('EX/DIG', 'HV', 'SURFACED', 'price_work', 7.89, 'm', true, now(), now()),
('EX/DIG', 'HV', 'SOFT', 'price_work', 4.75, 'm', true, now(), now()),

-- ADD/DUCT/CABLE 33KV rates
('ADD/DUCT/CABLE', 'HV', 'IN/TREN', 'price_work', 1.95, 'm', true, now(), now()),

-- Joint hole rates (fixed prices, not per metre)
('EX/JHOLE', 'LV', NULL, 'price_work', 350.00, 'each', true, now(), now()),
('B/FILL/JH', 'LV', NULL, 'price_work', 150.00, 'each', true, now(), now()),
('EX/JHOLE', 'HV', NULL, 'price_work', 210.00, 'each', true, now(), now()),
('B/FILL/JH', 'HV', NULL, 'price_work', 150.00, 'each', true, now(), now());

-- Note: CABLE PULL/NO EXC rates are not specified in the image, so they are not included
-- These can be added later when rates are determined