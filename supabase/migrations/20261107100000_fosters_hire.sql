-- Fosters | Hire (7 Nov 2026): is each kit item ours or hired?
-- Additive only. Two new columns, and two of this build's functions updated with the SAME inputs as before:
--  * kit_items.ownership: 'fosters' | 'hire', NOT NULL DEFAULT 'fosters' (existing kit and anything the
--    current live app adds becomes Fosters).
--  * audit_lines.ownership: 'fosters' | 'hire', empty when saved by the current live app (per-audit snapshot,
--    so old records stay as they were).
--  * audit_write_back(p_audit_id, p_actor_id): copies a kit line's Fosters / Hire onto its kit item ONLY when
--    the line has one (lines from the current live app have none, so nothing changes for them).
--    Called by audit_submit and audit_edit; audit_submit itself is unchanged.
--  * audit_edit(p_audit_id, p_changes, p_actor_id): 'ownership' added to the fields Edit audit may change.
-- No DROP, no DELETE, no change to any existing column, nothing outside audit_ / kit_ objects.

ALTER TABLE public.kit_items ADD COLUMN IF NOT EXISTS ownership text NOT NULL DEFAULT 'fosters'
  CONSTRAINT kit_items_ownership_check CHECK (ownership IN ('fosters', 'hire'));
ALTER TABLE public.audit_lines ADD COLUMN IF NOT EXISTS ownership text
  CONSTRAINT audit_lines_ownership_check CHECK (ownership IN ('fosters', 'hire'));

