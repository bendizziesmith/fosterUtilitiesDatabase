-- Round 8.
-- 1. "Label on? = N" counts as a fail, like Fit for purpose = N (one fail per line).
-- 2. Carry-over answers kept on the holder's record (person, or spare van), not only on the
--    last audit's lines: quantities, PPE "date on hat", Label on, date / tag. Deleting an
--    audit, or a draft not yet submitted, no longer loses them. Written by audit_write_back
--    (submit and Edit audit).
-- Touches only this build's audit_ objects. No DROP, no DELETE.

CREATE TABLE public.audit_holder_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  holder_employee_id uuid REFERENCES public.employees(id) ON DELETE CASCADE,
  vehicle_id uuid REFERENCES public.vehicles(id) ON DELETE CASCADE,
  checklist_item_id uuid NOT NULL REFERENCES public.audit_checklist_items(id) ON DELETE CASCADE,
  qty text,
  service_date date,
  label_on text CHECK (label_on IN ('Y', 'N')),
  date_tag text,
  source_audit_id uuid REFERENCES public.audit_site_audits(id) ON DELETE SET NULL,
  is_test boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (holder_employee_id IS NOT NULL OR vehicle_id IS NOT NULL)
);
COMMENT ON TABLE public.audit_holder_answers IS 'Last audit answers per person (or spare van) and checklist item, for the next audit''s pre-fill';
CREATE UNIQUE INDEX audit_holder_answers_person_uidx ON public.audit_holder_answers (holder_employee_id, checklist_item_id) WHERE holder_employee_id IS NOT NULL;
CREATE UNIQUE INDEX audit_holder_answers_van_uidx ON public.audit_holder_answers (vehicle_id, checklist_item_id) WHERE holder_employee_id IS NULL;
CREATE INDEX audit_holder_answers_item_idx ON public.audit_holder_answers (checklist_item_id);
CREATE INDEX audit_holder_answers_audit_idx ON public.audit_holder_answers (source_audit_id);
ALTER TABLE public.audit_holder_answers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage holder answers" ON public.audit_holder_answers
  FOR ALL TO authenticated USING ((SELECT public.audit_is_admin())) WITH CHECK ((SELECT public.audit_is_admin()));
REVOKE ALL ON public.audit_holder_answers FROM anon;

-- what is already on record from submitted audits (latest per holder and item)
INSERT INTO public.audit_holder_answers (holder_employee_id, vehicle_id, checklist_item_id, qty, service_date, label_on, date_tag, source_audit_id, is_test, updated_at)
SELECT DISTINCT ON (COALESCE(a.holder_employee_id, a.vehicle_id), l.checklist_item_id)
       a.holder_employee_id, CASE WHEN a.holder_employee_id IS NULL THEN a.vehicle_id END, l.checklist_item_id,
       NULLIF(btrim(l.qty), ''), l.service_date, l.label_on, NULLIF(btrim(l.date_tag), ''), a.id, a.is_test, COALESCE(a.submitted_at, now())
  FROM public.audit_lines l
  JOIN public.audit_site_audits a ON a.id = l.audit_id
 WHERE a.status = 'submitted' AND l.section IN ('ppe', 'hs', 'other') AND l.checklist_item_id IS NOT NULL
   AND (a.holder_employee_id IS NOT NULL OR a.vehicle_id IS NOT NULL)
 ORDER BY COALESCE(a.holder_employee_id, a.vehicle_id), l.checklist_item_id, a.audit_date DESC, a.submitted_at DESC;

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
    SELECT * FROM public.audit_lines WHERE audit_id = p_audit_id AND section = 'ppe' AND checklist_item_id IS NOT NULL
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
    a.holder_employee_id
   FROM public.audit_site_audits a
     LEFT JOIN public.vehicles v ON v.id = a.vehicle_id
     LEFT JOIN LATERAL ( SELECT count(*) FILTER (WHERE l.result = 'N'::text OR l.label_on = 'N'::text) AS fails,
            count(*) FILTER (WHERE (l.section = ANY (ARRAY['ppe'::text, 'kit'::text])) AND l.result IS DISTINCT FROM 'not_carried'::text AND public.audit_expiry_status(l.expiry_date, a.audit_date) = 'expired'::text) AS expired,
            count(*) FILTER (WHERE (l.section = ANY (ARRAY['ppe'::text, 'kit'::text])) AND l.result IS DISTINCT FROM 'not_carried'::text AND public.audit_expiry_status(l.expiry_date, a.audit_date) = 'due_soon'::text) AS due_soon,
            count(*) FILTER (WHERE l.result = 'not_carried'::text) AS not_carried
           FROM public.audit_lines l
          WHERE l.audit_id = a.id) c ON true
     LEFT JOIN LATERAL ( SELECT string_agg(mm.name, ', '::text ORDER BY mm.sort_order) AS member_names
           FROM public.audit_members mm
          WHERE mm.audit_id = a.id) m ON true;
