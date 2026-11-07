-- Round 12 database checks. Raises 'ROLLBACK-RESULT: {...}', so everything written is rolled back;
-- test-marked; writes only this build's audit_ / kit_ tables; employees / vehicles only read.
-- 1. What is on screen at Submit is what the record gets (dates changed, an expiry cleared to N/A).
-- 2. What has happened since: re-serviced (resolved), swapped for a spare (resolved), deleted.
DO $$
DECLARE
  dom uuid := '78288c40-3b7b-4906-b2b4-a3398ff32be4';
  tnl uuid := '74d9aa6f-eb60-4ff3-9e55-1129bb31d699';
  neil uuid := '51d945fc-dc05-46f0-9375-ae2c4bef546f';
  emp_before text; emp_after text; veh_before text; veh_after text;
  t_floor uuid; t_brk uuid; t_pck uuid; t_saw uuid; t_dig uuid;
  i_floor uuid; i_brk uuid; i_pck uuid; i_saw uuid; i_dig uuid; spare uuid; au uuid; r jsonb := '{}';
BEGIN
  PERFORM set_config('request.jwt.claims', '{"sub":"16945ad1-7227-4cb1-b8ac-18b576913fc0","role":"authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);
  SELECT md5(string_agg(t::text, '' ORDER BY id)) INTO emp_before FROM public.employees t;
  SELECT md5(string_agg(t::text, '' ORDER BY id)) INTO veh_before FROM public.vehicles t;
  SELECT id INTO t_floor FROM public.kit_types WHERE name = 'Floor saw';
  SELECT id INTO t_brk FROM public.kit_types WHERE name = 'Breaker';
  SELECT id INTO t_pck FROM public.kit_types WHERE name = 'Pecker';
  SELECT id INTO t_saw FROM public.kit_types WHERE name = 'STIHL saw';
  SELECT id INTO t_dig FROM public.kit_types WHERE name = 'Digger';
  i_floor := public.kit_add_item(t_floor, 'ZZT-F', null, '2026-11-05', 'on_van', dom, null, null, 'test', true, neil, null);
  i_brk := public.kit_add_item(t_brk, 'ZZT-B', '2025-11-28', '2026-11-28', 'on_van', dom, null, null, 'test', true, neil, null);
  i_pck := public.kit_add_item(t_pck, 'ZZT-P', '2025-08-09', '2026-08-09', 'on_van', dom, null, null, 'test', true, neil, null);
  i_saw := public.kit_add_item(t_saw, 'ZZT-S', '2025-08-01', '2026-08-01', 'on_van', dom, null, null, 'test', true, neil, null);
  i_dig := public.kit_add_item(t_dig, 'ZZT-D', '2025-09-01', '2026-09-01', 'on_van', dom, null, null, 'test', true, neil, null);

  INSERT INTO public.audit_site_audits (audit_date, audited_by_name, vehicle_id, vehicle_reg_snapshot, ganger_id, ganger_name_snapshot,
      team_name_snapshot, status, is_test, auditor_id, auditor_name, holder_employee_id)
    VALUES ('2026-11-06', 'Neil Foster', tnl, 'YE24 TNL', dom, 'Dom Oliver', 'Dom Oliver', 'draft', true, neil, 'Neil Foster', dom) RETURNING id INTO au;
  INSERT INTO public.audit_lines (audit_id, section, kit_type_id, kit_item_id, item_name, result, plant_no_snapshot, service_date, expiry_date, sort_order) VALUES
    (au, 'kit', t_floor, i_floor, 'Floor saw', 'Y', 'ZZT-F', '2026-12-05', '2027-12-05', 1),
    (au, 'kit', t_brk, i_brk, 'Breaker', 'Y', 'ZZT-B', '2026-11-05', null, 2),
    (au, 'kit', t_pck, i_pck, 'Pecker', 'Y', 'ZZT-P', '2025-08-09', '2027-11-20', 3),
    (au, 'kit', t_saw, i_saw, 'STIHL saw', 'Y', 'ZZT-S', '2025-08-01', '2026-08-01', 4),
    (au, 'kit', t_dig, i_dig, 'Digger', 'N', 'ZZT-D', '2025-09-01', '2026-09-01', 5);
  PERFORM public.audit_submit(au);
  r := r || jsonb_build_object('1_record_matches_screen', (SELECT jsonb_agg(plant_no || ' svc ' || coalesce(service_date::text, 'N/A') || ' exp ' || coalesce(expiry_date::text, 'N/A') ORDER BY plant_no)
    FROM public.kit_items WHERE id IN (i_floor, i_brk, i_pck)));

  PERFORM public.kit_update_item(i_saw, 'reserviced', '2026-11-06', '2027-11-20', null, null, 'Serviced', neil);
  spare := public.kit_add_item(t_dig, 'ZZT-D9', '2026-11-01', '2027-11-01', 'spare', null, null, null, 'test', true, neil, null);
  PERFORM public.kit_swap(i_dig, 'away_for_service', null, null, 'Hire Co', 'spare', spare, null, null, null, null, neil);
  PERFORM public.kit_delete_item(i_pck, 'ZZT-P', neil);
  r := r || jsonb_build_object('2_followup', (SELECT jsonb_agg(item_name || ': problem=' || coalesce(date_problem, '-') || (CASE WHEN is_fail THEN '+fail' ELSE '' END)
      || ' last=' || coalesce(last_action, '-') || ' now_exp=' || coalesce(current_expiry::text, '-') || ' swapped_for=' || coalesce(swapped_for, '-')
      || ' deleted=' || deleted || ' date_resolved=' || date_resolved || ' fail_resolved=' || fail_resolved ORDER BY item_name)
    FROM public.audit_line_followup WHERE audit_id = au),
    '2_resolution', (SELECT fails_resolved || ' fails, ' || expired_resolved || ' expired, ' || due_soon_resolved || ' due soon resolved' FROM public.audit_resolution WHERE audit_id = au),
    '2_summary', (SELECT fail_count || ' fails, ' || expired_count || ' expired, ' || due_soon_count || ' due soon' FROM public.audit_site_audit_summary WHERE id = au));

  SELECT md5(string_agg(t::text, '' ORDER BY id)) INTO emp_after FROM public.employees t;
  SELECT md5(string_agg(t::text, '' ORDER BY id)) INTO veh_after FROM public.vehicles t;
  r := r || jsonb_build_object('employees_unchanged', emp_before = emp_after, 'vehicles_unchanged', veh_before = veh_after);
  RAISE EXCEPTION 'ROLLBACK-RESULT: %', r;
END $$;
