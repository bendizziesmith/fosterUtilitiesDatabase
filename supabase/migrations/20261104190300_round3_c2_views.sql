/*
  # Round 3 (part C2) — this build's views recreated with holder + name columns
  Drops and recreates ONLY views made in this build.
*/

DROP VIEW public.audit_needs_attention;
DROP VIEW public.kit_items_overview;
DROP VIEW public.kit_recent_updates;
DROP VIEW public.audit_site_audit_summary;

CREATE VIEW public.kit_items_overview
WITH (security_invoker = true) AS
SELECT
  k.id, k.kit_type_id, t.name AS type_name, t.sort_order AS type_sort,
  k.plant_no, k.status,
  /* the van the kit is on now: the holder's assigned van (kit follows the person) or the spare van */
  CASE WHEN k.status = 'on_van' THEN COALESCE(e.assigned_vehicle_id, k.vehicle_id) END AS vehicle_id,
  CASE WHEN k.status = 'on_van' THEN v.registration_number END AS vehicle_reg,
  e.full_name AS ganger_name,
  k.service_company, k.service_date, k.expiry_date,
  k.expiry_date - public.audit_today() AS days_left,
  public.audit_expiry_status(k.expiry_date) AS expiry_status,
  k.notes, k.last_seen_at, k.last_seen_source, k.last_seen_audit_id,
  k.removed_at, k.is_test, k.created_at, k.updated_at,
  k.holder_employee_id,
  e.full_name AS holder_name,
  e.role AS holder_role,
  CASE
    WHEN k.status <> 'on_van' THEN 'none'
    WHEN k.holder_employee_id IS NOT NULL THEN 'person'
    WHEN k.vehicle_id IS NOT NULL THEN 'spare_van'
    ELSE 'none'
  END AS holder_kind,
  CASE WHEN k.status = 'on_van' THEN v.registration_number END AS holder_reg,
  CASE WHEN k.holder_employee_id IS NULL THEN k.vehicle_id END AS spare_vehicle_id
FROM public.kit_items k
JOIN public.kit_types t ON t.id = k.kit_type_id
LEFT JOIN public.employees e ON e.id = k.holder_employee_id
LEFT JOIN public.vehicles v ON v.id = COALESCE(e.assigned_vehicle_id, k.vehicle_id);

CREATE VIEW public.audit_needs_attention
WITH (security_invoker = true) AS
SELECT
  'kit'::text AS source, k.id AS item_id, k.type_name AS item_name, k.plant_no,
  k.status AS kit_status, k.vehicle_id, k.vehicle_reg, k.holder_name AS ganger_name,
  k.expiry_date,
  CASE WHEN k.status = 'on_van' AND k.holder_kind = 'none' THEN NULL ELSE k.days_left END AS days_left,
  CASE WHEN k.status = 'on_van' AND k.holder_kind = 'none' THEN 'no_home' ELSE k.expiry_status END AS expiry_status,
  k.is_test, k.holder_employee_id, k.holder_name, k.holder_kind
FROM public.kit_items_overview k
WHERE (k.status = 'on_van' AND k.holder_kind = 'none')
   OR (k.status IN ('on_van', 'spare') AND k.expiry_status IN ('expired', 'due_soon'))
UNION ALL
SELECT
  'ppe'::text, p.id, p.item_name, NULL::text,
  NULL::text, COALESCE(e.assigned_vehicle_id, p.vehicle_id),
  COALESCE(v.registration_number, p.vehicle_reg_snapshot), e.full_name,
  p.expiry_date, p.expiry_date - public.audit_today(),
  public.audit_expiry_status(p.expiry_date), p.is_test, p.holder_employee_id, e.full_name,
  CASE WHEN p.holder_employee_id IS NOT NULL THEN 'person' WHEN p.vehicle_id IS NOT NULL THEN 'spare_van' ELSE 'none' END
FROM public.audit_ppe_items p
LEFT JOIN public.employees e ON e.id = p.holder_employee_id
LEFT JOIN public.vehicles v ON v.id = COALESCE(e.assigned_vehicle_id, p.vehicle_id)
WHERE public.audit_expiry_status(p.expiry_date) IN ('expired', 'due_soon');

