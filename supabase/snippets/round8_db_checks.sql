-- Round 8 database checks. Raises 'ROLLBACK-RESULT: {...}' at the end, so everything written
-- is rolled back. Writes only this build's audit_/kit_ tables; employees and vehicles are
-- only read (row hashes compared before and after).
-- 1. "Label on? = N" is a fail (ben smith, 05 Nov, site "feerg"); Edit audit N -> Y clears it.
-- 2. A fully filled audit for ben smith is written to his record, and what the next audit
--    pre-fills from is still there after that audit is deleted.
DO $$
DECLARE
  ben uuid := '298386e4-bd6d-48bb-9ccb-6a3201628a5c';
  neil uuid := '51d945fc-dc05-46f0-9375-ae2c4bef546f';
  emp_before text; emp_after text; veh_before text; veh_after text;
  au uuid; lw uuid; r jsonb := '{}';
  t_dig uuid; t_saw uuid; t_trl uuid; c_hat uuid; c_water uuid; c_hivis uuid; c_aid uuid;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"sub":"16945ad1-7227-4cb1-b8ac-18b576913fc0","role":"authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);
  SELECT md5(string_agg(t::text, '' ORDER BY id)) INTO emp_before FROM public.employees t;
  SELECT md5(string_agg(t::text, '' ORDER BY id)) INTO veh_before FROM public.vehicles t;
  SELECT id INTO t_dig FROM public.kit_types WHERE name = 'Digger';
  SELECT id INTO t_saw FROM public.kit_types WHERE name = 'STIHL saw';
  SELECT id INTO t_trl FROM public.kit_types WHERE name = 'Trailer';
  SELECT id INTO c_hat FROM public.audit_checklist_items WHERE name = 'Hard hats';
  SELECT id INTO c_hivis FROM public.audit_checklist_items WHERE name = 'Hi vis';
  SELECT id INTO c_water FROM public.audit_checklist_items WHERE name = 'Water containers';
  SELECT id INTO c_aid FROM public.audit_checklist_items WHERE section = 'hs' ORDER BY sort_order LIMIT 1;

  INSERT INTO public.audit_site_audits (audit_date, audited_by_name, ganger_id, ganger_name_snapshot, team_name_snapshot, site_visited, status, is_test, auditor_id, auditor_name, holder_employee_id)
    VALUES ('2026-11-05', 'Neil Foster', ben, 'ben smith', 'ben smith', 'feerg', 'draft', true, neil, 'Neil Foster', ben) RETURNING id INTO au;
  INSERT INTO public.audit_lines (audit_id, section, kit_type_id, item_name, result, sort_order) VALUES (au, 'kit', t_dig, 'Digger', 'Y', 1);
  INSERT INTO public.audit_lines (audit_id, section, kit_type_id, item_name, result, plant_no_snapshot, service_date, expiry_date, sort_order) VALUES (au, 'kit', t_saw, 'STIHL saw', 'Y', 'ZZT-S1', '2026-10-01', '2027-10-01', 2);
  INSERT INTO public.audit_lines (audit_id, section, kit_type_id, item_name, result, sort_order) VALUES (au, 'kit', t_trl, 'Trailer', 'not_carried', 3);
  INSERT INTO public.audit_lines (audit_id, section, checklist_item_id, item_name, result, qty, service_date, expiry_date, sort_order) VALUES (au, 'ppe', c_hat, 'Hard hats', 'Y', '2', '2026-10-26', '2029-10-26', 4);
  INSERT INTO public.audit_lines (audit_id, section, checklist_item_id, item_name, result, qty, sort_order) VALUES (au, 'ppe', c_hivis, 'Hi vis', 'Y', '3', 5);
  INSERT INTO public.audit_lines (audit_id, section, checklist_item_id, item_name, result, qty, sort_order) VALUES (au, 'hs', c_aid, 'First aid', 'Y', '1', 6);
  INSERT INTO public.audit_lines (audit_id, section, checklist_item_id, item_name, result, qty, label_on, sort_order) VALUES (au, 'other', c_water, 'Water containers', 'Y', '1', 'N', 7) RETURNING id INTO lw;
  PERFORM public.audit_submit(au);
  r := r || jsonb_build_object('1_feerg_fail_count_label_N', (SELECT fail_count FROM public.audit_site_audit_summary WHERE id = au));
  PERFORM public.audit_edit(au, jsonb_build_array(jsonb_build_object('line_id', lw, 'field', 'label_on', 'to', 'Y')), neil);
  r := r || jsonb_build_object('1_fail_count_after_edit_N_to_Y', (SELECT fail_count FROM public.audit_site_audit_summary WHERE id = au));
  PERFORM public.audit_edit(au, jsonb_build_array(jsonb_build_object('line_id', lw, 'field', 'label_on', 'to', 'N')), neil);

  -- what the next audit for ben smith reads (loadHolderRecord), after deleting this audit
  PERFORM public.audit_delete(au, 'check', neil);
  r := r || jsonb_build_object(
    '2_next_audit_kit', (SELECT jsonb_agg(type_name || ' ' || coalesce(plant_no, '(no plant no)') || ' svc=' || coalesce(service_date::text, '-') || ' exp=' || coalesce(expiry_date::text, '-') ORDER BY type_sort) FROM public.kit_items_overview WHERE status = 'on_van' AND holder_employee_id = ben),
    '2_next_audit_not_carried', (SELECT string_agg(t.name, ', ') FROM public.kit_van_kit_list l JOIN public.kit_types t ON t.id = l.kit_type_id WHERE l.holder_employee_id = ben AND NOT l.carried AND t.id IN (t_dig, t_saw, t_trl)),
    '2_next_audit_ppe_expiry', (SELECT jsonb_agg(item_name || ' exp=' || coalesce(expiry_date::text, '-')) FROM public.audit_ppe_items WHERE holder_employee_id = ben AND checklist_item_id IN (c_hat, c_hivis)),
    '2_next_audit_answers', (SELECT jsonb_agg(i.name || ' qty=' || coalesce(a.qty, '-') || ' date=' || coalesce(a.service_date::text, '-') || ' label=' || coalesce(a.label_on, '-') ORDER BY i.section, i.sort_order)
      FROM public.audit_holder_answers a JOIN public.audit_checklist_items i ON i.id = a.checklist_item_id WHERE a.holder_employee_id = ben));

  SELECT md5(string_agg(t::text, '' ORDER BY id)) INTO emp_after FROM public.employees t;
  SELECT md5(string_agg(t::text, '' ORDER BY id)) INTO veh_after FROM public.vehicles t;
  r := r || jsonb_build_object('employees_unchanged', emp_before = emp_after, 'vehicles_unchanged', veh_before = veh_after);
  RAISE EXCEPTION 'ROLLBACK-RESULT: %', r;
END $$;
