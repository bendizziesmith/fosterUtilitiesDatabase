-- Fosters | Hire database checks (run after 20261107100000_fosters_hire.sql). Raises
-- 'ROLLBACK-RESULT: {...}' at the end, so everything written is rolled back. Every audit and kit
-- item written is test-marked; employees / vehicles are only read (hash checked).
--  A. The live app's way (no Fosters / Hire on the lines): submit and edit change nothing about it.
--  B. The new way: submit copies Hire onto the kit item (existing and new); Edit audit changes it;
--     a direct change to a submitted line is still refused (the lock holds).
DO $$
DECLARE
  dom uuid := '78288c40-3b7b-4906-b2b4-a3398ff32be4';
  tnl uuid := '74d9aa6f-eb60-4ff3-9e55-1129bb31d699';
  neil uuid := '51d945fc-dc05-46f0-9375-ae2c4bef546f';
  emp_before text; emp_after text; veh_before text; veh_after text;
  t_cat uuid; t_gen uuid; k_old uuid; k_new uuid; a1 uuid; a2 uuid; l_y uuid; summary text[]; r jsonb := '{}';
BEGIN
  PERFORM set_config('request.jwt.claims', '{"sub":"16945ad1-7227-4cb1-b8ac-18b576913fc0","role":"authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);
  SELECT md5(string_agg(x::text, '' ORDER BY id)) INTO emp_before FROM public.employees x;
  SELECT md5(string_agg(x::text, '' ORDER BY id)) INTO veh_before FROM public.vehicles x;
  SELECT id INTO t_cat FROM public.kit_types WHERE name = 'CAT';
  SELECT id INTO t_gen FROM public.kit_types WHERE name = 'Genny';

  -- test kit: one already marked Hire, one Fosters
  k_old := public.kit_add_item(t_cat, 'ZZ-OLD', NULL, NULL, 'on_van', dom, NULL, NULL, NULL, true, neil, NULL);
  UPDATE public.kit_items SET ownership = 'hire' WHERE id = k_old;
  k_new := public.kit_add_item(t_gen, 'ZZ-NEW', NULL, NULL, 'on_van', dom, NULL, NULL, NULL, true, neil, NULL);
  r := r || jsonb_build_object('0_default_for_new_kit', (SELECT ownership FROM public.kit_items WHERE id = k_new));

  -- A. old-style: lines saved without Fosters / Hire, submit + edit called exactly as today
  INSERT INTO public.audit_site_audits (audit_date, audited_by_name, vehicle_id, vehicle_reg_snapshot, ganger_id, ganger_name_snapshot,
      team_name_snapshot, status, is_test, auditor_id, auditor_name, holder_employee_id)
    VALUES ('2026-11-07', 'Neil Foster', tnl, 'YE24 TNL', dom, 'Dom Oliver', 'Dom Oliver', 'draft', true, neil, 'Neil Foster', dom) RETURNING id INTO a1;
  INSERT INTO public.audit_lines (audit_id, section, kit_type_id, item_name, result, plant_no_snapshot, kit_item_id, sort_order)
    VALUES (a1, 'kit', t_cat, 'CAT', 'Y', 'ZZ-OLD', k_old, 1), (a1, 'kit', t_gen, 'Genny', 'Y', 'ZZ-A-NEW', NULL, 2);
  PERFORM public.audit_submit(a1);
  r := r || jsonb_build_object('A1_old_submit_keeps_hire_item', (SELECT ownership FROM public.kit_items WHERE id = k_old),
    'A2_old_submit_new_item_is_fosters', (SELECT ownership FROM public.kit_items WHERE plant_no = 'ZZ-A-NEW'),
    'A3_old_lines_stay_empty', (SELECT count(*) FROM public.audit_lines WHERE audit_id = a1 AND ownership IS NOT NULL));
  PERFORM public.audit_edit(a1, jsonb_build_array(jsonb_build_object('line_id', (SELECT id FROM public.audit_lines WHERE audit_id = a1 AND sort_order = 1), 'field', 'comment', 'to', 'checked')), neil);
  r := r || jsonb_build_object('A4_old_edit_keeps_hire_item', (SELECT ownership FROM public.kit_items WHERE id = k_old));

  -- B. new-style
  INSERT INTO public.audit_site_audits (audit_date, audited_by_name, vehicle_id, vehicle_reg_snapshot, ganger_id, ganger_name_snapshot,
      team_name_snapshot, status, is_test, auditor_id, auditor_name, holder_employee_id)
    VALUES ('2026-11-07', 'Neil Foster', tnl, 'YE24 TNL', dom, 'Dom Oliver', 'Dom Oliver', 'draft', true, neil, 'Neil Foster', dom) RETURNING id INTO a2;
  INSERT INTO public.audit_lines (audit_id, section, kit_type_id, item_name, result, plant_no_snapshot, kit_item_id, sort_order, ownership)
    VALUES (a2, 'kit', t_gen, 'Genny', 'Y', 'ZZ-NEW', k_new, 1, 'hire'), (a2, 'kit', t_cat, 'CAT', 'Y', 'ZZ-B-NEW', NULL, 2, 'hire');
  SELECT id INTO l_y FROM public.audit_lines WHERE audit_id = a2 AND sort_order = 1;
  PERFORM public.audit_submit(a2);
  r := r || jsonb_build_object('B1_submit_copies_hire_to_existing_item', (SELECT ownership FROM public.kit_items WHERE id = k_new),
    'B2_submit_new_item_gets_hire', (SELECT ownership FROM public.kit_items WHERE plant_no = 'ZZ-B-NEW'));
  -- the edit and the reads are separate statements (one statement only sees the data as it was when it started)
  summary := public.audit_edit(a2, jsonb_build_array(jsonb_build_object('line_id', l_y, 'field', 'ownership', 'to', 'fosters')), neil);
  r := r || jsonb_build_object('B3_edit_summary', summary,
    'B4_edit_updates_item', (SELECT ownership FROM public.kit_items WHERE id = k_new),
    'B5_edit_updates_line', (SELECT ownership FROM public.audit_lines WHERE id = l_y));
  BEGIN PERFORM public.audit_edit(a2, jsonb_build_array(jsonb_build_object('line_id', l_y, 'field', 'ownership', 'to', 'rented')), neil); r := r || '{"B6_bad_value":"allowed"}';
  EXCEPTION WHEN others THEN r := r || jsonb_build_object('B6_bad_value', 'REFUSED: ' || SQLERRM); END;
  BEGIN UPDATE public.audit_lines SET ownership = 'hire' WHERE id = l_y; r := r || '{"B7_direct_change_to_submitted_line":"allowed"}';
  EXCEPTION WHEN others THEN r := r || jsonb_build_object('B7_direct_change_to_submitted_line', 'REFUSED: ' || SQLERRM); END;

  SELECT md5(string_agg(x::text, '' ORDER BY id)) INTO emp_after FROM public.employees x;
  SELECT md5(string_agg(x::text, '' ORDER BY id)) INTO veh_after FROM public.vehicles x;
  r := r || jsonb_build_object('C_employees_unchanged', emp_before = emp_after, 'C_vehicles_unchanged', veh_before = veh_after);
  RAISE EXCEPTION 'ROLLBACK-RESULT: %', r;
END $$;