CREATE OR REPLACE FUNCTION public.audit_write_back(p_audit_id uuid, p_actor_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_audit public.audit_site_audits%ROWTYPE;
  v_line public.audit_lines%ROWTYPE;
  v_person uuid;
  v_van uuid;
  v_item_id uuid;
  v_old jsonb;
  v_ppe uuid;
BEGIN
  SELECT * INTO v_audit FROM public.audit_site_audits WHERE id = p_audit_id;
  v_person := v_audit.holder_employee_id;
  v_van := CASE WHEN v_person IS NULL THEN v_audit.vehicle_id END;
  IF v_person IS NULL AND v_van IS NULL THEN RAISE EXCEPTION 'This audit has no person or van'; END IF;

  FOR v_line IN
    SELECT * FROM public.audit_lines WHERE audit_id = p_audit_id AND section = 'kit' ORDER BY sort_order
  LOOP
    IF v_line.result = 'not_carried' THEN
      PERFORM public.kit_set_carried(v_person, v_van, v_line.kit_type_id, false, v_audit.is_test);
      CONTINUE;
    END IF;
    IF v_line.result IS NULL AND NULLIF(btrim(v_line.plant_no_snapshot), '') IS NULL
       AND v_line.service_date IS NULL AND v_line.expiry_date IS NULL THEN
      CONTINUE;
    END IF;
    IF v_line.kit_type_id IS NULL THEN CONTINUE; END IF;
    PERFORM public.kit_set_carried(v_person, v_van, v_line.kit_type_id, true, v_audit.is_test);

    v_item_id := v_line.kit_item_id;
    IF v_item_id IS NULL AND NULLIF(btrim(v_line.plant_no_snapshot), '') IS NOT NULL THEN
      SELECT id INTO v_item_id FROM public.kit_items
       WHERE status <> 'removed' AND lower(btrim(plant_no)) = lower(btrim(v_line.plant_no_snapshot)) LIMIT 1;
    END IF;

    IF v_item_id IS NULL THEN
      v_item_id := public.kit_add_item(v_line.kit_type_id, v_line.plant_no_snapshot, v_line.service_date,
                                       v_line.expiry_date, 'on_van', v_person, v_van, NULL, 'Recorded in audit',
                                       v_audit.is_test, p_actor_id, p_audit_id);
      -- Fosters / Hire (7 Nov 2026): only when the line has a choice; lines saved by older app code have none
      IF v_line.ownership IS NOT NULL THEN
        UPDATE public.kit_items SET ownership = v_line.ownership WHERE id = v_item_id;
      END IF;
    ELSE
      v_old := public.kit_snapshot(v_item_id);
      UPDATE public.kit_items SET
        plant_no = COALESCE(NULLIF(btrim(v_line.plant_no_snapshot), ''), plant_no),
        service_date = CASE WHEN v_line.kit_item_id = v_item_id THEN v_line.service_date ELSE COALESCE(v_line.service_date, service_date) END,
        expiry_date = CASE WHEN v_line.kit_item_id = v_item_id THEN v_line.expiry_date ELSE COALESCE(v_line.expiry_date, expiry_date) END,
        ownership = COALESCE(v_line.ownership, ownership),
        status = 'on_van',
        holder_employee_id = v_person,
        vehicle_id = v_van,
        vehicle_reg_snapshot = COALESCE(v_audit.vehicle_reg_snapshot, vehicle_reg_snapshot),
        service_company = NULL,
        removed_at = NULL,
        last_seen_at = now(),
        last_seen_source = 'audit',
        last_seen_audit_id = p_audit_id
      WHERE id = v_item_id;
      PERFORM public.kit_log(v_item_id, NULL, 'audit_seen', v_old, public.kit_snapshot(v_item_id),
                             NULL, NULL, p_audit_id, v_audit.is_test, p_actor_id);
    END IF;
    IF v_line.kit_item_id IS DISTINCT FROM v_item_id THEN
      UPDATE public.audit_lines SET kit_item_id = v_item_id WHERE id = v_line.id;
    END IF;
  END LOOP;

  FOR v_line IN
    SELECT l.* FROM public.audit_lines l
     WHERE l.audit_id = p_audit_id AND l.checklist_item_id IS NOT NULL
       AND (l.section = 'ppe'
         OR (l.section = 'hs' AND EXISTS (SELECT 1 FROM public.audit_checklist_items c WHERE c.id = l.checklist_item_id AND c.has_expiry)))
  LOOP
    SELECT id INTO v_ppe FROM public.audit_ppe_items
     WHERE checklist_item_id = v_line.checklist_item_id
       AND ((v_person IS NOT NULL AND holder_employee_id = v_person)
         OR (v_person IS NULL AND holder_employee_id IS NULL AND vehicle_id = v_van));
    IF v_ppe IS NULL THEN
      INSERT INTO public.audit_ppe_items
        (holder_employee_id, vehicle_id, vehicle_reg_snapshot, checklist_item_id, item_name, expiry_date,
         source, source_audit_id, is_test, updated_by)
      VALUES (v_person, v_van, v_audit.vehicle_reg_snapshot, v_line.checklist_item_id, v_line.item_name,
              v_line.expiry_date, 'audit', p_audit_id, v_audit.is_test, (SELECT auth.uid()));
    ELSE
      UPDATE public.audit_ppe_items SET
        expiry_date = v_line.expiry_date, item_name = v_line.item_name, source = 'audit',
        source_audit_id = p_audit_id, vehicle_reg_snapshot = v_audit.vehicle_reg_snapshot,
        is_test = v_audit.is_test, updated_by = (SELECT auth.uid()), updated_at = now()
      WHERE id = v_ppe;
    END IF;
    v_ppe := NULL;
  END LOOP;

  FOR v_line IN
    SELECT * FROM public.audit_lines WHERE audit_id = p_audit_id AND section IN ('ppe', 'hs', 'other') AND checklist_item_id IS NOT NULL
  LOOP
    UPDATE public.audit_holder_answers SET
      qty = NULLIF(btrim(v_line.qty), ''), service_date = v_line.service_date, label_on = v_line.label_on,
      date_tag = NULLIF(btrim(v_line.date_tag), ''), source_audit_id = p_audit_id, is_test = v_audit.is_test, updated_at = now()
    WHERE checklist_item_id = v_line.checklist_item_id
      AND ((v_person IS NOT NULL AND holder_employee_id = v_person)
        OR (v_person IS NULL AND holder_employee_id IS NULL AND vehicle_id = v_van));
    IF NOT FOUND THEN
      INSERT INTO public.audit_holder_answers
        (holder_employee_id, vehicle_id, checklist_item_id, qty, service_date, label_on, date_tag, source_audit_id, is_test)
      VALUES (v_person, v_van, v_line.checklist_item_id, NULLIF(btrim(v_line.qty), ''), v_line.service_date, v_line.label_on,
              NULLIF(btrim(v_line.date_tag), ''), p_audit_id, v_audit.is_test);
    END IF;
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.audit_edit(p_audit_id uuid, p_changes jsonb, p_actor_id uuid)
 RETURNS text[]
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_audit public.audit_site_audits%ROWTYPE;
  v_c jsonb;
  v_line public.audit_lines%ROWTYPE;
  v_field text;
  v_from text;
  v_to text;
  v_label text;
  v_summary text[] := '{}';
  v_log jsonb := '[]';
BEGIN
  PERFORM public.kit_require_admin();
  IF p_actor_id IS NULL THEN RAISE EXCEPTION 'Pick who’s doing this'; END IF;
  SELECT * INTO v_audit FROM public.audit_site_audits WHERE id = p_audit_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Audit not found'; END IF;
  IF v_audit.status <> 'submitted' THEN RAISE EXCEPTION 'Only submitted audits are edited this way'; END IF;

  PERFORM set_config('audit.allow_change', 'on', true);
  FOR v_c IN SELECT * FROM jsonb_array_elements(COALESCE(p_changes, '[]'::jsonb)) LOOP
    v_field := v_c ->> 'field';
    IF v_field NOT IN ('result', 'qty', 'comment', 'expiry_date', 'service_date', 'plant_no_snapshot', 'date_tag', 'label_on', 'gauge', 'ownership') THEN
      RAISE EXCEPTION 'That can’t be edited';
    END IF;
    SELECT * INTO v_line FROM public.audit_lines WHERE id = (v_c ->> 'line_id')::uuid AND audit_id = p_audit_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'That line is not on this audit'; END IF;
    v_from := NULLIF(btrim(to_jsonb(v_line) ->> v_field), '');
    v_to := NULLIF(btrim(v_c ->> 'to'), '');
    IF v_from IS NOT DISTINCT FROM v_to THEN CONTINUE; END IF;
    IF v_field = 'result' AND v_to IS NOT NULL AND v_to NOT IN ('Y', 'N', 'not_carried') THEN RAISE EXCEPTION 'Unknown answer %', v_to; END IF;
    IF v_field = 'label_on' AND v_to IS NOT NULL AND v_to NOT IN ('Y', 'N') THEN RAISE EXCEPTION 'Label on? is Y or N'; END IF;
    IF v_field = 'gauge' AND v_to IS NOT NULL AND v_to NOT IN ('green', 'amber', 'red') THEN RAISE EXCEPTION 'Pressure gauge is green, amber or red'; END IF;
    IF v_field = 'ownership' AND (v_to IS NULL OR v_to NOT IN ('fosters', 'hire')) THEN RAISE EXCEPTION 'Fosters or Hire'; END IF;

    EXECUTE format('UPDATE public.audit_lines SET %I = $1::%s WHERE id = $2', v_field,
                   CASE WHEN v_field IN ('expiry_date', 'service_date') THEN 'date' ELSE 'text' END)
      USING v_to, v_line.id;

    v_label := CASE v_field WHEN 'result' THEN NULL WHEN 'qty' THEN 'qty' WHEN 'comment' THEN 'comment'
                 WHEN 'expiry_date' THEN 'expiry' WHEN 'service_date' THEN 'service date'
                 WHEN 'plant_no_snapshot' THEN 'plant no' WHEN 'label_on' THEN 'label on' WHEN 'gauge' THEN 'gauge'
                 WHEN 'ownership' THEN 'Fosters / Hire' ELSE 'date/tag' END;
    v_summary := v_summary || (v_line.item_name || COALESCE(' ' || v_label || ':', '') || ' ' ||
      CASE WHEN v_from = 'not_carried' THEN 'Not carried' WHEN v_field = 'ownership' THEN COALESCE(initcap(v_from), '—') ELSE COALESCE(v_from, '—') END || ' → ' ||
      CASE WHEN v_to = 'not_carried' THEN 'Not carried' WHEN v_field = 'ownership' THEN COALESCE(initcap(v_to), '—') ELSE COALESCE(v_to, '—') END);
    v_log := v_log || jsonb_build_object('line_id', v_line.id, 'item', v_line.item_name, 'field', v_field, 'from', v_from, 'to', v_to);
  END LOOP;

  IF jsonb_array_length(v_log) = 0 THEN
    PERFORM set_config('audit.allow_change', 'off', true);
    RAISE EXCEPTION 'Nothing was changed';
  END IF;

  INSERT INTO public.audit_edits (audit_id, actor_id, actor_name, changes, summary, is_test)
  VALUES (p_audit_id, p_actor_id, public.kit_actor_name(p_actor_id), v_log, v_summary, v_audit.is_test);
  PERFORM public.audit_write_back(p_audit_id, p_actor_id);
  PERFORM set_config('audit.allow_change', 'off', true);
  RETURN v_summary;
END;
$function$;
