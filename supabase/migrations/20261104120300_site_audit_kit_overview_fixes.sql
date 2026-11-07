/*
  # Site Audits + Kit — small fixes to the NEW objects only

  - kit_items_overview: a spare / away-for-service / removed item has no van,
    so vehicle_reg is shown only while the item is on a van (the last van is
    still kept in kit_items.vehicle_reg_snapshot and in the history).
  - kit_history: created_at uses clock_timestamp() so two log lines written
    in one action (e.g. swap out, then swap in) keep their real order.
*/

CREATE OR REPLACE VIEW public.kit_items_overview
WITH (security_invoker = true) AS
SELECT
  k.id, k.kit_type_id, t.name AS type_name, t.sort_order AS type_sort,
  k.plant_no, k.status, k.vehicle_id,
  CASE WHEN k.status = 'on_van'
       THEN COALESCE(v.registration_number, k.vehicle_reg_snapshot) END AS vehicle_reg,
  g.full_name AS ganger_name,
  k.service_company, k.service_date, k.expiry_date,
  k.expiry_date - public.audit_today() AS days_left,
  public.audit_expiry_status(k.expiry_date) AS expiry_status,
  k.notes, k.last_seen_at, k.last_seen_source, k.last_seen_audit_id,
  k.removed_at, k.is_test, k.created_at, k.updated_at
FROM public.kit_items k
JOIN public.kit_types t ON t.id = k.kit_type_id
LEFT JOIN public.vehicles v ON v.id = k.vehicle_id
LEFT JOIN LATERAL (
  SELECT e.full_name FROM public.employees e
  WHERE e.role = 'Ganger' AND e.assigned_vehicle_id = k.vehicle_id
  ORDER BY e.full_name LIMIT 1
) g ON k.vehicle_id IS NOT NULL;

ALTER TABLE public.kit_history ALTER COLUMN created_at SET DEFAULT clock_timestamp();
