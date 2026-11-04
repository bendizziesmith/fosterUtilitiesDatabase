/*
  # Kit — Change van (NEW objects only)

  - kit_person_vans: the last van we know each person had, so a van changed
    the old way (Employee / Vehicle Management) shows "Van changed: check kit".
    Link to employees is ON DELETE SET NULL, like every other link.
  - kit_change_van(): every kit move of one van change, all or nothing, each
    logged in kit_history (who + when) through kit_move_item.
    In test mode only test kit can be moved.

  This migration does NOT touch employees. The app writes
  employees.assigned_vehicle_id itself, and only in a live (non-test) build.
*/

CREATE TABLE public.kit_person_vans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid UNIQUE REFERENCES public.employees(id) ON DELETE SET NULL,
  vehicle_id uuid REFERENCES public.vehicles(id) ON DELETE SET NULL,
  is_test boolean NOT NULL DEFAULT false,
  updated_by uuid DEFAULT auth.uid() REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX kit_person_vans_vehicle_idx ON public.kit_person_vans (vehicle_id);
CREATE INDEX kit_person_vans_updated_by_idx ON public.kit_person_vans (updated_by);

ALTER TABLE public.kit_person_vans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage person vans" ON public.kit_person_vans
  FOR ALL TO authenticated USING ((SELECT public.audit_is_admin())) WITH CHECK ((SELECT public.audit_is_admin()));
REVOKE ALL ON public.kit_person_vans FROM anon;

CREATE FUNCTION public.kit_change_van(
  p_old_vehicle_id uuid, p_new_vehicle_id uuid, p_moves jsonb, p_note text, p_is_test boolean)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_move jsonb;
  v_item public.kit_items%ROWTYPE;
  v_to text;
  v_note text := COALESCE(NULLIF(btrim(p_note), ''), 'Van change');
BEGIN
  PERFORM public.kit_require_admin();
  IF p_new_vehicle_id IS NULL THEN RAISE EXCEPTION 'Pick the new van'; END IF;
  IF p_new_vehicle_id = p_old_vehicle_id THEN RAISE EXCEPTION 'The new van is the same as the old van'; END IF;

  FOR v_move IN SELECT * FROM jsonb_array_elements(COALESCE(p_moves, '[]'::jsonb)) LOOP
    v_to := v_move ->> 'to';
    SELECT * INTO v_item FROM public.kit_items WHERE id = (v_move ->> 'item_id')::uuid FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Kit item not found'; END IF;
    IF COALESCE(p_is_test, false) AND NOT v_item.is_test THEN
      RAISE EXCEPTION 'Test mode can only move test kit (% is real kit)', COALESCE(v_item.plant_no, 'an item');
    END IF;
    -- the item must still be where the summary said it was
    IF v_item.status <> 'on_van'
       OR (v_to = 'new_van' AND v_item.vehicle_id IS DISTINCT FROM p_old_vehicle_id)
       OR (v_to = 'old_van' AND v_item.vehicle_id IS DISTINCT FROM p_new_vehicle_id)
       OR (v_to = 'spare' AND v_item.vehicle_id IS DISTINCT FROM p_old_vehicle_id
                          AND v_item.vehicle_id IS DISTINCT FROM p_new_vehicle_id) THEN
      RAISE EXCEPTION '% is no longer where it was; reload and try again', COALESCE(v_item.plant_no, 'An item');
    END IF;

    IF v_to = 'new_van' THEN
      PERFORM public.kit_move_item(v_item.id, 'on_van', p_new_vehicle_id, NULL, v_note, 'assigned');
    ELSIF v_to = 'old_van' THEN
      IF p_old_vehicle_id IS NULL THEN RAISE EXCEPTION 'There is no old van to move kit to'; END IF;
      PERFORM public.kit_move_item(v_item.id, 'on_van', p_old_vehicle_id, NULL, v_note, 'assigned');
    ELSIF v_to = 'spare' THEN
      PERFORM public.kit_move_item(v_item.id, 'spare', NULL, NULL, v_note, 'moved_to_spare');
    ELSE
      RAISE EXCEPTION 'Unknown move %', v_to;
    END IF;
  END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.kit_change_van(uuid, uuid, jsonb, text, boolean) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.kit_change_van(uuid, uuid, jsonb, text, boolean) TO authenticated;
