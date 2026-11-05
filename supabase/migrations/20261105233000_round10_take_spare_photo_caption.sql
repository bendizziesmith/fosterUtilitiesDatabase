-- Round 10.
-- 1. Change van "Anything missing?": the same Save can take a spare (Yard Lockup, or spare-van kit
--    on any van) or add a new item for the person. Every move is logged by kit_move_item, so it
--    shows on the van it came from and on the person it went to.
-- 2. Photo captions on a submitted audit: the lock refuses direct changes (as it should), so a
--    caption change goes through this function, which opens the lock for that one change and logs
--    it like Edit audit. (Deleting a photo never changes the row: the file is removed and the
--    deletion is recorded, so the lock is not in the way.)
-- Touches only this build's audit_ / kit_ objects. No DROP, no DELETE.

CREATE OR REPLACE FUNCTION public.kit_change_van(p_person_id uuid, p_old_vehicle_id uuid, p_new_vehicle_id uuid, p_moves jsonb,
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
  v_from text;
BEGIN
  PERFORM public.kit_require_admin();
  IF p_person_id IS NULL THEN RAISE EXCEPTION 'Pick the person'; END IF;
  IF p_new_vehicle_id IS NULL THEN RAISE EXCEPTION 'Pick the new van'; END IF;
  IF p_new_vehicle_id = p_old_vehicle_id THEN RAISE EXCEPTION 'The new van is the same as the old van'; END IF;

  FOR v_move IN SELECT * FROM jsonb_array_elements(COALESCE(p_moves, '[]'::jsonb)) LOOP
    v_to := v_move ->> 'to';

    -- a new item for the person (no spare of that type to take)
    IF v_to = 'new' THEN
      PERFORM public.kit_add_item((v_move ->> 'kit_type_id')::uuid, v_move ->> 'plant_no', (v_move ->> 'service_date')::date,
                                  (v_move ->> 'expiry_date')::date, 'on_van', p_person_id, NULL, NULL,
                                  v_note || ': new for the van change', COALESCE(p_is_test, false), p_actor_id, NULL);
      CONTINUE;
    END IF;

    SELECT * INTO v_item FROM public.kit_items WHERE id = (v_move ->> 'item_id')::uuid FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Kit item not found'; END IF;
    IF COALESCE(p_is_test, false) AND NOT v_item.is_test THEN
      RAISE EXCEPTION 'Test mode can only move test kit (% is real kit)', COALESCE(v_item.plant_no, 'an item');
    END IF;

    -- take a spare: in the Yard Lockup, or spare-van kit (on a van with no person)
    IF v_to = 'take' THEN
      IF NOT (v_item.status = 'spare' OR (v_item.status = 'on_van' AND v_item.holder_employee_id IS NULL AND v_item.vehicle_id IS NOT NULL)) THEN
        RAISE EXCEPTION '% is not a spare any more; reload and try again', COALESCE(v_item.plant_no, 'That item');
      END IF;
      IF v_item.status = 'spare' THEN
        v_from := 'the Yard Lockup';
      ELSE
        SELECT registration_number || ' · spare van' INTO v_from FROM public.vehicles WHERE id = v_item.vehicle_id;
      END IF;
      PERFORM public.kit_move_item(v_item.id, 'on_van', p_person_id, NULL, NULL,
                                   v_note || ': taken from ' || COALESCE(v_from, 'a spare van'), 'assigned', p_actor_id);
      CONTINUE;
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

CREATE FUNCTION public.audit_photo_caption(p_photo_id uuid, p_caption text, p_actor_id uuid)
RETURNS text
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_p public.audit_photos%ROWTYPE;
  v_audit public.audit_site_audits%ROWTYPE;
  v_new text;
  v_sum text;
BEGIN
  PERFORM public.kit_require_admin();
  IF p_actor_id IS NULL THEN RAISE EXCEPTION 'Pick who’s doing this'; END IF;
  SELECT * INTO v_p FROM public.audit_photos WHERE id = p_photo_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Photo not found'; END IF;
  IF v_p.path IS NULL THEN RAISE EXCEPTION 'That is a "Can''t take photo" reason, not a photo'; END IF;
  SELECT * INTO v_audit FROM public.audit_site_audits WHERE id = v_p.audit_id;
  v_new := NULLIF(btrim(p_caption), '');
  IF v_new IS NOT DISTINCT FROM NULLIF(btrim(v_p.caption), '') THEN RAISE EXCEPTION 'Nothing was changed'; END IF;

  PERFORM set_config('audit.allow_change', 'on', true);
  UPDATE public.audit_photos SET caption = v_new WHERE id = p_photo_id;
  PERFORM set_config('audit.allow_change', 'off', true);

  v_sum := 'Photo caption' || COALESCE(' (' || v_p.slot_name || ')', '') || ': ' || COALESCE(NULLIF(btrim(v_p.caption), ''), '—') || ' → ' || COALESCE(v_new, '—');
  IF v_audit.status = 'submitted' THEN
    INSERT INTO public.audit_edits (audit_id, actor_id, actor_name, changes, summary, is_test)
    VALUES (v_p.audit_id, p_actor_id, public.kit_actor_name(p_actor_id),
            jsonb_build_array(jsonb_build_object('photo_id', p_photo_id, 'field', 'caption', 'from', v_p.caption, 'to', v_new)),
            ARRAY[v_sum], v_audit.is_test);
  END IF;
  RETURN v_sum;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.audit_photo_caption(uuid, text, uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.audit_photo_caption(uuid, text, uuid) TO authenticated;
