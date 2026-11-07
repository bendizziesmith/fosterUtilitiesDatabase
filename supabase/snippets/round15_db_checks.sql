-- Round 15 database checks (run after 20261106190000_round15_hs_dated_lockup.sql). Raises
-- 'ROLLBACK-RESULT: {...}' at the end, so everything written is rolled back. Every row written is
-- test-marked and in this build's audit_ / kit_ tables; employees / vehicles are only read (hash checked).
--  1. Dates required for the 4 in Add to lockup; other items need none.
--  2. Separate lines by expiry; the same expiry adds to that line; a new line gets the item's "Low at".
--  3. Issue copies the line's dates to the person (fire extinguisher: date tested too).
--  4. Return asks for dates and goes on the line with that expiry; holdings add up all lines.
--  5. Update sheet: fire extinguisher Tested / Replaced, eye wash Replaced; history 'tested' / 'replaced'.
DO $$
DECLARE
  dom uuid := '78288c40-3b7b-4906-b2b4-a3398ff32be4';
  neil uuid := '51d945fc-dc05-46f0-9375-ae2c4bef546f';
  emp_before text; emp_after text; veh_before text; veh_after text;
  c_eye uuid; c_fire uuid; c_plain uuid;
  l_new uuid; l_old uuid; l_again uuid; l_ret uuid; l_fire uuid; p1 uuid; p2 uuid; ppe uuid;
  n int; d date; t text; r jsonb := '{}';
