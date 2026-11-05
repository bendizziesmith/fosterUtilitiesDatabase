-- Round 9 database checks (run after 20261105220000_round9_hs_dates_gauge_photos_cat_genny.sql).
-- Raises 'ROLLBACK-RESULT: {...}' at the end, so everything written is rolled back. Writes only
-- this build's audit_ / kit_ tables; employees and vehicles are only read (hashes compared).
DO $$
DECLARE
  dom uuid := '78288c40-3b7b-4906-b2b4-a3398ff32be4';
  tnl uuid := '74d9aa6f-eb60-4ff3-9e55-1129bb31d699';
  ozl uuid := '13ec8f25-008a-411e-9362-1fad2a538ce5';
  neil uuid := '51d945fc-dc05-46f0-9375-ae2c4bef546f';
  emp_before text; emp_after text; veh_before text; veh_after text;
  t_cat uuid; c_fire uuid; c_aid uuid; au uuid; lf uuid; held uuid; spare uuid; r jsonb := '{}';
BEGIN
  PERFORM set_config('request.jwt.claims', '{"sub":"16945ad1-7227-4cb1-b8ac-18b576913fc0","role":"authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);
  SELECT md5(string_agg(t::text, '' ORDER BY id)) INTO emp_before FROM public.employees t;
  SELECT md5(string_agg(t::text, '' ORDER BY id)) INTO veh_before FROM public.vehicles t;
  SELECT id INTO t_cat FROM public.kit_types WHERE name = 'CAT';
  SELECT id INTO c_fire FROM public.audit_checklist_items WHERE name = 'Fire ext 2KG dry powder';
  SELECT id INTO c_aid FROM public.audit_checklist_items WHERE name = 'First aid kit';

  -- 14. CAT / Genny, sheet order; 7. dated H&S; 10. photo slots
  r := r || jsonb_build_object(
    '14_kit_order', (SELECT string_agg(name, ', ' ORDER BY sort_order) FROM public.kit_types WHERE is_active),
    '14_items_on_CAT', (SELECT count(*) FROM public.kit_items WHERE kit_type_id = t_cat),
    '14_cat_genny_left', (SELECT count(*) FROM public.kit_types WHERE name = 'Cat & Genny'),
    '7_dated_hs', (SELECT string_agg(name || CASE WHEN service_interval_months IS NOT NULL THEN ' +' || service_interval_months || 'm' ELSE '' END || CASE WHEN has_gauge THEN ' gauge' ELSE '' END, ', ' ORDER BY sort_order) FROM public.audit_checklist_items WHERE section = 'hs' AND has_expiry),
    '10_slots', (SELECT string_agg(name || CASE WHEN required THEN '*' ELSE '' END, ', ' ORDER BY sort_order) FROM public.audit_photo_slots WHERE is_active),
    '13_company', (SELECT company_name FROM public.audit_settings));

  -- an audit with a red gauge, an amber gauge item and a dated first aid kit
  INSERT INTO public.audit_site_audits (audit_date, audited_by_name, vehicle_id, vehicle_reg_snapshot, ganger_id, ganger_name_snapshot,
      team_name_snapshot, status, is_test, auditor_id, auditor_name, holder_employee_id)
    VALUES ('2026-11-05', 'Neil Foster', tnl, 'YE24 TNL', dom, 'Dom Oliver', 'Dom Oliver', 'draft', true, neil, 'Neil Foster', dom) RETURNING id INTO au;
  INSERT INTO public.audit_lines (audit_id, section, checklist_item_id, item_name, result, qty, service_date, expiry_date, gauge, sort_order)
    VALUES (au, 'hs', c_fire, 'Fire ext 2KG dry powder', 'Y', '1', '2026-01-10', '2027-01-10', 'red', 1) RETURNING id INTO lf;
  INSERT INTO public.audit_lines (audit_id, section, checklist_item_id, item_name, result, qty, expiry_date, sort_order)
    VALUES (au, 'hs', c_aid, 'First aid kit', 'Y', '1', '2026-10-01', 2);

  -- 15. submit blocked without the required photos
  BEGIN PERFORM public.audit_submit(au); r := r || '{"15_blocked_without_photos":false}';
  EXCEPTION WHEN others THEN r := r || jsonb_build_object('15_blocked_without_photos', SQLERRM); END;
  INSERT INTO public.audit_photos (audit_id, slot_id, slot_name, path, taken_at, is_test)
    SELECT au, id, name, 'zz-test/' || sort_order || '.jpg', now(), true FROM public.audit_photo_slots WHERE is_active AND required AND name <> 'Genny';
  INSERT INTO public.audit_photos (audit_id, slot_id, slot_name, skip_reason, is_test)
    SELECT au, id, name, 'Genny away for service', true FROM public.audit_photo_slots WHERE name = 'Genny';
  BEGIN INSERT INTO public.audit_photos (audit_id, slot_id, slot_name, skip_reason, is_test) SELECT au, id, name, '  ', true FROM public.audit_photo_slots WHERE name = 'CAT';
    r := r || '{"15_blank_reason_refused":false}';
  EXCEPTION WHEN others THEN r := r || jsonb_build_object('15_blank_reason_refused', 'yes'); END;
  INSERT INTO public.audit_photos (audit_id, path, caption, taken_at, is_test) VALUES (au, 'zz-test/extra.jpg', 'Broken step', now(), true);
  PERFORM public.audit_submit(au);
  r := r || jsonb_build_object('15_submitted_with_photo_or_reason', (SELECT status FROM public.audit_site_audits WHERE id = au),
    '11_photos_kept', (SELECT count(*) FROM public.audit_photos WHERE audit_id = au));
  BEGIN UPDATE public.audit_photos SET caption = 'x' WHERE audit_id = au; r := r || '{"15_photos_locked_after_submit":false}';
  EXCEPTION WHEN others THEN r := r || jsonb_build_object('15_photos_locked_after_submit', SQLERRM); END;

  -- 7. red gauge = fail; dated H&S on the holder record; counts
  r := r || jsonb_build_object(
    '7_fail_count_red', (SELECT fail_count FROM public.audit_site_audit_summary WHERE id = au),
    '7_expired_count_hs', (SELECT expired_count FROM public.audit_site_audit_summary WHERE id = au),
    '7_hs_dates_on_record', (SELECT string_agg(item_name || ' ' || expiry_date, ', ' ORDER BY item_name) FROM public.audit_ppe_items WHERE holder_employee_id = dom AND checklist_item_id IN (c_fire, c_aid)),
    '7_in_needs_attention', (SELECT count(*) FROM public.audit_needs_attention WHERE holder_employee_id = dom AND item_name = 'First aid kit'));
  PERFORM public.audit_edit(au, jsonb_build_array(jsonb_build_object('line_id', lf, 'field', 'gauge', 'to', 'amber')), neil);
  r := r || jsonb_build_object('7_after_edit_red_to_amber',
    (SELECT fail_count || ' fail, ' || look_count || ' to look at' FROM public.audit_site_audit_summary WHERE id = au),
    '7_edit_log', (SELECT summary[1] FROM public.audit_edits WHERE audit_id = au));
  BEGIN PERFORM public.audit_edit(au, jsonb_build_array(jsonb_build_object('line_id', lf, 'field', 'gauge', 'to', 'blue')), neil); r := r || '{"7_bad_gauge_refused":false}';
  EXCEPTION WHEN others THEN r := r || jsonb_build_object('7_bad_gauge_refused', SQLERRM); END;

  -- 8. swap with a spare from a spare van
  held := public.kit_add_item(t_cat, 'ZZT-CAT1', null, null, 'on_van', dom, null, null, 'test', true, neil, null);
  spare := public.kit_add_item(t_cat, 'ZZT-CAT2', null, '2027-05-01', 'on_van', null, ozl, null, 'test', true, neil, null);
  PERFORM public.kit_swap(held, 'away_for_service', null, null, 'Hire Co', 'spare', spare, null, null, null, null, neil);
  r := r || jsonb_build_object(
    '8_spare_now', (SELECT holder_kind || ' ' || coalesce(holder_name, '') FROM public.kit_items_overview WHERE id = spare),
    '8_old_now', (SELECT status FROM public.kit_items WHERE id = held),
    '8_logged_on_the_van', (SELECT count(*) FROM public.kit_recent_updates WHERE kit_item_id = spare AND ozl = ANY (related_vehicle_ids)),
    '8_log_note', (SELECT note FROM public.kit_history WHERE kit_item_id = spare AND action = 'swapped_in'));

  SELECT md5(string_agg(t::text, '' ORDER BY id)) INTO emp_after FROM public.employees t;
  SELECT md5(string_agg(t::text, '' ORDER BY id)) INTO veh_after FROM public.vehicles t;
  r := r || jsonb_build_object('employees_unchanged', emp_before = emp_after, 'vehicles_unchanged', veh_before = veh_after);
  RAISE EXCEPTION 'ROLLBACK-RESULT: %', r;
END $$;
