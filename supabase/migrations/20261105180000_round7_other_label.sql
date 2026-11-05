-- Round 7: "Other" section of the audit form.
-- Water containers, Gerry cans, Fuel cans: a "Label on?" Y/N answer instead of the
-- free-text date / tag / label box. NSF folder, Powercare checklist: no box at all.
-- The per-item setting lives on the checklist items (data). Edit audit accepts label_on.
-- Touches only this build's audit_ objects. No DROP, no DELETE.

ALTER TABLE public.audit_checklist_items ADD COLUMN has_label_check boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.audit_checklist_items.has_label_check IS 'Show a "Label on?" Y/N answer on the audit form (Other section)';

ALTER TABLE public.audit_lines ADD COLUMN label_on text CHECK (label_on IN ('Y', 'N'));
COMMENT ON COLUMN public.audit_lines.label_on IS '"Label on?" answer: Y / N / blank';

UPDATE public.audit_checklist_items
   SET has_label_check = true, has_date_tag = false
 WHERE section = 'other' AND name IN ('Water containers', 'Gerry cans', 'Fuel cans');
UPDATE public.audit_checklist_items
   SET has_date_tag = false
 WHERE section = 'other' AND name IN ('NSF folder', 'Powercare checklist');

CREATE OR REPLACE FUNCTION public.audit_edit(p_audit_id uuid, p_changes jsonb, p_actor_id uuid)
RETURNS text[]
LANGUAGE plpgsql
SET search_path = ''
AS $$
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
    IF v_field NOT IN ('result', 'qty', 'comment', 'expiry_date', 'service_date', 'plant_no_snapshot', 'date_tag', 'label_on') THEN
      RAISE EXCEPTION 'That can’t be edited';
    END IF;
    SELECT * INTO v_line FROM public.audit_lines WHERE id = (v_c ->> 'line_id')::uuid AND audit_id = p_audit_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'That line is not on this audit'; END IF;
    v_from := NULLIF(btrim(to_jsonb(v_line) ->> v_field), '');
    v_to := NULLIF(btrim(v_c ->> 'to'), '');
    IF v_from IS NOT DISTINCT FROM v_to THEN CONTINUE; END IF;
    IF v_field = 'result' AND v_to IS NOT NULL AND v_to NOT IN ('Y', 'N', 'not_carried') THEN RAISE EXCEPTION 'Unknown answer %', v_to; END IF;
    IF v_field = 'label_on' AND v_to IS NOT NULL AND v_to NOT IN ('Y', 'N') THEN RAISE EXCEPTION 'Label on? is Y or N'; END IF;

    EXECUTE format('UPDATE public.audit_lines SET %I = $1::%s WHERE id = $2', v_field,
                   CASE WHEN v_field IN ('expiry_date', 'service_date') THEN 'date' ELSE 'text' END)
      USING v_to, v_line.id;

    v_label := CASE v_field WHEN 'result' THEN NULL WHEN 'qty' THEN 'qty' WHEN 'comment' THEN 'comment'
                 WHEN 'expiry_date' THEN 'expiry' WHEN 'service_date' THEN 'service date'
                 WHEN 'plant_no_snapshot' THEN 'plant no' WHEN 'label_on' THEN 'label on' ELSE 'date/tag' END;
    v_summary := v_summary || (v_line.item_name || COALESCE(' ' || v_label || ':', '') || ' ' ||
      CASE WHEN v_from = 'not_carried' THEN 'Not carried' ELSE COALESCE(v_from, '—') END || ' → ' ||
      CASE WHEN v_to = 'not_carried' THEN 'Not carried' ELSE COALESCE(v_to, '—') END);
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
$$;
