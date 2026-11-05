-- Round 9.
--  7. Dated H&S items: First aid kit, Eye wash, Burns kit, Fire extinguisher get an expiry
--     (fire extinguisher: service date + 12 months). Kept on the holder record like PPE dates
--     (audit_ppe_items), so they pre-fill, show in Needs attention and clear with Update.
--     Fire extinguisher "Pressure gauge" Green / Amber / Red: red = fail, amber = to look at.
--  8. Swap: a spare can come from a spare van as well as the Yard Lockup.
-- 10-12, 15. Standard photo slots (data) and audit photos (slot photos, "can't take photo"
--     reasons, additional photos with captions, taken-at time). Submit needs every required
--     slot to have a photo or a reason.
-- 13. Company name setting for the PDFs.
-- 14. "Cat & Genny" split into "CAT" (existing items stay on it) and a new "Genny".
-- Touches only this build's audit_ / kit_ objects. No DROP, no DELETE.

-- ---------------------------------------------------------------- 14. CAT and Genny
UPDATE public.kit_types SET name = 'CAT', sort_order = 10 WHERE name = 'Cat & Genny';
INSERT INTO public.kit_types (name, sort_order, is_active, service_interval_months)
SELECT 'Genny', 20, true, 12 WHERE NOT EXISTS (SELECT 1 FROM public.kit_types WHERE name = 'Genny');
UPDATE public.kit_types SET sort_order = CASE name
  WHEN 'CAT' THEN 10 WHEN 'Genny' THEN 20 WHEN 'Digger' THEN 30 WHEN 'Trailer' THEN 40
  WHEN 'STIHL saw' THEN 50 WHEN 'Floor saw' THEN 60 WHEN 'Breaker' THEN 70 WHEN 'Pecker' THEN 80
  ELSE sort_order END;
UPDATE public.kit_types SET service_interval_months = 12 WHERE name IN ('CAT', 'Genny') AND service_interval_months IS NULL;

-- ---------------------------------------------------------------- 7. dated H&S items + gauge
ALTER TABLE public.audit_checklist_items ADD COLUMN has_gauge boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.audit_checklist_items.has_gauge IS 'Ask "Pressure gauge" Green / Amber / Red (fire extinguisher)';
UPDATE public.audit_checklist_items SET has_expiry = true
 WHERE section = 'hs' AND name IN ('First aid kit', 'Eye wash', 'Burns kit', 'Fire ext 2KG dry powder');
UPDATE public.audit_checklist_items SET service_interval_months = 12, date_label = 'Service date', has_gauge = true
 WHERE section = 'hs' AND name = 'Fire ext 2KG dry powder';

ALTER TABLE public.audit_lines ADD COLUMN gauge text CHECK (gauge IN ('green', 'amber', 'red'));
COMMENT ON COLUMN public.audit_lines.gauge IS 'Pressure gauge: green / amber (to look at) / red (fail)';
ALTER TABLE public.audit_lines ADD COLUMN photo_taken_at timestamptz;

-- ---------------------------------------------------------------- 10-12, 15. photos
CREATE TABLE public.audit_photo_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  hint text,
  sort_order integer NOT NULL DEFAULT 0,
  required boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.audit_photo_slots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage photo slots" ON public.audit_photo_slots
  FOR ALL TO authenticated USING ((SELECT public.audit_is_admin())) WITH CHECK ((SELECT public.audit_is_admin()));
REVOKE ALL ON public.audit_photo_slots FROM anon;
INSERT INTO public.audit_photo_slots (name, hint, sort_order, required) VALUES
  ('Van & reg', 'Front of the van with the number plate', 10, true),
  ('Van open', 'Back doors open, kit visible', 20, true),
  ('Updated Powercare board', NULL, 30, true),
  ('CAT', NULL, 40, true),
  ('Genny', NULL, 50, true),
  ('First aid kit', NULL, 60, true),
  ('Eye wash', NULL, 70, true),
  ('Fire extinguisher', 'Show the pressure gauge', 80, true);

CREATE TABLE public.audit_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id uuid NOT NULL REFERENCES public.audit_site_audits(id) ON DELETE CASCADE,
  slot_id uuid REFERENCES public.audit_photo_slots(id) ON DELETE SET NULL,
  slot_name text,
  path text,
  caption text,
  skip_reason text,
  taken_at timestamptz,
  sort_order integer NOT NULL DEFAULT 0,
  is_test boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (path IS NOT NULL OR (slot_id IS NOT NULL AND NULLIF(btrim(skip_reason), '') IS NOT NULL))
);
COMMENT ON TABLE public.audit_photos IS 'Standard slot photos, "can''t take photo" reasons, and additional photos on an audit';
CREATE INDEX audit_photos_audit_idx ON public.audit_photos (audit_id, sort_order);
CREATE INDEX audit_photos_slot_idx ON public.audit_photos (slot_id);
ALTER TABLE public.audit_photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage audit photos" ON public.audit_photos
  FOR ALL TO authenticated USING ((SELECT public.audit_is_admin())) WITH CHECK ((SELECT public.audit_is_admin()));
