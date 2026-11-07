/*
  # Kit — record every person's van in one go (NEW objects only)

  kit_record_person_vans(is_test): adds a kit_person_vans row for every
  employee not recorded yet, with the van they have now. Existing rows are
  left alone, so a van changed in Employee / Vehicle Management is still
  spotted ("Van changed: check kit"), even for someone whose page was never
  opened. Reads employees; writes only kit_person_vans. Returns rows added.
*/

CREATE FUNCTION public.kit_record_person_vans(p_is_test boolean)
RETURNS integer
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_added integer;
BEGIN
  PERFORM public.kit_require_admin();
  INSERT INTO public.kit_person_vans (employee_id, vehicle_id, is_test)
  SELECT e.id, e.assigned_vehicle_id, COALESCE(p_is_test, false)
  FROM public.employees e
  ON CONFLICT (employee_id) DO NOTHING;
  GET DIAGNOSTICS v_added = ROW_COUNT;
  RETURN v_added;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.kit_record_person_vans(boolean) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.kit_record_person_vans(boolean) TO authenticated;
