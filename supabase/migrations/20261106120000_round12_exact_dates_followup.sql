-- Round 12.
-- 1. Date bug (the main cause was in the app: a swap in the audit form rebuilt every kit row from the
--    record). Here: when a kit row was pre-filled from an item, write back exactly what is on screen,
--    including a date cleared to N/A (it used to keep the old date).
-- 2. "What has happened since": per audit line, the item's current state and the latest change after
--    the audit (re-serviced / replaced / updated / swapped / away / deleted) and whether an expired,
--    due-soon or failed item is now resolved; per audit, how many are resolved.
-- Touches only this build's audit_ / kit_ objects. No DROP, no DELETE.

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
        -- the row was pre-filled from this item: save exactly what is on screen (a cleared date clears it);
        -- an item only matched by plant no keeps its own dates where the line has none
        service_date = CASE WHEN v_line.kit_item_id = v_item_id THEN v_line.service_date ELSE COALESCE(v_line.service_date, service_date) END,
        expiry_date = CASE WHEN v_line.kit_item_id = v_item_id THEN v_line.expiry_date ELSE COALESCE(v_line.expiry_date, expiry_date) END,
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

CREATE VIEW public.audit_line_followup WITH (security_invoker = true) AS
SELECT l.id AS line_id,
       l.audit_id,
       l.section,
       l.item_name,
       f.is_fail,
       f.date_problem,
       (l.section = 'kit' AND l.kit_item_id IS NULL AND NULLIF(btrim(l.plant_no_snapshot), '') IS NOT NULL
         AND l.result IN ('Y', 'N') AND a.status = 'submitted') AS deleted,
       k.status AS kit_status,
       COALESCE(k.expiry_date, p.expiry_date) AS current_expiry,
       CASE WHEN l.section = 'kit' THEN k.id IS NOT NULL AND k.expiry_date IS DISTINCT FROM l.expiry_date
            ELSE p.id IS NOT NULL AND p.expiry_date IS DISTINCT FROM l.expiry_date END AS expiry_changed,
       ev.action AS last_action,
       ev.created_at AS last_action_at,
       ev.actor AS last_action_by,
       sw.plant_no AS swapped_for,
       (f.is_fail AND (
          (l.section = 'kit' AND l.kit_item_id IS NULL AND NULLIF(btrim(l.plant_no_snapshot), '') IS NOT NULL AND l.result IN ('Y', 'N') AND a.status = 'submitted')
          OR ev.action IN ('reserviced', 'replaced', 'swapped_out', 'removed')
          OR (l.section = 'kit' AND k.status IN ('away_for_service', 'spare', 'removed')))) AS fail_resolved,
       (f.date_problem IS NOT NULL AND (
          (l.section = 'kit' AND l.kit_item_id IS NULL AND NULLIF(btrim(l.plant_no_snapshot), '') IS NOT NULL AND l.result IN ('Y', 'N') AND a.status = 'submitted')
          OR ev.action IN ('swapped_out', 'removed')
          OR (l.section = 'kit' AND k.status IN ('away_for_service', 'spare', 'removed'))
          OR public.audit_expiry_status(COALESCE(k.expiry_date, p.expiry_date)) = 'ok')) AS date_resolved
  FROM public.audit_lines l
  JOIN public.audit_site_audits a ON a.id = l.audit_id
  CROSS JOIN LATERAL (
    SELECT COALESCE(l.result = 'N' OR l.label_on = 'N' OR l.gauge = 'red', false) AS is_fail,
           CASE WHEN l.result IS DISTINCT FROM 'not_carried' AND l.section IN ('ppe', 'hs', 'kit')
                THEN NULLIF(public.audit_expiry_status(l.expiry_date, a.audit_date), 'ok') END AS date_problem
  ) f
  LEFT JOIN public.kit_items k ON k.id = l.kit_item_id
  LEFT JOIN public.audit_ppe_items p
         ON l.section IN ('ppe', 'hs') AND p.checklist_item_id = l.checklist_item_id
        AND ((a.holder_employee_id IS NOT NULL AND p.holder_employee_id = a.holder_employee_id)
          OR (a.holder_employee_id IS NULL AND p.holder_employee_id IS NULL AND p.vehicle_id = a.vehicle_id))
  LEFT JOIN LATERAL (
    SELECT h.action, h.created_at, COALESCE(NULLIF(btrim(h.actor_name), ''), h.by_name) AS actor
      FROM public.kit_history h
     WHERE a.submitted_at IS NOT NULL AND h.created_at > a.submitted_at AND h.action <> 'audit_seen'
       AND ((k.id IS NOT NULL AND h.kit_item_id = k.id) OR (p.id IS NOT NULL AND h.ppe_item_id = p.id))
     ORDER BY h.created_at DESC
     LIMIT 1
  ) ev ON true
  LEFT JOIN LATERAL (
    SELECT COALESCE(k2.plant_no, h2.new_values ->> 'plant_no') AS plant_no
      FROM public.kit_history h2
      LEFT JOIN public.kit_items k2 ON k2.id = h2.kit_item_id
     WHERE ev.action = 'swapped_out' AND h2.action = 'swapped_in' AND h2.created_at = ev.created_at
     LIMIT 1
  ) sw ON true;
COMMENT ON VIEW public.audit_line_followup IS 'Per audit line: what has happened to the item since the audit, and whether a problem found on the day is resolved';
REVOKE ALL ON public.audit_line_followup FROM anon;

CREATE VIEW public.audit_resolution WITH (security_invoker = true) AS
SELECT audit_id,
       count(*) FILTER (WHERE is_fail AND fail_resolved) AS fails_resolved,
       count(*) FILTER (WHERE date_problem = 'expired' AND date_resolved) AS expired_resolved,
       count(*) FILTER (WHERE date_problem = 'due_soon' AND date_resolved) AS due_soon_resolved
  FROM public.audit_line_followup
 GROUP BY audit_id;
COMMENT ON VIEW public.audit_resolution IS 'Per audit: how many of the fails / expired / due-soon items found on the day are now resolved';
REVOKE ALL ON public.audit_resolution FROM anon;
