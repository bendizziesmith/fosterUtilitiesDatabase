-- Round 12b: "since the audit" must not count the audit's own write-back (its history rows carry its
-- audit id and are stamped a few milliseconds after submitted_at), and "Swapped for" finds the item swapped in
-- within two seconds of the swap-out (history times differ by milliseconds). Same columns; no DROP, no DELETE.
CREATE OR REPLACE VIEW public.audit_line_followup WITH (security_invoker = true) AS
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
       AND h.audit_id IS DISTINCT FROM a.id
       AND ((k.id IS NOT NULL AND h.kit_item_id = k.id) OR (p.id IS NOT NULL AND h.ppe_item_id = p.id))
     ORDER BY h.created_at DESC
     LIMIT 1
  ) ev ON true
  LEFT JOIN LATERAL (
    SELECT COALESCE(k2.plant_no, h2.new_values ->> 'plant_no') AS plant_no
      FROM public.kit_history h2
      LEFT JOIN public.kit_items k2 ON k2.id = h2.kit_item_id
     WHERE ev.action = 'swapped_out' AND h2.action = 'swapped_in'
       AND h2.created_at BETWEEN ev.created_at AND ev.created_at + interval '2 seconds'
     ORDER BY h2.created_at
     LIMIT 1
  ) sw ON true;
