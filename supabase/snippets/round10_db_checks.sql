-- Round 10 database checks. Raises 'ROLLBACK-RESULT: {...}' at the end, so everything written is
-- rolled back. Writes only this build's audit_ / kit_ tables (one audit is NON-test on purpose, to
-- check the photo lock on a real record; it is rolled back); employees / vehicles only read.
-- 1. Photo lock on a submitted NON-test audit: direct caption change and row delete are refused;
--    the app's photo delete (file removed + deletion record, row kept) still works.
-- 2. Caption change through audit_photo_caption: saved, logged, lock back on.
-- 3. Change van that also takes a Yard Lockup spare, a spare-van spare, and adds a new item.
DO $$
DECLARE
  dom uuid := '78288c40-3b7b-4906-b2b4-a3398ff32be4';
  tnl uuid := '74d9aa6f-eb60-4ff3-9e55-1129bb31d699';
  ozl uuid := '13ec8f25-008a-411e-9362-1fad2a538ce5';
  sgv uuid := '8a3cf784-9069-4af0-a544-f6edfa80a25c';
  neil uuid := '51d945fc-dc05-46f0-9375-ae2c4bef546f';
  emp_before text; emp_after text; veh_before text; veh_after text;
  t_saw uuid; t_cat uuid; t_gen uuid; au uuid; ph uuid; s text; l1 uuid; v1 uuid; own uuid; n int; r jsonb := '{}';
BEGIN
  PERFORM set_config('request.jwt.claims', '{"sub":"16945ad1-7227-4cb1-b8ac-18b576913fc0","role":"authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);
  SELECT md5(string_agg(t::text, '' ORDER BY id)) INTO emp_before FROM public.employees t;
  SELECT md5(string_agg(t::text, '' ORDER BY id)) INTO veh_before FROM public.vehicles t;
  SELECT id INTO t_saw FROM public.kit_types WHERE name = 'STIHL saw';
  SELECT id INTO t_cat FROM public.kit_types WHERE name = 'CAT';
  SELECT id INTO t_gen FROM public.kit_types WHERE name = 'Genny';

  INSERT INTO public.audit_site_audits (audit_date, audited_by_name, vehicle_id, vehicle_reg_snapshot, ganger_id, ganger_name_snapshot,
      team_name_snapshot, status, is_test, auditor_id, auditor_name, holder_employee_id)
    VALUES ('2026-11-05', 'Neil Foster', tnl, 'YE24 TNL', dom, 'Dom Oliver', 'Dom Oliver', 'draft', false, neil, 'Neil Foster', dom) RETURNING id INTO au;
  INSERT INTO public.audit_photos (audit_id, slot_id, slot_name, path, taken_at, is_test)
    SELECT au, id, name, 'zz-check/' || sort_order || '.jpg', now(), false FROM public.audit_photo_slots WHERE is_active AND required;
  INSERT INTO public.audit_photos (audit_id, path, caption, taken_at, is_test) VALUES (au, 'zz-check/extra.jpg', 'Broken step', now(), false) RETURNING id INTO ph;
  PERFORM public.audit_submit(au);

  BEGIN UPDATE public.audit_photos SET caption = 'x' WHERE id = ph; r := r || '{"1_direct_caption":"allowed"}';
  EXCEPTION WHEN others THEN r := r || jsonb_build_object('1_direct_caption', 'REFUSED: ' || SQLERRM); END;
  BEGIN DELETE FROM public.audit_photos WHERE id = ph; GET DIAGNOSTICS n = ROW_COUNT; r := r || jsonb_build_object('1_direct_row_delete', 'allowed ' || n);
  EXCEPTION WHEN others THEN r := r || jsonb_build_object('1_direct_row_delete', 'REFUSED: ' || SQLERRM); END;
  BEGIN INSERT INTO public.audit_file_deletions (path, is_test, actor_id, actor_name) VALUES ('zz-check/extra.jpg', false, neil, 'Neil Foster');
    r := r || '{"1_app_photo_delete_record":"allowed"}';
  EXCEPTION WHEN others THEN r := r || jsonb_build_object('1_app_photo_delete_record', 'REFUSED: ' || SQLERRM); END;

  s := public.audit_photo_caption(ph, 'Broken step, left side', neil);
  r := r || jsonb_build_object('2_caption_via_function', s,
    '2_logged', (SELECT actor_name || ' | ' || summary[1] FROM public.audit_edits WHERE audit_id = au),
    '2_lock_back_on', current_setting('audit.allow_change', true));

  own := public.kit_add_item(t_cat, 'ZZT-OWN', null, null, 'on_van', dom, null, null, 'test', true, neil, null);
  l1 := public.kit_add_item(t_saw, 'ZZT-SS311', null, '2027-09-01', 'spare', null, null, null, 'test', true, neil, null);
  v1 := public.kit_add_item(t_cat, 'ZZT-CATV', null, '2027-05-01', 'on_van', null, ozl, null, 'test', true, neil, null);
  PERFORM public.kit_change_van(dom, tnl, sgv, jsonb_build_array(
      jsonb_build_object('item_id', own, 'to', 'person'),
      jsonb_build_object('item_id', l1, 'to', 'take'),
      jsonb_build_object('item_id', v1, 'to', 'take'),
      jsonb_build_object('to', 'new', 'kit_type_id', t_gen, 'plant_no', 'ZZT-GEN1', 'service_date', '2026-11-01', 'expiry_date', '2027-11-01')),
    'Van change: Dom Oliver YE24 TNL → OW72 SGV', true, neil);
  r := r || jsonb_build_object(
    '3_lockup_spare_now', (SELECT holder_kind || ' ' || holder_name FROM public.kit_items_overview WHERE id = l1),
    '3_lockup_log', (SELECT note FROM public.kit_history WHERE kit_item_id = l1 ORDER BY created_at DESC LIMIT 1),
    '3_van_spare_log', (SELECT note FROM public.kit_history WHERE kit_item_id = v1 ORDER BY created_at DESC LIMIT 1),
    '3_logged_on_OZL', (SELECT count(*) FROM public.kit_recent_updates WHERE kit_item_id = v1 AND ozl = ANY (related_vehicle_ids)),
    '3_logged_on_Dom', (SELECT count(*) FROM public.kit_recent_updates WHERE kit_item_id IN (l1, v1) AND dom = ANY (related_holder_ids) AND note LIKE '%taken from%'),
    '3_new_item', (SELECT type_name || ' ' || plant_no || ' exp ' || expiry_date || ' ' || holder_kind FROM public.kit_items_overview WHERE plant_no = 'ZZT-GEN1'));

  SELECT md5(string_agg(t::text, '' ORDER BY id)) INTO emp_after FROM public.employees t;
  SELECT md5(string_agg(t::text, '' ORDER BY id)) INTO veh_after FROM public.vehicles t;
  r := r || jsonb_build_object('employees_unchanged', emp_before = emp_after, 'vehicles_unchanged', veh_before = veh_after);
  RAISE EXCEPTION 'ROLLBACK-RESULT: %', r;
END $$;