BEGIN
  PERFORM set_config('request.jwt.claims', '{"sub":"16945ad1-7227-4cb1-b8ac-18b576913fc0","role":"authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);
  SELECT md5(string_agg(x::text, '' ORDER BY id)) INTO emp_before FROM public.employees x;
  SELECT md5(string_agg(x::text, '' ORDER BY id)) INTO veh_before FROM public.vehicles x;
  SELECT id INTO c_eye FROM public.audit_checklist_items WHERE section = 'hs' AND name = 'Eye wash';
  SELECT id INTO c_fire FROM public.audit_checklist_items WHERE section = 'hs' AND name = 'Fire ext 2KG dry powder';
  SELECT id INTO c_plain FROM public.audit_checklist_items WHERE section = 'hs' AND name = 'Spill kit';
  r := r || jsonb_build_object('0_kinds', jsonb_build_object('eye', public.kit_hs_date_kind(c_eye), 'fire', public.kit_hs_date_kind(c_fire), 'spill', public.kit_hs_date_kind(c_plain)));

  -- 1. required dates
  BEGIN PERFORM public.kit_lockup_add('hs', c_eye, NULL, 1, NULL, true, neil, NULL, NULL); r := r || '{"1_eye_no_expiry":"allowed"}';
  EXCEPTION WHEN others THEN r := r || jsonb_build_object('1_eye_no_expiry', 'REFUSED: ' || SQLERRM); END;
  BEGIN PERFORM public.kit_lockup_add('hs', c_fire, NULL, 1, NULL, true, neil, NULL, '2027-11-06'); r := r || '{"1_fire_no_tested":"allowed"}';
  EXCEPTION WHEN others THEN r := r || jsonb_build_object('1_fire_no_tested', 'REFUSED: ' || SQLERRM); END;
  BEGIN PERFORM public.kit_lockup_add('hs', c_eye, NULL, 1, NULL, true, neil); r := r || '{"1_old_call_eye":"allowed"}';
  EXCEPTION WHEN others THEN r := r || jsonb_build_object('1_old_call_eye', 'REFUSED: ' || SQLERRM); END;
  p1 := public.kit_lockup_add('hs', c_plain, NULL, 1, NULL, true, neil, NULL, NULL);
  p2 := public.kit_lockup_add('hs', c_plain, NULL, 2, NULL, true, neil);
  r := r || jsonb_build_object('1_spill_kit_one_line', p1 = p2, '1_spill_kit_qty', (SELECT quantity FROM public.kit_lockup_stock WHERE id = p1));

  -- 2. lines by expiry
  l_new := public.kit_lockup_add('hs', c_eye, NULL, 6, NULL, true, neil, NULL, '2028-03-01');
  UPDATE public.kit_lockup_stock SET low_at = 5 WHERE id = l_new;
  l_old := public.kit_lockup_add('hs', c_eye, NULL, 4, NULL, true, neil, '2026-01-01', '2027-01-15');
  l_again := public.kit_lockup_add('hs', c_eye, NULL, 2, NULL, true, neil, NULL, '2028-03-01');
  SELECT count(*) INTO n FROM public.kit_lockup_stock WHERE checklist_item_id = c_eye AND is_test;
  r := r || jsonb_build_object('2_eye_lines', n, '2_same_expiry_same_line', l_again = l_new,
    '2_line_qtys', (SELECT jsonb_object_agg(expiry_date, quantity) FROM public.kit_lockup_stock WHERE checklist_item_id = c_eye AND is_test),
    '2_new_line_low_at_copied', (SELECT low_at FROM public.kit_lockup_stock WHERE id = l_old),
    '2_eye_no_tested_date', (SELECT tested_date FROM public.kit_lockup_stock WHERE id = l_old),
    '2_overview', (SELECT jsonb_agg(jsonb_build_object('qty', quantity, 'expiry', expiry_date, 'kind', date_kind) ORDER BY expiry_date) FROM public.kit_lockup_overview WHERE checklist_item_id = c_eye AND is_test));

  -- 3. issue copies dates
  PERFORM public.kit_lockup_issue(l_old, dom, 1, NULL, NULL, neil);
  SELECT id, expiry_date INTO ppe, d FROM public.audit_ppe_items WHERE holder_employee_id = dom AND checklist_item_id = c_eye;
  SELECT note INTO t FROM public.kit_history WHERE ppe_item_id = ppe ORDER BY created_at DESC LIMIT 1;
  r := r || jsonb_build_object('3_dom_eye_expiry', d, '3_history', t,
    '3_history_action', (SELECT action FROM public.kit_history WHERE ppe_item_id = ppe ORDER BY created_at DESC LIMIT 1));
  l_fire := public.kit_lockup_add('hs', c_fire, NULL, 2, NULL, true, neil, '2026-11-06', '2027-11-06');
  PERFORM public.kit_lockup_issue(l_fire, dom, 1, NULL, NULL, neil);
  r := r || jsonb_build_object(
    '3_dom_fire_expiry', (SELECT expiry_date FROM public.audit_ppe_items WHERE holder_employee_id = dom AND checklist_item_id = c_fire),
    '3_dom_fire_date_tested', (SELECT service_date FROM public.audit_holder_answers WHERE holder_employee_id = dom AND checklist_item_id = c_fire),
    '3_fire_history', (SELECT h.note FROM public.kit_history h JOIN public.audit_ppe_items p ON p.id = h.ppe_item_id
                        WHERE p.holder_employee_id = dom AND p.checklist_item_id = c_fire ORDER BY h.created_at DESC LIMIT 1));

  -- 4. return with dates; holdings add up all lines
  PERFORM public.kit_lockup_issue(l_new, dom, 1, NULL, NULL, neil);
  r := r || jsonb_build_object('4_dom_holds_eye', (SELECT quantity_held FROM public.kit_lockup_person_issues WHERE employee_id = dom AND checklist_item_id = c_eye AND is_test));
  BEGIN PERFORM public.kit_lockup_return_dated(l_new, dom, 1, NULL, NULL, NULL, neil); r := r || '{"4_return_no_dates":"allowed"}';
  EXCEPTION WHEN others THEN r := r || jsonb_build_object('4_return_no_dates', 'REFUSED: ' || SQLERRM); END;
  PERFORM public.kit_lockup_return_dated(l_new, dom, 2, NULL, '2029-05-01', 'back from van', neil);
  SELECT id INTO l_ret FROM public.kit_lockup_stock WHERE checklist_item_id = c_eye AND is_test AND expiry_date = '2029-05-01';
  r := r || jsonb_build_object('4_returned_to_new_line_qty', (SELECT quantity FROM public.kit_lockup_stock WHERE id = l_ret),
    '4_dom_holds_eye_after', (SELECT quantity_held FROM public.kit_lockup_person_issues WHERE employee_id = dom AND checklist_item_id = c_eye AND is_test));
  BEGIN PERFORM public.kit_lockup_return_dated(l_new, dom, 1, NULL, '2029-05-01', NULL, neil); r := r || '{"4_return_more_than_held":"allowed"}';
  EXCEPTION WHEN others THEN r := r || jsonb_build_object('4_return_more_than_held', 'REFUSED: ' || SQLERRM); END;

  -- 5. Update sheet
  SELECT id INTO ppe FROM public.audit_ppe_items WHERE holder_employee_id = dom AND checklist_item_id = c_fire;
  PERFORM public.audit_update_hs(ppe, 'tested', '2026-12-01', '2027-12-01', NULL, 'gauge fine', neil);
  r := r || jsonb_build_object('5_tested',
    jsonb_build_object('expiry', (SELECT expiry_date FROM public.audit_ppe_items WHERE id = ppe),
      'date_tested', (SELECT service_date FROM public.audit_holder_answers WHERE holder_employee_id = dom AND checklist_item_id = c_fire),
      'history', (SELECT action || ': ' || note FROM public.kit_history WHERE ppe_item_id = ppe ORDER BY created_at DESC LIMIT 1)));
  PERFORM public.audit_update_hs(ppe, 'replaced', '2027-01-10', '2028-01-10', NULL, NULL, neil);
  r := r || jsonb_build_object('5_fire_replaced', (SELECT action || ': ' || note FROM public.kit_history WHERE ppe_item_id = ppe ORDER BY created_at DESC LIMIT 1));
  BEGIN PERFORM public.audit_update_hs(ppe, 'tested', NULL, '2028-01-10', NULL, NULL, neil); r := r || '{"5_tested_without_date":"allowed"}';
  EXCEPTION WHEN others THEN r := r || jsonb_build_object('5_tested_without_date', 'REFUSED: ' || SQLERRM); END;
  SELECT id INTO ppe FROM public.audit_ppe_items WHERE holder_employee_id = dom AND checklist_item_id = c_eye;
  PERFORM public.audit_update_hs(ppe, 'replaced', '2026-11-06', '2028-06-01', NULL, NULL, neil);
  r := r || jsonb_build_object('5_eye_replaced', (SELECT action || ': ' || note || ' / tested=' || coalesce(new_values ->> 'tested_date', 'none') FROM public.kit_history WHERE ppe_item_id = ppe ORDER BY created_at DESC LIMIT 1),
    '5_eye_expiry', (SELECT expiry_date FROM public.audit_ppe_items WHERE id = ppe));
  BEGIN PERFORM public.audit_update_hs(ppe, 'tested', '2026-11-06', '2028-06-01', NULL, NULL, neil); r := r || '{"5_eye_tested":"allowed"}';
  EXCEPTION WHEN others THEN r := r || jsonb_build_object('5_eye_tested', 'REFUSED: ' || SQLERRM); END;

  SELECT md5(string_agg(x::text, '' ORDER BY id)) INTO emp_after FROM public.employees x;
  SELECT md5(string_agg(x::text, '' ORDER BY id)) INTO veh_after FROM public.vehicles x;
  r := r || jsonb_build_object('6_employees_unchanged', emp_before = emp_after, '6_vehicles_unchanged', veh_before = veh_after);
  RAISE EXCEPTION 'ROLLBACK-RESULT: %', r;
END $$;