REVOKE ALL ON public.audit_photos FROM anon;
-- same lock as lines and members: fixed once the audit is submitted
CREATE TRIGGER audit_photos_guard BEFORE UPDATE OR DELETE ON public.audit_photos
  FOR EACH ROW EXECUTE FUNCTION public.audit_guard_submitted();
CREATE TRIGGER audit_photos_guard_insert BEFORE INSERT ON public.audit_photos
  FOR EACH ROW EXECUTE FUNCTION public.audit_guard_insert_child();

-- ---------------------------------------------------------------- 13. company name
ALTER TABLE public.audit_settings ADD COLUMN company_name text NOT NULL DEFAULT 'Foster Utilities';

-- ---------------------------------------------------------------- write-back: dated H&S items kept like PPE dates
CREATE OR REPLACE FUNCTION public.audit_write_back(p_audit_id uuid, p_actor_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
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
    ELSE
      v_old := public.kit_snapshot(v_item_id);
      UPDATE public.kit_items SET
        plant_no = COALESCE(NULLIF(btrim(v_line.plant_no_snapshot), ''), plant_no),
        service_date = COALESCE(v_line.service_date, service_date),
        expiry_date = COALESCE(v_line.expiry_date, expiry_date),
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
    -- PPE dates, and the dated H&S items (first aid kit, eye wash, burns kit, fire extinguisher)
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

  -- carry-over answers on the holder record (quantities, date on hat, Label on, date / tag)
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
$$;

-- ---------------------------------------------------------------- submit: required photos
CREATE OR REPLACE FUNCTION public.audit_submit(p_audit_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_audit public.audit_site_audits%ROWTYPE;
  v_missing text;
BEGIN
  PERFORM public.kit_require_admin();
  SELECT * INTO v_audit FROM public.audit_site_audits WHERE id = p_audit_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Audit not found'; END IF;
  IF v_audit.status <> 'draft' THEN RAISE EXCEPTION 'This audit has already been submitted'; END IF;
  IF v_audit.auditor_id IS NULL THEN RAISE EXCEPTION 'Pick who did the audit (Audited by)'; END IF;
  SELECT string_agg(s.name, ', ' ORDER BY s.sort_order) INTO v_missing
    FROM public.audit_photo_slots s
   WHERE s.is_active AND s.required
     AND NOT EXISTS (SELECT 1 FROM public.audit_photos p
                      WHERE p.audit_id = p_audit_id AND p.slot_id = s.id
                        AND (p.path IS NOT NULL OR NULLIF(btrim(p.skip_reason), '') IS NOT NULL));
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'Required photos missing: %. Take each one, or tap "Can''t take photo" and give a reason.', v_missing;
  END IF;
  PERFORM public.audit_write_back(p_audit_id, v_audit.auditor_id);
  UPDATE public.audit_site_audits SET status = 'submitted', submitted_at = now() WHERE id = p_audit_id;
END;
$$;

-- ---------------------------------------------------------------- Edit audit: gauge
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
    IF v_field NOT IN ('result', 'qty', 'comment', 'expiry_date', 'service_date', 'plant_no_snapshot', 'date_tag', 'label_on', 'gauge') THEN
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

    EXECUTE format('UPDATE public.audit_lines SET %I = $1::%s WHERE id = $2', v_field,
                   CASE WHEN v_field IN ('expiry_date', 'service_date') THEN 'date' ELSE 'text' END)
      USING v_to, v_line.id;

    v_label := CASE v_field WHEN 'result' THEN NULL WHEN 'qty' THEN 'qty' WHEN 'comment' THEN 'comment'
                 WHEN 'expiry_date' THEN 'expiry' WHEN 'service_date' THEN 'service date'
                 WHEN 'plant_no_snapshot' THEN 'plant no' WHEN 'label_on' THEN 'label on' WHEN 'gauge' THEN 'gauge' ELSE 'date/tag' END;
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

-- ---------------------------------------------------------------- 8. swap: spares from the Yard Lockup OR a spare van
CREATE OR REPLACE FUNCTION public.kit_swap(p_item_id uuid, p_destination text, p_dest_holder_employee_id uuid, p_dest_vehicle_id uuid,
  p_service_company text, p_replacement text, p_spare_id uuid, p_new_plant_no text, p_new_service_date date, p_new_expiry_date date,
  p_note text, p_actor_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_item public.kit_items%ROWTYPE;
  v_spare public.kit_items%ROWTYPE;
  v_new uuid;
  v_from text;
BEGIN
  PERFORM public.kit_require_admin();
  SELECT * INTO v_item FROM public.kit_items WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Kit item not found'; END IF;
  IF v_item.status <> 'on_van' OR (v_item.holder_employee_id IS NULL AND v_item.vehicle_id IS NULL) THEN
    RAISE EXCEPTION 'Only kit that someone holds can be swapped';
  END IF;
  IF p_destination = 'holder' AND p_dest_holder_employee_id IS NOT DISTINCT FROM v_item.holder_employee_id
     AND (v_item.holder_employee_id IS NOT NULL OR p_dest_vehicle_id IS NOT DISTINCT FROM v_item.vehicle_id) THEN
    RAISE EXCEPTION 'Pick someone else';
  END IF;

  IF p_replacement = 'spare' THEN
    SELECT * INTO v_spare FROM public.kit_items WHERE id = p_spare_id FOR UPDATE;
    -- a spare is in the Yard Lockup, or is spare-van kit (on a van with no person)
    IF NOT FOUND OR v_spare.kit_type_id <> v_item.kit_type_id OR v_spare.id = v_item.id
       OR NOT (v_spare.status = 'spare' OR (v_spare.status = 'on_van' AND v_spare.holder_employee_id IS NULL AND v_spare.vehicle_id IS NOT NULL)) THEN
      RAISE EXCEPTION 'That spare is not available';
    END IF;
    IF v_spare.status = 'on_van' THEN
      SELECT ' (taken from ' || registration_number || ' · spare van)' INTO v_from FROM public.vehicles WHERE id = v_spare.vehicle_id;
    END IF;
  END IF;

  IF p_destination = 'holder' THEN
    PERFORM public.kit_move_item(p_item_id, 'on_van', p_dest_holder_employee_id, p_dest_vehicle_id, NULL, p_note, 'swapped_out', p_actor_id);
  ELSE
    PERFORM public.kit_move_item(p_item_id, p_destination, NULL, NULL, p_service_company, p_note, 'swapped_out', p_actor_id);
  END IF;

  IF p_replacement = 'spare' THEN
    PERFORM public.kit_move_item(p_spare_id, 'on_van', v_item.holder_employee_id, v_item.vehicle_id, NULL,
                                 COALESCE(p_note, 'Swapped in') || COALESCE(v_from, ''), 'swapped_in', p_actor_id);
    RETURN p_spare_id;
  ELSIF p_replacement = 'new' THEN
    v_new := public.kit_add_item(v_item.kit_type_id, p_new_plant_no, p_new_service_date, p_new_expiry_date,
                                 'on_van', v_item.holder_employee_id, v_item.vehicle_id, NULL, p_note,
                                 v_item.is_test, p_actor_id, NULL);
    PERFORM public.kit_log(v_new, NULL, 'swapped_in', NULL, public.kit_snapshot(v_new), p_note, NULL, NULL, v_item.is_test, p_actor_id);
    RETURN v_new;
  ELSIF p_replacement = 'none' THEN
    RETURN NULL;
  END IF;
  RAISE EXCEPTION 'Unknown replacement %', p_replacement;
END;
$$;

-- ---------------------------------------------------------------- summary: red gauge = fail, dated H&S counted, amber gauge = to look at
CREATE OR REPLACE VIEW public.audit_site_audit_summary WITH (security_invoker = true) AS
 SELECT a.id,
    a.audit_date,
    a.audited_by,
    a.audited_by_name,
    a.vehicle_id,
    COALESCE(a.vehicle_reg_snapshot, v.registration_number) AS vehicle_reg,
    a.ganger_id,
    a.ganger_name_snapshot,
    a.team_name_snapshot,
    a.site_visited,
    a.status,
    a.submitted_at,
    a.is_test,
    a.created_at,
    a.updated_at,
    COALESCE(c.fails, 0::bigint) AS fail_count,
    COALESCE(c.expired, 0::bigint) AS expired_count,
    COALESCE(c.due_soon, 0::bigint) AS due_soon_count,
    COALESCE(c.not_carried, 0::bigint) AS not_carried_count,
    m.member_names,
    a.auditor_id,
    a.auditor_name,
    a.holder_employee_id,
    COALESCE(c.to_look_at, 0::bigint) AS look_count
   FROM public.audit_site_audits a
     LEFT JOIN public.vehicles v ON v.id = a.vehicle_id
     LEFT JOIN LATERAL ( SELECT count(*) FILTER (WHERE l.result = 'N'::text OR l.label_on = 'N'::text OR l.gauge = 'red'::text) AS fails,
            count(*) FILTER (WHERE (l.section = ANY (ARRAY['ppe'::text, 'kit'::text, 'hs'::text])) AND l.result IS DISTINCT FROM 'not_carried'::text AND public.audit_expiry_status(l.expiry_date, a.audit_date) = 'expired'::text) AS expired,
            count(*) FILTER (WHERE (l.section = ANY (ARRAY['ppe'::text, 'kit'::text, 'hs'::text])) AND l.result IS DISTINCT FROM 'not_carried'::text AND public.audit_expiry_status(l.expiry_date, a.audit_date) = 'due_soon'::text) AS due_soon,
            count(*) FILTER (WHERE l.result = 'not_carried'::text) AS not_carried,
            count(*) FILTER (WHERE l.gauge = 'amber'::text) AS to_look_at
           FROM public.audit_lines l
          WHERE l.audit_id = a.id) c ON true
     LEFT JOIN LATERAL ( SELECT string_agg(mm.name, ', '::text ORDER BY mm.sort_order) AS member_names
           FROM public.audit_members mm
          WHERE mm.audit_id = a.id) m ON true;
