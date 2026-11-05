-- Round 6 database checks. Each block raises 'ROLLBACK-RESULT: {...}' at the end, so
-- everything it writes is rolled back. Only this build's audit_/kit_ tables are written;
-- employees and vehicles are only read (their row hashes are compared before and after).
-- Runs as the admin user. Uses Dom Oliver / YE24 TNL, Phil Hall (no van) and spare vans
-- WV72 OZL and OW72 SGV. All kit made here is is_test with plant no starting ZZT-.

-- 1. Take out of van; person deleted (simulated as ON DELETE SET NULL on our tables);
--    van unassigned in Employee Management.
DO $$
DECLARE
  dom uuid := '78288c40-3b7b-4906-b2b4-a3398ff32be4';
  phil uuid := '1258edb9-3bd0-4b91-83b9-6f0fec2d79c6';
  tnl uuid := '74d9aa6f-eb60-4ff3-9e55-1129bb31d699';
  ozl uuid := '13ec8f25-008a-411e-9362-1fad2a538ce5';
  neil uuid := '51d945fc-dc05-46f0-9375-ae2c4bef546f';
  digger uuid := 'b0884b59-9d65-413c-9da9-2383a8c17874';
  trailer uuid := '40fa445f-2def-4d78-aebe-03ffb529c984';
  hivis uuid := 'a346776f-49c2-4298-9b35-03e6466e65d1';
  emp_before text; emp_after text; veh_before text; veh_after text;
  i1 uuid; i2 uuid; i3 uuid; i4 uuid; n int; r jsonb := '{}'; ok boolean;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"sub":"16945ad1-7227-4cb1-b8ac-18b576913fc0","role":"authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);
  SELECT md5(string_agg(t::text, '' ORDER BY id)) INTO emp_before FROM public.employees t;
  SELECT md5(string_agg(t::text, '' ORDER BY id)) INTO veh_before FROM public.vehicles t;

  i1 := public.kit_add_item(digger, 'ZZT-DIG', null, null, 'on_van', dom, null, null, 'test', true, neil, null);
  INSERT INTO public.audit_ppe_items (holder_employee_id, checklist_item_id, item_name, expiry_date, source, is_test)
    VALUES (dom, hivis, 'Hi vis', '2027-03-01', 'update', true);
  PERFORM public.kit_set_carried(dom, null, trailer, false, true);
  n := public.kit_take_out_of_van(dom, tnl, null, true, neil);
  SELECT holder_employee_id IS NULL AND vehicle_id = tnl INTO ok FROM public.kit_items WHERE id = i1;
  r := r || jsonb_build_object('A_moved', n, 'A_kit_on_TNL_spare', ok,
    'A_overview', (SELECT holder_kind || ' ' || coalesce(holder_reg,'') FROM public.kit_items_overview WHERE id = i1),
    'A_ppe_on_TNL', (SELECT count(*) FROM public.audit_ppe_items WHERE holder_employee_id IS NULL AND vehicle_id = tnl AND checklist_item_id = hivis AND expiry_date = '2027-03-01'),
    'A_not_carried_on_TNL', (SELECT count(*) FROM public.kit_van_kit_list WHERE holder_employee_id IS NULL AND vehicle_id = tnl AND kit_type_id = trailer AND NOT carried),
    'A_left_with_Dom', (SELECT count(*) FROM public.kit_items WHERE holder_employee_id = dom) + (SELECT count(*) FROM public.audit_ppe_items WHERE holder_employee_id = dom) + (SELECT count(*) FROM public.kit_van_kit_list WHERE holder_employee_id = dom),
    'A_log', (SELECT actor_name || ' | ' || note FROM public.kit_history WHERE kit_item_id = i1 AND action = 'assigned' ORDER BY created_at DESC LIMIT 1));
  BEGIN
    PERFORM public.kit_take_out_of_van(dom, tnl, null, true, null);
    r := r || '{"A_no_name_refused":false}';
  EXCEPTION WHEN others THEN r := r || jsonb_build_object('A_no_name_refused', SQLERRM);
  END;

  UPDATE public.kit_person_vans SET vehicle_id = ozl, updated_at = now() WHERE employee_id = phil;
  IF NOT FOUND THEN INSERT INTO public.kit_person_vans (employee_id, vehicle_id, is_test) VALUES (phil, ozl, true); END IF;
  i2 := public.kit_add_item(digger, 'ZZT-DIG2', null, null, 'on_van', phil, null, null, 'test', true, neil, null);
  INSERT INTO public.audit_ppe_items (holder_employee_id, checklist_item_id, item_name, source, is_test)
    VALUES (phil, hivis, 'Hi vis', 'update', true);
  UPDATE public.kit_person_vans SET employee_id = NULL WHERE employee_id = phil;
  UPDATE public.kit_items SET holder_employee_id = NULL WHERE id = i2;
  UPDATE public.audit_ppe_items SET holder_employee_id = NULL WHERE holder_employee_id = phil;
  r := r || jsonb_build_object(
    'B_ref_kept', (SELECT count(*) FROM public.kit_person_vans WHERE employee_ref = phil AND employee_id IS NULL),
    'B_kit_to_last_van', (SELECT vehicle_id = ozl FROM public.kit_items WHERE id = i2),
    'B_overview', (SELECT holder_kind || ' ' || coalesce(holder_reg,'') FROM public.kit_items_overview WHERE id = i2),
    'B_ppe_to_last_van', (SELECT count(*) FROM public.audit_ppe_items WHERE vehicle_id = ozl AND holder_employee_id IS NULL AND checklist_item_id = hivis));
  i3 := public.kit_add_item(trailer, 'ZZT-TRL', null, null, 'on_van', dom, null, null, 'test', true, neil, null);
  UPDATE public.kit_person_vans SET vehicle_id = NULL WHERE employee_ref = dom;
  UPDATE public.kit_items SET holder_employee_id = NULL WHERE id = i3;
  r := r || jsonb_build_object('B2_no_last_van', (SELECT holder_kind FROM public.kit_items_overview WHERE id = i3));

  UPDATE public.kit_person_vans SET employee_id = phil, vehicle_id = ozl WHERE employee_ref = phil;
  i4 := public.kit_add_item(digger, 'ZZT-DIG3', null, null, 'on_van', phil, null, null, 'test', true, neil, null);
  n := public.kit_reconcile_unassigned(true);
  r := r || jsonb_build_object('C_moved', n,
    'C_kit_on_OZL_spare', (SELECT holder_employee_id IS NULL AND vehicle_id = ozl FROM public.kit_items WHERE id = i4),
    'C_record_cleared', (SELECT vehicle_id IS NULL FROM public.kit_person_vans WHERE employee_id = phil),
    'C_log', (SELECT actor_name || ' | ' || note FROM public.kit_history WHERE kit_item_id = i4 ORDER BY created_at DESC LIMIT 1),
    'C_second_run', public.kit_reconcile_unassigned(true));

  SELECT md5(string_agg(t::text, '' ORDER BY id)) INTO emp_after FROM public.employees t;
  SELECT md5(string_agg(t::text, '' ORDER BY id)) INTO veh_after FROM public.vehicles t;
  r := r || jsonb_build_object('employees_unchanged', emp_before = emp_after, 'vehicles_unchanged', veh_before = veh_after);
  RAISE EXCEPTION 'ROLLBACK-RESULT: %', r;