CREATE VIEW public.audit_site_audit_summary
WITH (security_invoker = true) AS
SELECT
  a.id, a.audit_date, a.audited_by, a.audited_by_name, a.vehicle_id,
  COALESCE(a.vehicle_reg_snapshot, v.registration_number) AS vehicle_reg,
  a.ganger_id, a.ganger_name_snapshot, a.team_name_snapshot, a.site_visited,
  a.status, a.submitted_at, a.is_test, a.created_at, a.updated_at,
  COALESCE(c.fails, 0) AS fail_count,
  COALESCE(c.expired, 0) AS expired_count,
  COALESCE(c.due_soon, 0) AS due_soon_count,
  COALESCE(c.not_carried, 0) AS not_carried_count,
  m.member_names,
  a.auditor_id, a.auditor_name, a.holder_employee_id
FROM public.audit_site_audits a
LEFT JOIN public.vehicles v ON v.id = a.vehicle_id
LEFT JOIN LATERAL (
  SELECT
    count(*) FILTER (WHERE l.result = 'N') AS fails,
    count(*) FILTER (WHERE l.section IN ('ppe', 'kit') AND l.result IS DISTINCT FROM 'not_carried'
                     AND public.audit_expiry_status(l.expiry_date, a.audit_date) = 'expired') AS expired,
    count(*) FILTER (WHERE l.section IN ('ppe', 'kit') AND l.result IS DISTINCT FROM 'not_carried'
                     AND public.audit_expiry_status(l.expiry_date, a.audit_date) = 'due_soon') AS due_soon,
    count(*) FILTER (WHERE l.result = 'not_carried') AS not_carried
  FROM public.audit_lines l WHERE l.audit_id = a.id
) c ON true
LEFT JOIN LATERAL (
  SELECT string_agg(mm.name, ', ' ORDER BY mm.sort_order) AS member_names
  FROM public.audit_members mm WHERE mm.audit_id = a.id
) m ON true;

CREATE VIEW public.kit_recent_updates
WITH (security_invoker = true) AS
SELECT
  h.id, h.action, h.created_at, h.by_name, h.note, h.audit_id, h.is_test,
  h.kit_item_id, h.ppe_item_id,
  CASE WHEN h.kit_item_id IS NOT NULL THEN 'kit' ELSE 'ppe' END AS source,
  COALESCE(t.name, p.item_name) AS item_name,
  COALESCE(k.plant_no, h.new_values ->> 'plant_no') AS plant_no,
  COALESCE(kv.registration_number, k.vehicle_reg_snapshot, pv.registration_number, p.vehicle_reg_snapshot) AS vehicle_reg,
  h.old_values, h.new_values,
  h.certificate_path,
  ARRAY(
    SELECT DISTINCT x FROM unnest(ARRAY[
      ke.assigned_vehicle_id, k.vehicle_id, pe.assigned_vehicle_id, p.vehicle_id,
      NULLIF(h.old_values ->> 'vehicle_id', '')::uuid,
      NULLIF(h.new_values ->> 'vehicle_id', '')::uuid
    ]) AS x WHERE x IS NOT NULL
  ) AS related_vehicle_ids,
  h.actor_name,
  ARRAY(
    SELECT DISTINCT x FROM unnest(ARRAY[
      k.holder_employee_id, p.holder_employee_id,
      NULLIF(h.old_values ->> 'holder_employee_id', '')::uuid,
      NULLIF(h.new_values ->> 'holder_employee_id', '')::uuid
    ]) AS x WHERE x IS NOT NULL
  ) AS related_holder_ids
FROM public.kit_history h
LEFT JOIN public.kit_items k ON k.id = h.kit_item_id
LEFT JOIN public.kit_types t ON t.id = k.kit_type_id
LEFT JOIN public.employees ke ON ke.id = k.holder_employee_id
LEFT JOIN public.vehicles kv ON kv.id = COALESCE(ke.assigned_vehicle_id, k.vehicle_id)
LEFT JOIN public.audit_ppe_items p ON p.id = h.ppe_item_id
LEFT JOIN public.employees pe ON pe.id = p.holder_employee_id
LEFT JOIN public.vehicles pv ON pv.id = COALESCE(pe.assigned_vehicle_id, p.vehicle_id)
WHERE h.action <> 'audit_seen';

-- =============================================================== grants

REVOKE ALL ON public.kit_items_overview, public.audit_needs_attention,
  public.audit_site_audit_summary, public.kit_recent_updates FROM anon;
