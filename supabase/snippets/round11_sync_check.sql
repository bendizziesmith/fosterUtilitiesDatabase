-- Round 11: the two-way sync between audits and Kit & Plant. Raises 'ROLLBACK-RESULT: {...}', so
-- everything written is rolled back; test-marked; writes only this build's audit_ / kit_ tables.
-- A. audit → record: kit dates (CAT and Genny separate), PPE date on hat, the four dated H&S items;
--    submitted with no photos (photos are optional).
-- B. Kit & Plant → next audit: Update (Genny re-serviced, first aid kit new expiry), Swap (CAT for a
--    Yard Lockup spare); then what the next audit pre-fills from.
DO $$
DECLARE
  dom uuid := '78288c40-3b7b-4906-b2b4-a3398ff32be4';
  tnl uuid := '74d9aa6f-eb60-4ff3-9e55-1129bb31d699';
  neil uuid := '51d945fc-dc05-46f0-9375-ae2c4bef546f';
  emp_before text; emp_after text; veh_before text; veh_after text;
  au uuid; r jsonb := '{}';
  t_cat uuid; t_gen uuid; c_hat uuid; c_aid uuid; c_eye uuid; c_burn uuid; c_fire uuid;
  cat_item uuid; gen_item uuid; aid_ppe uuid; spare uuid;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"sub":"16945ad1-7227-4cb1-b8ac-18b576913fc0","role":"authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);
  SELECT md5(string_agg(t::text, '' ORDER BY id)) INTO emp_before FROM public.employees t;
  SELECT md5(string_agg(t::text, '' ORDER BY id)) INTO veh_before FROM public.vehicles t;
  SELECT id INTO t_cat FROM public.kit_types WHERE name = 'CAT';
  SELECT id INTO t_gen FROM public.kit_types WHERE name = 'Genny';
  SELECT id INTO c_hat FROM public.audit_checklist_items WHERE name = 'Hard hats';
  SELECT id INTO c_aid FROM public.audit_checklist_items WHERE name = 'First aid kit';
  SELECT id INTO c_eye FROM public.audit_checklist_items WHERE name = 'Eye wash';
  SELECT id INTO c_burn FROM public.audit_checklist_items WHERE name = 'Burns kit';
  SELECT id INTO c_fire FROM public.audit_checklist_items WHERE name = 'Fire ext 2KG dry powder';

  INSERT INTO public.audit_site_audits (audit_date, audited_by_name, vehicle_id, vehicle_reg_snapshot, ganger_id, ganger_name_snapshot,
      team_name_snapshot, status, is_test, auditor_id, auditor_name, holder_employee_id)
    VALUES ('2026-11-06', 'Neil Foster', tnl, 'YE24 TNL', dom, 'Dom Oliver', 'Dom Oliver', 'draft', true, neil, 'Neil Foster', dom) RETURNING id INTO au;
  INSERT INTO public.audit_lines (audit_id, section, kit_type_id, item_name, result, plant_no_snapshot, service_date, expiry_date, sort_order) VALUES
    (au, 'kit', t_cat, 'CAT', 'Y', 'ZZT-C1', '2026-01-10', '2027-01-10', 1),
    (au, 'kit', t_gen, 'Genny', 'Y', 'ZZT-G1', '2026-02-10', '2027-02-10', 2);
  INSERT INTO public.audit_lines (audit_id, section, checklist_item_id, item_name, result, qty, service_date, expiry_date, gauge, sort_order) VALUES
    (au, 'ppe', c_hat, 'Hard hats', 'Y', '2', '2026-10-26', '2029-10-26', null, 3),
    (au, 'hs', c_aid, 'First aid kit', 'Y', '1', null, '2027-03-01', null, 4),
    (au, 'hs', c_eye, 'Eye wash', 'Y', '1', null, '2027-04-01', null, 5),
    (au, 'hs', c_burn, 'Burns kit', 'Y', '1', null, '2027-05-01', null, 6),
    (au, 'hs', c_fire, 'Fire ext 2KG dry powder', 'Y', '1', '2026-06-01', '2027-06-01', 'green', 7);
  PERFORM public.audit_submit(au);
  SELECT id INTO cat_item FROM public.kit_items WHERE plant_no = 'ZZT-C1';
  SELECT id INTO gen_item FROM public.kit_items WHERE plant_no = 'ZZT-G1';
  SELECT id INTO aid_ppe FROM public.audit_ppe_items WHERE holder_employee_id = dom AND checklist_item_id = c_aid;
  r := r || jsonb_build_object('A_submitted_without_photos', (SELECT status FROM public.audit_site_audits WHERE id = au),
    'A_record_kit', (SELECT jsonb_agg(type_name || ' ' || plant_no || ' svc ' || service_date || ' exp ' || expiry_date || ' · ' || holder_name ORDER BY type_sort) FROM public.kit_items_overview WHERE id IN (cat_item, gen_item)),
    'A_record_dates', (SELECT jsonb_agg(item_name || ' exp ' || expiry_date ORDER BY item_name) FROM public.audit_ppe_items WHERE holder_employee_id = dom AND checklist_item_id IN (c_hat, c_aid, c_eye, c_burn, c_fire)),
    'A_record_answers', (SELECT jsonb_agg(i.name || ' date ' || coalesce(a.service_date::text, '-') || ' qty ' || coalesce(a.qty, '-') ORDER BY i.name) FROM public.audit_holder_answers a JOIN public.audit_checklist_items i ON i.id = a.checklist_item_id WHERE a.holder_employee_id = dom AND a.checklist_item_id IN (c_hat, c_fire)));

  PERFORM public.kit_update_item(gen_item, 'reserviced', '2026-11-06', '2027-11-06', null, null, 'Re-serviced', neil);
  PERFORM public.audit_update_ppe(aid_ppe, '2028-01-31', null, 'New kit', neil);
  spare := public.kit_add_item(t_cat, 'ZZT-C9', '2026-11-01', '2027-11-01', 'spare', null, null, null, 'test', true, neil, null);
  PERFORM public.kit_swap(cat_item, 'away_for_service', null, null, 'Hire Co', 'spare', spare, null, null, null, null, neil);
  r := r || jsonb_build_object(
    'B_next_audit_kit', (SELECT jsonb_agg(type_name || ' ' || plant_no || ' svc ' || service_date || ' exp ' || expiry_date ORDER BY type_sort, plant_no) FROM public.kit_items_overview WHERE status = 'on_van' AND holder_employee_id = dom AND plant_no LIKE 'ZZT-%'),
    'B_old_CAT_now', (SELECT status || ' ' || coalesce(service_company, '') FROM public.kit_items WHERE id = cat_item),
    'B_next_audit_first_aid', (SELECT expiry_date::text FROM public.audit_ppe_items WHERE id = aid_ppe));

  SELECT md5(string_agg(t::text, '' ORDER BY id)) INTO emp_after FROM public.employees t;
  SELECT md5(string_agg(t::text, '' ORDER BY id)) INTO veh_after FROM public.vehicles t;
  r := r || jsonb_build_object('employees_unchanged', emp_before = emp_after, 'vehicles_unchanged', veh_before = veh_after);
  RAISE EXCEPTION 'ROLLBACK-RESULT: %', r;
END $$;