END $$;

-- 2. Van off the road (all to Yard Lockup; mixed; refusals) and back on the road.
DO $$
DECLARE
  dom uuid := '78288c40-3b7b-4906-b2b4-a3398ff32be4';
  tnl uuid := '74d9aa6f-eb60-4ff3-9e55-1129bb31d699';
  ozl uuid := '13ec8f25-008a-411e-9362-1fad2a538ce5';
  sgv uuid := '8a3cf784-9069-4af0-a544-f6edfa80a25c';
  neil uuid := '51d945fc-dc05-46f0-9375-ae2c4bef546f';
  sam uuid := '0e7f35c4-c9c4-4da1-bffb-54c064ddc2c7';
  digger uuid := 'b0884b59-9d65-413c-9da9-2383a8c17874';
  trailer uuid := '40fa445f-2def-4d78-aebe-03ffb529c984';
  cat uuid := 'c4c768a0-3c16-4445-92fe-e0e0f3566fa0';
  emp_before text; emp_after text; veh_before text; veh_after text;
  a1 uuid; a2 uuid; m1 uuid; m2 uuid; m3 uuid; st uuid; r jsonb := '{}';
BEGIN
  PERFORM set_config('request.jwt.claims', '{"sub":"16945ad1-7227-4cb1-b8ac-18b576913fc0","role":"authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);
  SELECT md5(string_agg(t::text, '' ORDER BY id)) INTO emp_before FROM public.employees t;
  SELECT md5(string_agg(t::text, '' ORDER BY id)) INTO veh_before FROM public.vehicles t;

  a1 := public.kit_add_item(digger, 'ZZT-O1', null, null, 'on_van', null, ozl, null, 'test', true, neil, null);
  a2 := public.kit_add_item(trailer, 'ZZT-O2', null, null, 'on_van', null, ozl, null, 'test', true, neil, null);
  st := public.kit_van_off_road(ozl, 'broken_down', 'Gearbox', jsonb_build_array(
          jsonb_build_object('item_id', a1, 'to', 'spare'), jsonb_build_object('item_id', a2, 'to', 'spare')), true, neil);
  r := r || jsonb_build_object(
    'D1_in_lockup', (SELECT count(*) FROM public.kit_items WHERE id IN (a1, a2) AND status = 'spare'),
    'D1_status', (SELECT reason || ' | ' || note || ' | ' || vehicle_reg_snapshot || ' | ' || off_actor_name || ' | open=' || (back_at IS NULL) FROM public.kit_van_status WHERE id = st),
    'D1_log', (SELECT action || ' | ' || actor_name || ' | ' || note FROM public.kit_history WHERE kit_item_id = a1 ORDER BY created_at DESC LIMIT 1));
  BEGIN PERFORM public.kit_van_off_road(ozl, 'other', null, '[]', true, neil); r := r || '{"D1_twice_refused":false}';
  EXCEPTION WHEN others THEN r := r || jsonb_build_object('D1_twice_refused', SQLERRM); END;
  BEGIN PERFORM public.kit_van_off_road(sgv, 'nope', null, '[]', true, neil); r := r || '{"D1_bad_reason_refused":false}';
  EXCEPTION WHEN others THEN r := r || jsonb_build_object('D1_bad_reason_refused', SQLERRM); END;

  PERFORM public.kit_van_back_on_road(ozl, sam);
  r := r || jsonb_build_object('D2_back', (SELECT back_at IS NOT NULL AND back_actor_name = 'Sam Longcroft' FROM public.kit_van_status WHERE id = st),
                               'D2_open_rows', (SELECT count(*) FROM public.kit_van_status WHERE vehicle_id = ozl AND back_at IS NULL));
  BEGIN PERFORM public.kit_van_back_on_road(ozl, sam); r := r || '{"D2_twice_refused":false}';
  EXCEPTION WHEN others THEN r := r || jsonb_build_object('D2_twice_refused', SQLERRM); END;

  m1 := public.kit_add_item(digger, 'ZZT-M1', null, null, 'on_van', dom, null, null, 'test', true, neil, null);
  m2 := public.kit_add_item(trailer, 'ZZT-M2', null, null, 'on_van', dom, null, null, 'test', true, neil, null);
  m3 := public.kit_add_item(cat, 'ZZT-M3', null, null, 'on_van', dom, null, null, 'test', true, neil, null);
  BEGIN
    PERFORM public.kit_van_off_road(tnl, 'other', null, jsonb_build_array(jsonb_build_object('item_id', m1, 'to', 'holder', 'vehicle_id', tnl)), true, neil);
    r := r || '{"D3_same_van_refused":false}';
  EXCEPTION WHEN others THEN r := r || jsonb_build_object('D3_same_van_refused', SQLERRM); END;
  BEGIN
    PERFORM public.kit_van_off_road(tnl, 'other', null, jsonb_build_array(jsonb_build_object('item_id', a1, 'to', 'spare')), true, neil);
    r := r || '{"D3_not_on_van_refused":false}';
  EXCEPTION WHEN others THEN r := r || jsonb_build_object('D3_not_on_van_refused', SQLERRM); END;
  st := public.kit_van_off_road(tnl, 'leaving_fleet', 'Lease ended', jsonb_build_array(
          jsonb_build_object('item_id', m1, 'to', 'holder', 'vehicle_id', sgv),
          jsonb_build_object('item_id', m2, 'to', 'away_for_service', 'service_company', 'Hire Co'),
          jsonb_build_object('item_id', m3, 'to', 'spare')), true, sam);
  r := r || jsonb_build_object(
    'D3_m1', (SELECT holder_kind || ' ' || coalesce(holder_reg, '') FROM public.kit_items_overview WHERE id = m1),
    'D3_m2', (SELECT status || ' ' || service_company FROM public.kit_items WHERE id = m2),
    'D3_m3', (SELECT status FROM public.kit_items WHERE id = m3),
    'D3_status', (SELECT reason || ' | ' || off_actor_name FROM public.kit_van_status WHERE id = st));

  SELECT md5(string_agg(t::text, '' ORDER BY id)) INTO emp_after FROM public.employees t;
  SELECT md5(string_agg(t::text, '' ORDER BY id)) INTO veh_after FROM public.vehicles t;
  r := r || jsonb_build_object('employees_unchanged', emp_before = emp_after, 'vehicles_unchanged', veh_before = veh_after);
  RAISE EXCEPTION 'ROLLBACK-RESULT: %', r;
END $$;

-- 3. Edit audit (logged, written back, lock back on), delete plant, delete audit.
DO $$
DECLARE
  dom uuid := '78288c40-3b7b-4906-b2b4-a3398ff32be4';
  tnl uuid := '74d9aa6f-eb60-4ff3-9e55-1129bb31d699';
  neil uuid := '51d945fc-dc05-46f0-9375-ae2c4bef546f';
  sam uuid := '0e7f35c4-c9c4-4da1-bffb-54c064ddc2c7';
  digger uuid := 'b0884b59-9d65-413c-9da9-2383a8c17874';
  hivis uuid := 'a346776f-49c2-4298-9b35-03e6466e65d1';
  overalls uuid := '785a9cc3-2bcb-4aa6-8380-dce87585ff06';
  emp_before text; emp_after text; veh_before text; veh_after text;
  au uuid; lk uuid; lp uuid; lx uuid; item uuid; s text[]; p text[]; r jsonb := '{}';
BEGIN
  PERFORM set_config('request.jwt.claims', '{"sub":"16945ad1-7227-4cb1-b8ac-18b576913fc0","role":"authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);
  SELECT md5(string_agg(t::text, '' ORDER BY id)) INTO emp_before FROM public.employees t;
  SELECT md5(string_agg(t::text, '' ORDER BY id)) INTO veh_before FROM public.vehicles t;

  INSERT INTO public.audit_site_audits (audit_date, audited_by_name, vehicle_id, vehicle_reg_snapshot, ganger_id, ganger_name_snapshot,
      team_name_snapshot, status, is_test, auditor_id, auditor_name, holder_employee_id)
    VALUES ('2026-11-05', 'Neil Foster', tnl, 'YE24 TNL', dom, 'Dom Oliver', 'Dom Oliver', 'draft', true, neil, 'Neil Foster', dom) RETURNING id INTO au;
  INSERT INTO public.audit_members (audit_id, employee_id, name) VALUES (au, dom, 'Dom Oliver');
  INSERT INTO public.audit_lines (audit_id, section, kit_type_id, item_name, result, plant_no_snapshot, sort_order)
    VALUES (au, 'kit', digger, 'Digger', 'Y', 'ZZT-E1', 1) RETURNING id INTO lk;
  INSERT INTO public.audit_lines (audit_id, section, checklist_item_id, item_name, result, expiry_date, photo_path, sort_order)
    VALUES (au, 'ppe', hivis, 'Hi vis', 'Y', '2027-01-01', 'zz-test/hivis.jpg', 2) RETURNING id INTO lp;
  INSERT INTO public.audit_lines (audit_id, section, checklist_item_id, item_name, result, sort_order)
    VALUES (au, 'ppe', overalls, 'Overalls', 'Y', 3) RETURNING id INTO lx;
  PERFORM public.audit_submit(au);
  SELECT kit_item_id INTO item FROM public.audit_lines WHERE id = lk;
  r := r || jsonb_build_object('E0_submit_wrote_back',
    (SELECT plant_no FROM public.kit_items WHERE id = item) || ' / hi vis ' || (SELECT expiry_date::text FROM public.audit_ppe_items WHERE holder_employee_id = dom AND checklist_item_id = hivis));

  BEGIN UPDATE public.audit_lines SET result = 'N' WHERE id = lp; r := r || '{"E_direct_change_refused":false}';
  EXCEPTION WHEN others THEN r := r || jsonb_build_object('E_direct_change_refused', SQLERRM); END;
  BEGIN UPDATE public.audit_site_audits SET notes = 'x' WHERE id = au; r := r || '{"E_direct_header_change_refused":false}';
  EXCEPTION WHEN others THEN r := r || jsonb_build_object('E_direct_header_change_refused', SQLERRM); END;
  BEGIN PERFORM public.audit_edit(au, jsonb_build_array(jsonb_build_object('line_id', lp, 'field', 'result', 'to', 'N')), null); r := r || '{"E_no_name_refused":false}';
  EXCEPTION WHEN others THEN r := r || jsonb_build_object('E_no_name_refused', SQLERRM); END;
  BEGIN PERFORM public.audit_edit(au, jsonb_build_array(jsonb_build_object('line_id', lp, 'field', 'result', 'to', 'Y')), neil); r := r || '{"E_nothing_refused":false}';
  EXCEPTION WHEN others THEN r := r || jsonb_build_object('E_nothing_refused', SQLERRM); END;
  BEGIN PERFORM public.audit_edit(au, jsonb_build_array(jsonb_build_object('line_id', lp, 'field', 'photo_path', 'to', 'x')), neil); r := r || '{"E_bad_field_refused":false}';
  EXCEPTION WHEN others THEN r := r || jsonb_build_object('E_bad_field_refused', SQLERRM); END;

  s := public.audit_edit(au, jsonb_build_array(
         jsonb_build_object('line_id', lp, 'field', 'result', 'to', 'N'),
         jsonb_build_object('line_id', lp, 'field', 'expiry_date', 'to', '2027-06-01'),
         jsonb_build_object('line_id', lp, 'field', 'comment', 'to', 'Torn'),
         jsonb_build_object('line_id', lk, 'field', 'plant_no_snapshot', 'to', 'ZZT-E2')), neil);
  r := r || jsonb_build_object('E_summary', s,
    'E_logged', (SELECT actor_name || ' | ' || array_length(summary, 1) FROM public.audit_edits WHERE audit_id = au),
    'E_line_now', (SELECT result || ' ' || expiry_date || ' ' || comment FROM public.audit_lines WHERE id = lp),
    'E_ppe_written_back', (SELECT expiry_date::text FROM public.audit_ppe_items WHERE holder_employee_id = dom AND checklist_item_id = hivis),
    'E_plant_written_back', (SELECT plant_no || ' holder=' || (holder_employee_id = dom) FROM public.kit_items WHERE id = item),
    'E_still_submitted', (SELECT status FROM public.audit_site_audits WHERE id = au),
    'E_lock_back_on', current_setting('audit.allow_change', true));
  BEGIN UPDATE public.audit_lines SET result = 'Y' WHERE id = lp; r := r || '{"E_lock_after_edit":false}';
  EXCEPTION WHEN others THEN r := r || jsonb_build_object('E_lock_after_edit', SQLERRM); END;

  INSERT INTO public.kit_history (kit_item_id, action, note, certificate_path, is_test, actor_id, actor_name)
    VALUES (item, 'reserviced', 'cert', 'zz-test/cert.pdf', true, neil, 'Neil Foster');
  BEGIN PERFORM public.kit_delete_item(item, 'ZZT-WRONG', neil); r := r || '{"G_wrong_plant_no_refused":false}';
  EXCEPTION WHEN others THEN r := r || jsonb_build_object('G_wrong_plant_no_refused', SQLERRM); END;
  p := public.kit_delete_item(item, ' zzt-e2 ', sam);
  r := r || jsonb_build_object('G_cert_paths', p,
    'G_item_gone', NOT EXISTS (SELECT 1 FROM public.kit_items WHERE id = item),
    'G_history_gone', NOT EXISTS (SELECT 1 FROM public.kit_history WHERE kit_item_id = item),
    'G_not_in_overview', NOT EXISTS (SELECT 1 FROM public.kit_items_overview WHERE id = item),
    'G_audit_line_text_kept', (SELECT coalesce(kit_item_id::text, 'link cleared') || ' | ' || plant_no_snapshot || ' | ' || item_name FROM public.audit_lines WHERE id = lk),
    'G_lock_back_on', current_setting('audit.allow_change', true));

  BEGIN PERFORM public.audit_delete(au, '  ', neil); r := r || '{"F_no_reason_refused":false}';
  EXCEPTION WHEN others THEN r := r || jsonb_build_object('F_no_reason_refused', SQLERRM); END;
  p := public.audit_delete(au, 'Done twice by mistake', neil);
  r := r || jsonb_build_object('F_photo_paths', p,
    'F_audit_gone', NOT EXISTS (SELECT 1 FROM public.audit_site_audits WHERE id = au),
    'F_lines_members_edits_left', (SELECT count(*) FROM public.audit_lines WHERE audit_id = au) + (SELECT count(*) FROM public.audit_members WHERE audit_id = au) + (SELECT count(*) FROM public.audit_edits WHERE audit_id = au),
    'F_log', (SELECT team_label || ' | ' || vehicle_reg || ' | ' || reason || ' | ' || actor_name FROM public.audit_deletions WHERE audit_id = au),
    'F_ppe_stays_with_Dom', (SELECT expiry_date::text || ' source_audit=' || coalesce(source_audit_id::text, 'cleared') FROM public.audit_ppe_items WHERE holder_employee_id = dom AND checklist_item_id = hivis),
    'F_lock_back_on', current_setting('audit.allow_change', true));

  SELECT md5(string_agg(t::text, '' ORDER BY id)) INTO emp_after FROM public.employees t;
  SELECT md5(string_agg(t::text, '' ORDER BY id)) INTO veh_after FROM public.vehicles t;
  r := r || jsonb_build_object('employees_unchanged', emp_before = emp_after, 'vehicles_unchanged', veh_before = veh_after);
  RAISE EXCEPTION 'ROLLBACK-RESULT: %', r;
END $$;
