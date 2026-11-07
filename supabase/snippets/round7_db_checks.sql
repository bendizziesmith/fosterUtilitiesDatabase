-- Round 7 database checks: "Label on?" (Other section). Raises 'ROLLBACK-RESULT: {...}' at
-- the end, so everything written is rolled back. Writes only this build's audit_ tables;
-- employees and vehicles are only read (row hashes compared before and after).
-- Discard draft is a plain delete of a draft by the app; it is covered by the definitions:
-- audit_lines / audit_members cascade on delete, the guard only protects submitted audits,
-- and admins have the "Admins manage site audits" policy.
DO $$
DECLARE
  dom uuid := '78288c40-3b7b-4906-b2b4-a3398ff32be4';
  tnl uuid := '74d9aa6f-eb60-4ff3-9e55-1129bb31d699';
  neil uuid := '51d945fc-dc05-46f0-9375-ae2c4bef546f';
  water uuid := '71fa0e14-072f-43f6-9426-8230c8a9304a';
  nsf uuid := '291726c3-4075-4b6e-8f3c-4d0cbe5867ac';
  emp_before text; emp_after text; veh_before text; veh_after text;
  au uuid; lw uuid; s text[]; r jsonb := '{}';
BEGIN
  PERFORM set_config('request.jwt.claims', '{"sub":"16945ad1-7227-4cb1-b8ac-18b576913fc0","role":"authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);
  SELECT md5(string_agg(t::text, '' ORDER BY id)) INTO emp_before FROM public.employees t;
  SELECT md5(string_agg(t::text, '' ORDER BY id)) INTO veh_before FROM public.vehicles t;

  r := r || jsonb_build_object('H_settings', (SELECT string_agg(name || '=' || CASE WHEN has_label_check THEN 'label' WHEN has_date_tag THEN 'tag' ELSE 'none' END, ', ' ORDER BY sort_order) FROM public.audit_checklist_items WHERE section = 'other'));

  INSERT INTO public.audit_site_audits (audit_date, audited_by_name, vehicle_id, vehicle_reg_snapshot, ganger_id, ganger_name_snapshot,
      team_name_snapshot, status, is_test, auditor_id, auditor_name, holder_employee_id)
    VALUES ('2026-11-05', 'Neil Foster', tnl, 'YE24 TNL', dom, 'Dom Oliver', 'Dom Oliver', 'draft', true, neil, 'Neil Foster', dom) RETURNING id INTO au;
  INSERT INTO public.audit_lines (audit_id, section, checklist_item_id, item_name, result, qty, label_on, sort_order)
    VALUES (au, 'other', water, 'Water containers', 'Y', '1', 'N', 1) RETURNING id INTO lw;
  INSERT INTO public.audit_lines (audit_id, section, checklist_item_id, item_name, result, qty, sort_order)
    VALUES (au, 'other', nsf, 'NSF folder', 'Y', '1', 2);
  BEGIN INSERT INTO public.audit_lines (audit_id, section, item_name, label_on) VALUES (au, 'other', 'x', 'maybe'); r := r || '{"H_bad_value_refused":false}';
  EXCEPTION WHEN others THEN r := r || jsonb_build_object('H_bad_value_refused', 'yes'); END;
  PERFORM public.audit_submit(au);
  BEGIN UPDATE public.audit_lines SET label_on = 'Y' WHERE id = lw; r := r || '{"H_direct_change_refused":false}';
  EXCEPTION WHEN others THEN r := r || jsonb_build_object('H_direct_change_refused', SQLERRM); END;
  BEGIN PERFORM public.audit_edit(au, jsonb_build_array(jsonb_build_object('line_id', lw, 'field', 'label_on', 'to', 'X')), neil); r := r || '{"H_edit_bad_value_refused":false}';
  EXCEPTION WHEN others THEN r := r || jsonb_build_object('H_edit_bad_value_refused', SQLERRM); END;
  s := public.audit_edit(au, jsonb_build_array(jsonb_build_object('line_id', lw, 'field', 'label_on', 'to', 'Y')), neil);
  r := r || jsonb_build_object('H_edit_summary', s, 'H_now', (SELECT label_on FROM public.audit_lines WHERE id = lw),
    'H_logged', (SELECT actor_name || ' | ' || summary[1] FROM public.audit_edits WHERE audit_id = au));

  SELECT md5(string_agg(t::text, '' ORDER BY id)) INTO emp_after FROM public.employees t;
  SELECT md5(string_agg(t::text, '' ORDER BY id)) INTO veh_after FROM public.vehicles t;
  r := r || jsonb_build_object('employees_unchanged', emp_before = emp_after, 'vehicles_unchanged', veh_before = veh_after);
  RAISE EXCEPTION 'ROLLBACK-RESULT: %', r;
END $$;
