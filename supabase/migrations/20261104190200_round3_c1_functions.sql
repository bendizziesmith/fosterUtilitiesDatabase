/*
  # Round 3 (part C1) — this build's kit/audit functions recreated (holders + "Who's doing this?")
  Drops and recreates ONLY functions made in this build. Views are untouched (step C2).
*/

DROP FUNCTION public.kit_change_van(uuid, uuid, jsonb, text, boolean);
DROP FUNCTION public.audit_submit(uuid);
DROP FUNCTION public.audit_update_ppe(uuid, date, text, text);
DROP FUNCTION public.kit_swap(uuid, text, uuid, text, text, uuid, text, date, date, text);
DROP FUNCTION public.kit_move_item(uuid, text, uuid, text, text, text);
DROP FUNCTION public.kit_update_item(uuid, text, date, date, text, text, text);
DROP FUNCTION public.kit_add_item(uuid, text, date, date, text, uuid, text, text, boolean, uuid);
DROP FUNCTION public.kit_set_van_carried(uuid, uuid, boolean, boolean);
DROP FUNCTION public.kit_log(uuid, uuid, text, jsonb, jsonb, text, text, uuid, boolean);
DROP FUNCTION public.kit_snapshot(uuid);

CREATE FUNCTION public.kit_actor_name(p_actor_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = ''
AS $$ SELECT name FROM public.audit_auditors WHERE id = p_actor_id; $$;

CREATE FUNCTION public.kit_snapshot(p_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'plant_no', k.plant_no, 'status', k.status,
    'holder_employee_id', k.holder_employee_id, 'holder_name', e.full_name,
    'vehicle_id', COALESCE(e.assigned_vehicle_id, k.vehicle_id),
    'spare_vehicle_id', CASE WHEN k.holder_employee_id IS NULL THEN k.vehicle_id END,
    'vehicle_reg', COALESCE(v.registration_number, k.vehicle_reg_snapshot),
    'service_company', k.service_company,
    'service_date', k.service_date, 'expiry_date', k.expiry_date)
  FROM public.kit_items k
  LEFT JOIN public.employees e ON e.id = k.holder_employee_id
  LEFT JOIN public.vehicles v ON v.id = COALESCE(e.assigned_vehicle_id, k.vehicle_id)
  WHERE k.id = p_id;
$$;

CREATE FUNCTION public.kit_log(
  p_kit_item_id uuid, p_ppe_item_id uuid, p_action text,
  p_old jsonb, p_new jsonb, p_note text, p_certificate_path text,
  p_audit_id uuid, p_is_test boolean, p_actor_id uuid)
RETURNS void
LANGUAGE sql
SET search_path = ''
AS $$
  INSERT INTO public.kit_history
    (kit_item_id, ppe_item_id, action, old_values, new_values, note,
     certificate_path, audit_id, by_user, by_name, is_test, actor_id, actor_name)
  VALUES
    (p_kit_item_id, p_ppe_item_id, p_action, p_old, p_new, NULLIF(btrim(p_note), ''),
     NULLIF(btrim(p_certificate_path), ''), p_audit_id, (SELECT auth.uid()),
     public.audit_actor_name(), COALESCE(p_is_test, false), p_actor_id, public.kit_actor_name(p_actor_id));
$$;

/* "Not carried" list for a person (p_holder_employee_id) or a spare van (p_vehicle_id). */
CREATE FUNCTION public.kit_set_carried(
  p_holder_employee_id uuid, p_vehicle_id uuid, p_kit_type_id uuid, p_carried boolean, p_is_test boolean DEFAULT false)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  PERFORM public.kit_require_admin();
  IF p_kit_type_id IS NULL OR (p_holder_employee_id IS NULL AND p_vehicle_id IS NULL) THEN RETURN; END IF;
  IF p_holder_employee_id IS NOT NULL THEN
    UPDATE public.kit_van_kit_list SET carried = p_carried, updated_by = (SELECT auth.uid()), updated_at = now()
     WHERE holder_employee_id = p_holder_employee_id AND kit_type_id = p_kit_type_id;
  ELSE
    UPDATE public.kit_van_kit_list SET carried = p_carried, updated_by = (SELECT auth.uid()), updated_at = now()
     WHERE holder_employee_id IS NULL AND vehicle_id = p_vehicle_id AND kit_type_id = p_kit_type_id;
  END IF;
  IF NOT FOUND THEN
    INSERT INTO public.kit_van_kit_list (holder_employee_id, vehicle_id, kit_type_id, carried, is_test, updated_by)
    VALUES (p_holder_employee_id, CASE WHEN p_holder_employee_id IS NULL THEN p_vehicle_id END,
            p_kit_type_id, p_carried, COALESCE(p_is_test, false), (SELECT auth.uid()));
  END IF;
END;
$$;

CREATE FUNCTION public.kit_add_item(
  p_kit_type_id uuid, p_plant_no text, p_service_date date, p_expiry_date date,
  p_status text, p_holder_employee_id uuid, p_vehicle_id uuid, p_service_company text, p_notes text,
  p_is_test boolean, p_actor_id uuid, p_audit_id uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
  v_van uuid;
  v_reg text;
BEGIN
  PERFORM public.kit_require_admin();
  IF p_status NOT IN ('on_van', 'spare', 'away_for_service') THEN
    RAISE EXCEPTION 'Choose where the kit is: a person, a spare van, spare in yard, or away for service';
  END IF;
  IF p_status = 'on_van' AND p_holder_employee_id IS NULL AND p_vehicle_id IS NULL THEN
    RAISE EXCEPTION 'Pick who holds this kit';
  END IF;
  IF p_status = 'on_van' THEN
    v_van := COALESCE((SELECT assigned_vehicle_id FROM public.employees WHERE id = p_holder_employee_id), p_vehicle_id);
    SELECT registration_number INTO v_reg FROM public.vehicles WHERE id = v_van;
  END IF;

  INSERT INTO public.kit_items
    (kit_type_id, plant_no, status, holder_employee_id, vehicle_id, vehicle_reg_snapshot, service_company,
     service_date, expiry_date, notes, last_seen_at, last_seen_source, last_seen_audit_id,
     is_test, created_by)
  VALUES
    (p_kit_type_id, NULLIF(btrim(p_plant_no), ''), p_status,
     CASE WHEN p_status = 'on_van' THEN p_holder_employee_id END,
     CASE WHEN p_status = 'on_van' AND p_holder_employee_id IS NULL THEN p_vehicle_id END,
     v_reg,
     CASE WHEN p_status = 'away_for_service' THEN NULLIF(btrim(p_service_company), '') END,
     p_service_date, p_expiry_date, NULLIF(btrim(p_notes), ''), now(),
     CASE WHEN p_audit_id IS NULL THEN 'added' ELSE 'audit' END, p_audit_id,
     COALESCE(p_is_test, false), (SELECT auth.uid()))
  RETURNING id INTO v_id;

  IF p_status = 'on_van' THEN
    PERFORM public.kit_set_carried(p_holder_employee_id, p_vehicle_id, p_kit_type_id, true, p_is_test);
  END IF;
  PERFORM public.kit_log(v_id, NULL, 'added', NULL, public.kit_snapshot(v_id), p_notes, NULL, p_audit_id, p_is_test, p_actor_id);
  RETURN v_id;
END;
$$;

CREATE FUNCTION public.kit_update_item(
  p_item_id uuid, p_action text, p_service_date date, p_expiry_date date,
  p_plant_no text, p_certificate_path text, p_note text, p_actor_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_old jsonb;
  v_is_test boolean;
BEGIN
  PERFORM public.kit_require_admin();
  IF p_action NOT IN ('reserviced', 'replaced') THEN
    RAISE EXCEPTION 'Unknown update type %', p_action;
  END IF;
  SELECT is_test INTO v_is_test FROM public.kit_items WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Kit item not found'; END IF;
  v_old := public.kit_snapshot(p_item_id);
  UPDATE public.kit_items SET
    service_date = p_service_date,
    expiry_date = p_expiry_date,
    plant_no = COALESCE(NULLIF(btrim(p_plant_no), ''), plant_no),
    last_seen_at = now(),
    last_seen_source = 'update'
  WHERE id = p_item_id;
  PERFORM public.kit_log(p_item_id, NULL, p_action, v_old, public.kit_snapshot(p_item_id),
                         p_note, p_certificate_path, NULL, v_is_test, p_actor_id);
END;
$$;

/* Move to: on_van (a person, or a spare van) / spare / away_for_service / removed. */
CREATE FUNCTION public.kit_move_item(
  p_item_id uuid, p_status text, p_holder_employee_id uuid, p_vehicle_id uuid, p_service_company text,
  p_note text, p_action text, p_actor_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_old jsonb;
  v_old_status text;
  v_type uuid;
  v_is_test boolean;
  v_reg text;
  v_action text;
BEGIN
  PERFORM public.kit_require_admin();
  IF p_status NOT IN ('on_van', 'spare', 'away_for_service', 'removed') THEN
    RAISE EXCEPTION 'Unknown destination %', p_status;
  END IF;
  IF p_status = 'on_van' AND p_holder_employee_id IS NULL AND p_vehicle_id IS NULL THEN
    RAISE EXCEPTION 'Pick who holds it';
  END IF;
  SELECT status, kit_type_id, is_test INTO v_old_status, v_type, v_is_test
  FROM public.kit_items WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Kit item not found'; END IF;
  v_old := public.kit_snapshot(p_item_id);
  IF p_status = 'on_van' THEN
    SELECT registration_number INTO v_reg FROM public.vehicles
     WHERE id = COALESCE((SELECT assigned_vehicle_id FROM public.employees WHERE id = p_holder_employee_id), p_vehicle_id);
  END IF;

  v_action := COALESCE(p_action, CASE
    WHEN p_status = 'removed' THEN 'removed'
    WHEN p_status = 'away_for_service' THEN 'sent_for_service'
    WHEN v_old_status = 'away_for_service' THEN 'back_from_service'
    WHEN p_status = 'spare' THEN 'moved_to_spare'
    ELSE 'assigned'
  END);

  UPDATE public.kit_items SET
    status = p_status,
    holder_employee_id = CASE WHEN p_status = 'on_van' THEN p_holder_employee_id END,
    vehicle_id = CASE WHEN p_status = 'on_van' AND p_holder_employee_id IS NULL THEN p_vehicle_id END,
    vehicle_reg_snapshot = COALESCE(v_reg, vehicle_reg_snapshot),
    service_company = CASE WHEN p_status = 'away_for_service' THEN NULLIF(btrim(p_service_company), '') END,
    removed_at = CASE WHEN p_status = 'removed' THEN now() END,
    last_seen_at = now(),
    last_seen_source = CASE WHEN v_action IN ('swapped_out', 'swapped_in') THEN 'swap' ELSE 'moved' END
  WHERE id = p_item_id;

  IF p_status = 'on_van' THEN
    PERFORM public.kit_set_carried(p_holder_employee_id, p_vehicle_id, v_type, true, v_is_test);
  END IF;
  PERFORM public.kit_log(p_item_id, NULL, v_action, v_old, public.kit_snapshot(p_item_id),
                         p_note, NULL, NULL, v_is_test, p_actor_id);
END;
$$;

/* Swap a held item. Destination 'holder' = another person or spare van. The replacement goes to the same holder. */
CREATE FUNCTION public.kit_swap(
  p_item_id uuid, p_destination text, p_dest_holder_employee_id uuid, p_dest_vehicle_id uuid, p_service_company text,
  p_replacement text, p_spare_id uuid, p_new_plant_no text, p_new_service_date date,
  p_new_expiry_date date, p_note text, p_actor_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_item public.kit_items%ROWTYPE;
  v_spare public.kit_items%ROWTYPE;
  v_new uuid;
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

  IF p_destination = 'holder' THEN
    PERFORM public.kit_move_item(p_item_id, 'on_van', p_dest_holder_employee_id, p_dest_vehicle_id, NULL, p_note, 'swapped_out', p_actor_id);
  ELSE
    PERFORM public.kit_move_item(p_item_id, p_destination, NULL, NULL, p_service_company, p_note, 'swapped_out', p_actor_id);
  END IF;

  IF p_replacement = 'spare' THEN
    SELECT * INTO v_spare FROM public.kit_items WHERE id = p_spare_id FOR UPDATE;
    IF NOT FOUND OR v_spare.status <> 'spare' OR v_spare.kit_type_id <> v_item.kit_type_id THEN
      RAISE EXCEPTION 'That spare is not available';
    END IF;
    PERFORM public.kit_move_item(p_spare_id, 'on_van', v_item.holder_employee_id, v_item.vehicle_id, NULL, p_note, 'swapped_in', p_actor_id);
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

CREATE FUNCTION public.audit_update_ppe(
  p_ppe_id uuid, p_expiry_date date, p_certificate_path text, p_note text, p_actor_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_old date;
  v_is_test boolean;
BEGIN
  PERFORM public.kit_require_admin();
  SELECT expiry_date, is_test INTO v_old, v_is_test FROM public.audit_ppe_items WHERE id = p_ppe_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PPE item not found'; END IF;
  UPDATE public.audit_ppe_items
     SET expiry_date = p_expiry_date, source = 'update', updated_by = (SELECT auth.uid()), updated_at = now()
   WHERE id = p_ppe_id;
  PERFORM public.kit_log(NULL, p_ppe_id, 'expiry_updated',
                         jsonb_build_object('expiry_date', v_old), jsonb_build_object('expiry_date', p_expiry_date),
                         p_note, p_certificate_path, NULL, v_is_test, p_actor_id);
END;
$$;

/* Submit: fixes the audit and writes back to the audited person (holder_employee_id) or spare van (vehicle_id). */
CREATE FUNCTION public.audit_submit(p_audit_id uuid)
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
  PERFORM public.kit_require_admin();
  SELECT * INTO v_audit FROM public.audit_site_audits WHERE id = p_audit_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Audit not found'; END IF;
  IF v_audit.status <> 'draft' THEN RAISE EXCEPTION 'This audit has already been submitted'; END IF;
  IF v_audit.auditor_id IS NULL THEN RAISE EXCEPTION 'Pick who did the audit (Audited by)'; END IF;
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
                                       v_audit.is_test, v_audit.auditor_id, p_audit_id);
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
                             NULL, NULL, p_audit_id, v_audit.is_test, v_audit.auditor_id);
    END IF;
    UPDATE public.audit_lines SET kit_item_id = v_item_id WHERE id = v_line.id;
  END LOOP;

  -- PPE: this audit sets the person's / spare van's expiry dates
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

  UPDATE public.audit_site_audits SET status = 'submitted', submitted_at = now() WHERE id = p_audit_id;
END;
$$;

/*
  Change van, with kit held by the person. Moves:
    person  -> the person now holds it (kit from the new van's spare-van stock)
    old_van -> whoever else is assigned the old van, else spare-van kit of the old van
    spare   -> yard
  employees is NOT written here; the app does that, and only in a live build.
*/
CREATE FUNCTION public.kit_change_van(
  p_person_id uuid, p_old_vehicle_id uuid, p_new_vehicle_id uuid, p_moves jsonb,
  p_note text, p_is_test boolean, p_actor_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_move jsonb;
  v_item public.kit_items%ROWTYPE;
  v_to text;
  v_note text := COALESCE(NULLIF(btrim(p_note), ''), 'Van change');
  v_other uuid;
BEGIN
  PERFORM public.kit_require_admin();
  IF p_person_id IS NULL THEN RAISE EXCEPTION 'Pick the person'; END IF;
  IF p_new_vehicle_id IS NULL THEN RAISE EXCEPTION 'Pick the new van'; END IF;
  IF p_new_vehicle_id = p_old_vehicle_id THEN RAISE EXCEPTION 'The new van is the same as the old van'; END IF;

  FOR v_move IN SELECT * FROM jsonb_array_elements(COALESCE(p_moves, '[]'::jsonb)) LOOP
    v_to := v_move ->> 'to';
    SELECT * INTO v_item FROM public.kit_items WHERE id = (v_move ->> 'item_id')::uuid FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Kit item not found'; END IF;
    IF COALESCE(p_is_test, false) AND NOT v_item.is_test THEN
      RAISE EXCEPTION 'Test mode can only move test kit (% is real kit)', COALESCE(v_item.plant_no, 'an item');
    END IF;
    -- must still be the person's kit, or spare-van kit of the old / new van
    IF v_item.status <> 'on_van' OR NOT (
         v_item.holder_employee_id = p_person_id
         OR (v_item.holder_employee_id IS NULL AND v_item.vehicle_id IN (p_new_vehicle_id, COALESCE(p_old_vehicle_id, p_new_vehicle_id)))) THEN
      RAISE EXCEPTION '% is no longer where it was; reload and try again', COALESCE(v_item.plant_no, 'An item');
    END IF;

    IF v_to = 'person' THEN
      PERFORM public.kit_move_item(v_item.id, 'on_van', p_person_id, NULL, NULL, v_note, 'assigned', p_actor_id);
    ELSIF v_to = 'old_van' THEN
      IF p_old_vehicle_id IS NULL THEN RAISE EXCEPTION 'There is no old van to leave kit with'; END IF;
      v_other := public.kit_person_on_van(p_old_vehicle_id, p_person_id);
      PERFORM public.kit_move_item(v_item.id, 'on_van', v_other, CASE WHEN v_other IS NULL THEN p_old_vehicle_id END,
                                   NULL, v_note, 'assigned', p_actor_id);
    ELSIF v_to = 'spare' THEN
      PERFORM public.kit_move_item(v_item.id, 'spare', NULL, NULL, NULL, v_note, 'moved_to_spare', p_actor_id);
    ELSE
      RAISE EXCEPTION 'Unknown move %', v_to;
    END IF;
  END LOOP;
END;
$$;

-- =============================================================== 4. views (recreated)

REVOKE EXECUTE ON FUNCTION
  public.kit_person_on_van(uuid, uuid), public.kit_actor_name(uuid), public.kit_snapshot(uuid),
  public.kit_log(uuid, uuid, text, jsonb, jsonb, text, text, uuid, boolean, uuid),
  public.kit_set_carried(uuid, uuid, uuid, boolean, boolean),
  public.kit_add_item(uuid, text, date, date, text, uuid, uuid, text, text, boolean, uuid, uuid),
  public.kit_update_item(uuid, text, date, date, text, text, text, uuid),
  public.kit_move_item(uuid, text, uuid, uuid, text, text, text, uuid),
  public.kit_swap(uuid, text, uuid, uuid, text, text, uuid, text, date, date, text, uuid),
  public.audit_update_ppe(uuid, date, text, text, uuid),
  public.audit_submit(uuid),
  public.kit_change_van(uuid, uuid, uuid, jsonb, text, boolean, uuid)
FROM anon, public;

GRANT EXECUTE ON FUNCTION
  public.kit_person_on_van(uuid, uuid), public.kit_actor_name(uuid), public.kit_snapshot(uuid),
  public.kit_log(uuid, uuid, text, jsonb, jsonb, text, text, uuid, boolean, uuid),
  public.kit_set_carried(uuid, uuid, uuid, boolean, boolean),
  public.kit_add_item(uuid, text, date, date, text, uuid, uuid, text, text, boolean, uuid, uuid),
  public.kit_update_item(uuid, text, date, date, text, text, text, uuid),
  public.kit_move_item(uuid, text, uuid, uuid, text, text, text, uuid),
  public.kit_swap(uuid, text, uuid, uuid, text, text, uuid, text, date, date, text, uuid),
  public.audit_update_ppe(uuid, date, text, text, uuid),
  public.audit_submit(uuid),
  public.kit_change_van(uuid, uuid, uuid, jsonb, text, boolean, uuid)
TO authenticated;
