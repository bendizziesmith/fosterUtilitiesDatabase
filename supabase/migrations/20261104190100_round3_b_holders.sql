/*
  # Round 3 (part B) — kit, PPE and "not carried" held by a person or a spare van
  - kit_items / audit_ppe_items / kit_van_kit_list + holder_employee_id (ON DELETE SET NULL).
  - One row per person, or per spare van (partial unique indexes replace the per-van ones).
  - Backfill of existing test rows: van -> that van's ganger, else the person assigned it.
    The 2 submitted test audits are left without a person link (no guard pause).
  - Submitted-audit guard also lets the new link columns be set to NULL by a delete.
*/

-- =============================================================== 2. holders
ALTER TABLE public.kit_items
  ADD COLUMN holder_employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL;
CREATE INDEX kit_items_holder_idx ON public.kit_items (holder_employee_id);

ALTER TABLE public.audit_ppe_items
  ADD COLUMN holder_employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  DROP CONSTRAINT audit_ppe_items_vehicle_id_checklist_item_id_key;
CREATE INDEX audit_ppe_items_holder_idx ON public.audit_ppe_items (holder_employee_id);

ALTER TABLE public.kit_van_kit_list
  ADD COLUMN holder_employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  DROP CONSTRAINT kit_van_kit_list_vehicle_id_kit_type_id_key;
CREATE INDEX kit_van_kit_list_holder_idx ON public.kit_van_kit_list (holder_employee_id);

-- the person (by van) a van-held row belongs to: the van's ganger, else whoever has the van
CREATE FUNCTION public.kit_person_on_van(p_vehicle_id uuid, p_except uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT e.id FROM public.employees e
  WHERE p_vehicle_id IS NOT NULL AND e.assigned_vehicle_id = p_vehicle_id
    AND (p_except IS NULL OR e.id <> p_except)
  ORDER BY (e.role = 'Ganger') DESC, e.full_name
  LIMIT 1;
$$;

-- backfill the existing (test) kit, PPE and not-carried rows: van -> its ganger, else the person on it.
-- The 2 submitted test audits are NOT backfilled (no trigger pause); they keep no person link.
UPDATE public.kit_items k
   SET holder_employee_id = p.person, vehicle_id = NULL
  FROM (SELECT id, public.kit_person_on_van(vehicle_id) AS person FROM public.kit_items WHERE status = 'on_van') p
 WHERE k.id = p.id AND p.person IS NOT NULL;

UPDATE public.audit_ppe_items x
   SET holder_employee_id = public.kit_person_on_van(x.vehicle_id)
 WHERE public.kit_person_on_van(x.vehicle_id) IS NOT NULL;
UPDATE public.audit_ppe_items SET vehicle_id = NULL WHERE holder_employee_id IS NOT NULL;

UPDATE public.kit_van_kit_list x
   SET holder_employee_id = public.kit_person_on_van(x.vehicle_id)
 WHERE public.kit_person_on_van(x.vehicle_id) IS NOT NULL;
UPDATE public.kit_van_kit_list SET vehicle_id = NULL WHERE holder_employee_id IS NOT NULL;


-- one row per person, or per spare van
CREATE UNIQUE INDEX audit_ppe_items_person_uidx ON public.audit_ppe_items (holder_employee_id, checklist_item_id) WHERE holder_employee_id IS NOT NULL;
CREATE UNIQUE INDEX audit_ppe_items_van_uidx ON public.audit_ppe_items (vehicle_id, checklist_item_id) WHERE holder_employee_id IS NULL AND vehicle_id IS NOT NULL;
CREATE UNIQUE INDEX kit_van_kit_list_person_uidx ON public.kit_van_kit_list (holder_employee_id, kit_type_id) WHERE holder_employee_id IS NOT NULL;
CREATE UNIQUE INDEX kit_van_kit_list_van_uidx ON public.kit_van_kit_list (vehicle_id, kit_type_id) WHERE holder_employee_id IS NULL AND vehicle_id IS NOT NULL;

-- submitted audits: the new link columns may also be set to NULL by a delete
CREATE OR REPLACE FUNCTION public.audit_guard_submitted()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_status text;
  v_is_test boolean;
  v_fk text[];
  v_col text;
BEGIN
  IF TG_TABLE_NAME = 'audit_site_audits' THEN
    v_status := OLD.status;
    v_is_test := OLD.is_test;
    v_fk := ARRAY['vehicle_id', 'ganger_id', 'audited_by', 'auditor_id', 'holder_employee_id'];
  ELSE
    SELECT a.status, a.is_test INTO v_status, v_is_test
    FROM public.audit_site_audits a WHERE a.id = OLD.audit_id;
    v_fk := CASE TG_TABLE_NAME
      WHEN 'audit_members' THEN ARRAY['employee_id']
      ELSE ARRAY['checklist_item_id', 'kit_type_id', 'kit_item_id']
    END;
  END IF;

  IF v_status IS DISTINCT FROM 'submitted' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF v_is_test THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'Submitted audits are fixed records and cannot be deleted';
  END IF;

  FOREACH v_col IN ARRAY v_fk LOOP
    IF (to_jsonb(NEW) -> v_col) IS DISTINCT FROM (to_jsonb(OLD) -> v_col)
       AND (to_jsonb(NEW) -> v_col) <> 'null'::jsonb THEN
      RAISE EXCEPTION 'Submitted audits are fixed records and cannot be edited';
    END IF;
  END LOOP;
  IF (to_jsonb(NEW) - v_fk) IS DISTINCT FROM (to_jsonb(OLD) - v_fk) THEN
    RAISE EXCEPTION 'Submitted audits are fixed records and cannot be edited';
  END IF;
  RETURN NEW;
END;
$$;
