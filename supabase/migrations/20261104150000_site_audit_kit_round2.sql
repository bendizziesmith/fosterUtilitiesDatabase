/*
  # Site Audits + Kit — round 2 (changes NEW audit_/kit_ objects only)

  1. Service intervals (auto expiry = service date + interval)
     - kit_types.service_interval_months: 12 for the seven seeded types
     - audit_checklist_items.service_interval_months + date_label:
       Hard hats = 36 months from the "Date on hat"; other PPE has none
  2. Deleting photos / certificates
     - audit_file_deletions: one row per deleted file ("Photo deleted by X on
       date"). A submitted audit line is never edited; the screen reads this.
     - storage: admins may delete files in the audit-photos bucket only
  3. kit_recent_updates: adds certificate_path and related_vehicle_ids
     (columns added at the end), for per-van history and certificate links
*/

-- 1. service intervals --------------------------------------------------------
ALTER TABLE public.kit_types
  ADD COLUMN service_interval_months integer
    CHECK (service_interval_months IS NULL OR service_interval_months BETWEEN 1 AND 240);

ALTER TABLE public.audit_checklist_items
  ADD COLUMN service_interval_months integer
    CHECK (service_interval_months IS NULL OR service_interval_months BETWEEN 1 AND 240),
  ADD COLUMN date_label text;

UPDATE public.kit_types SET service_interval_months = 12
 WHERE name IN ('Cat & Genny', 'Digger', 'Trailer', 'STIHL saw', 'Floor saw', 'Breaker', 'Pecker');

UPDATE public.audit_checklist_items
   SET service_interval_months = 36, date_label = 'Date on hat'
 WHERE section = 'ppe' AND name = 'Hard hats';

-- 2. deleted files ------------------------------------------------------------
CREATE TABLE public.audit_file_deletions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  path text NOT NULL UNIQUE,
  deleted_by uuid DEFAULT auth.uid() REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  deleted_by_name text NOT NULL DEFAULT public.audit_actor_name(),
  deleted_at timestamptz NOT NULL DEFAULT now(),
  is_test boolean NOT NULL DEFAULT false
);
CREATE INDEX audit_file_deletions_by_idx ON public.audit_file_deletions (deleted_by);

ALTER TABLE public.audit_file_deletions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage file deletions" ON public.audit_file_deletions
  FOR ALL TO authenticated USING ((SELECT public.audit_is_admin())) WITH CHECK ((SELECT public.audit_is_admin()));
REVOKE ALL ON public.audit_file_deletions FROM anon;

CREATE POLICY "audit-photos admins delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'audit-photos' AND (SELECT public.audit_is_admin()));

-- 3. history view: certificate + which vans an entry relates to ----------------
CREATE OR REPLACE VIEW public.kit_recent_updates
WITH (security_invoker = true) AS
SELECT
  h.id, h.action, h.created_at, h.by_name, h.note, h.audit_id, h.is_test,
  h.kit_item_id, h.ppe_item_id,
  CASE WHEN h.kit_item_id IS NOT NULL THEN 'kit' ELSE 'ppe' END AS source,
  COALESCE(t.name, p.item_name) AS item_name,
  COALESCE(k.plant_no, h.new_values ->> 'plant_no') AS plant_no,
  COALESCE(v.registration_number, k.vehicle_reg_snapshot, pv.registration_number, p.vehicle_reg_snapshot) AS vehicle_reg,
  h.old_values, h.new_values,
  h.certificate_path,
  ARRAY(
    SELECT DISTINCT x FROM unnest(ARRAY[
      k.vehicle_id, p.vehicle_id,
      NULLIF(h.old_values ->> 'vehicle_id', '')::uuid,
      NULLIF(h.new_values ->> 'vehicle_id', '')::uuid
    ]) AS x WHERE x IS NOT NULL
  ) AS related_vehicle_ids
FROM public.kit_history h
LEFT JOIN public.kit_items k ON k.id = h.kit_item_id
LEFT JOIN public.kit_types t ON t.id = k.kit_type_id
LEFT JOIN public.vehicles v ON v.id = k.vehicle_id
LEFT JOIN public.audit_ppe_items p ON p.id = h.ppe_item_id
LEFT JOIN public.vehicles pv ON pv.id = p.vehicle_id
WHERE h.action <> 'audit_seen';
