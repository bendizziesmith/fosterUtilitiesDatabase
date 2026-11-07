/*
  # Site Audits + Kit & Plant — tables (ADD ONLY)

  Creates new audit_/kit_ tables only. Nothing existing is altered.
  Links to existing tables (vehicles, employees, user_profiles) are
  ON DELETE SET NULL, with names/regs snapshotted, so deleting a van or a
  staff member in the live app keeps working exactly as before.

  1. Tables
    - audit_checklist_items  editable list of PPE / H&S / Other items (seeded from the NSF sheet)
    - kit_types              kinds of kit (Cat & Genny, Digger, ...)
    - kit_items              every piece of kit and where it is
    - kit_van_kit_list       which kit types each van carries / does not carry
    - audit_site_audits      one audit of one gang/van
    - audit_members          team members on an audit (names snapshotted)
    - audit_lines            every line of an audit
    - audit_ppe_items        current PPE expiry per van (feeds Needs attention)
    - kit_history            log of every change to kit and PPE expiry
  2. Security
    - RLS on every new table: admins (user_profiles.role = 'admin') only
    - anon has no grants on the new tables
  3. Guard
    - submitted audits (and their lines/members) are read-only, except
      FK columns being set to NULL by ON DELETE SET NULL, and deleting is_test rows
*/

-- ---------------------------------------------------------------- helper
CREATE FUNCTION public.audit_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = (SELECT auth.uid()) AND up.role = 'admin'
  );
$$;

-- ---------------------------------------------------------------- reference data
CREATE TABLE public.audit_checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section text NOT NULL CHECK (section IN ('ppe', 'hs', 'other')),
  name text NOT NULL,
  expected_qty text,
  has_expiry boolean NOT NULL DEFAULT false,
  has_date_tag boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (section, name)
);

CREATE TABLE public.kit_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------- audits
CREATE TABLE public.audit_site_audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_date date NOT NULL DEFAULT CURRENT_DATE,
  audited_by uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  audited_by_name text NOT NULL,
  vehicle_id uuid REFERENCES public.vehicles(id) ON DELETE SET NULL,
  vehicle_reg_snapshot text,
  ganger_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  ganger_name_snapshot text,
  team_name_snapshot text NOT NULL,
  site_visited text,
  notes text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted')),
  submitted_at timestamptz,
  is_test boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_site_audits_date_idx ON public.audit_site_audits (audit_date DESC);
CREATE INDEX audit_site_audits_vehicle_idx ON public.audit_site_audits (vehicle_id);
CREATE INDEX audit_site_audits_ganger_idx ON public.audit_site_audits (ganger_id);
CREATE INDEX audit_site_audits_audited_by_idx ON public.audit_site_audits (audited_by);

CREATE TABLE public.audit_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id uuid NOT NULL REFERENCES public.audit_site_audits(id) ON DELETE CASCADE,
  employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_members_audit_idx ON public.audit_members (audit_id);
CREATE INDEX audit_members_employee_idx ON public.audit_members (employee_id);

-- ---------------------------------------------------------------- kit
CREATE TABLE public.kit_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kit_type_id uuid NOT NULL REFERENCES public.kit_types(id),
  plant_no text,
  status text NOT NULL DEFAULT 'spare'
    CHECK (status IN ('on_van', 'spare', 'away_for_service', 'removed')),
  vehicle_id uuid REFERENCES public.vehicles(id) ON DELETE SET NULL,
  vehicle_reg_snapshot text,
  service_company text,
  service_date date,
  expiry_date date,
  notes text,
  last_seen_at timestamptz,
  last_seen_source text CHECK (last_seen_source IN ('audit', 'swap', 'update', 'added', 'moved')),
  last_seen_audit_id uuid REFERENCES public.audit_site_audits(id) ON DELETE SET NULL,
  removed_at timestamptz,
  is_test boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- plant numbers are unique among kit that has not been removed (a scrapped
-- item's number can be reused; its history is kept)
CREATE UNIQUE INDEX kit_items_plant_no_active_uidx
  ON public.kit_items (lower(btrim(plant_no)))
  WHERE plant_no IS NOT NULL AND status <> 'removed';
CREATE INDEX kit_items_vehicle_idx ON public.kit_items (vehicle_id);
CREATE INDEX kit_items_type_idx ON public.kit_items (kit_type_id);
CREATE INDEX kit_items_status_idx ON public.kit_items (status);
CREATE INDEX kit_items_last_audit_idx ON public.kit_items (last_seen_audit_id);
CREATE INDEX kit_items_created_by_idx ON public.kit_items (created_by);

CREATE TABLE public.kit_van_kit_list (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid REFERENCES public.vehicles(id) ON DELETE SET NULL,
  kit_type_id uuid NOT NULL REFERENCES public.kit_types(id),
  carried boolean NOT NULL DEFAULT true,
  is_test boolean NOT NULL DEFAULT false,
  updated_by uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (vehicle_id, kit_type_id)
);
CREATE INDEX kit_van_kit_list_type_idx ON public.kit_van_kit_list (kit_type_id);
CREATE INDEX kit_van_kit_list_updated_by_idx ON public.kit_van_kit_list (updated_by);

CREATE TABLE public.audit_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id uuid NOT NULL REFERENCES public.audit_site_audits(id) ON DELETE CASCADE,
  section text NOT NULL CHECK (section IN ('ppe', 'hs', 'kit', 'other')),
  checklist_item_id uuid REFERENCES public.audit_checklist_items(id) ON DELETE SET NULL,
  kit_type_id uuid REFERENCES public.kit_types(id) ON DELETE SET NULL,
  item_name text NOT NULL,
  expected_qty text,
  result text CHECK (result IN ('Y', 'N', 'not_carried')),
  qty text,
  expiry_date date,
  service_date date,
  plant_no_snapshot text,
  date_tag text,
  comment text,
  photo_path text,
  kit_item_id uuid REFERENCES public.kit_items(id) ON DELETE SET NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_lines_audit_idx ON public.audit_lines (audit_id);
CREATE INDEX audit_lines_checklist_idx ON public.audit_lines (checklist_item_id);
CREATE INDEX audit_lines_kit_type_idx ON public.audit_lines (kit_type_id);
CREATE INDEX audit_lines_kit_item_idx ON public.audit_lines (kit_item_id);

CREATE TABLE public.audit_ppe_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid REFERENCES public.vehicles(id) ON DELETE SET NULL,
  vehicle_reg_snapshot text,
  checklist_item_id uuid NOT NULL REFERENCES public.audit_checklist_items(id),
  item_name text NOT NULL,
  expiry_date date,
  source text NOT NULL CHECK (source IN ('audit', 'update')),
  source_audit_id uuid REFERENCES public.audit_site_audits(id) ON DELETE SET NULL,
  is_test boolean NOT NULL DEFAULT false,
  updated_by uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (vehicle_id, checklist_item_id)
);
CREATE INDEX audit_ppe_items_checklist_idx ON public.audit_ppe_items (checklist_item_id);
CREATE INDEX audit_ppe_items_audit_idx ON public.audit_ppe_items (source_audit_id);
CREATE INDEX audit_ppe_items_updated_by_idx ON public.audit_ppe_items (updated_by);

CREATE TABLE public.kit_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kit_item_id uuid REFERENCES public.kit_items(id) ON DELETE CASCADE,
  ppe_item_id uuid REFERENCES public.audit_ppe_items(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN (
    'added', 'reserviced', 'replaced', 'expiry_updated', 'audit_seen',
    'swapped_out', 'swapped_in', 'assigned', 'sent_for_service',
    'back_from_service', 'moved_to_spare', 'removed'
  )),
  old_values jsonb,
  new_values jsonb,
  note text,
  certificate_path text,
  audit_id uuid REFERENCES public.audit_site_audits(id) ON DELETE SET NULL,
  by_user uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  by_name text,
  is_test boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (kit_item_id IS NOT NULL OR ppe_item_id IS NOT NULL)
);
CREATE INDEX kit_history_item_idx ON public.kit_history (kit_item_id, created_at DESC);
CREATE INDEX kit_history_ppe_idx ON public.kit_history (ppe_item_id);
CREATE INDEX kit_history_audit_idx ON public.kit_history (audit_id);
CREATE INDEX kit_history_by_idx ON public.kit_history (by_user);
CREATE INDEX kit_history_created_idx ON public.kit_history (created_at DESC);

-- ---------------------------------------------------------------- submitted audits are fixed records
CREATE FUNCTION public.audit_guard_submitted()
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
    v_fk := ARRAY['vehicle_id', 'ganger_id', 'audited_by'];
  ELSE
    SELECT a.status, a.is_test INTO v_status, v_is_test
    FROM public.audit_site_audits a WHERE a.id = OLD.audit_id;
    v_fk := CASE TG_TABLE_NAME
      WHEN 'audit_members' THEN ARRAY['employee_id']
      ELSE ARRAY['checklist_item_id', 'kit_type_id', 'kit_item_id']
    END;
  END IF;

  -- parent already gone (cascade) or still a draft: allow
  IF v_status IS DISTINCT FROM 'submitted' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF v_is_test THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'Submitted audits are fixed records and cannot be deleted';
  END IF;

  -- UPDATE: only linked-row ids may change, and only to NULL
  -- (this is what ON DELETE SET NULL does when a van/staff member is deleted)
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

CREATE TRIGGER audit_site_audits_guard
  BEFORE UPDATE OR DELETE ON public.audit_site_audits
  FOR EACH ROW EXECUTE FUNCTION public.audit_guard_submitted();
CREATE TRIGGER audit_members_guard
  BEFORE UPDATE OR DELETE ON public.audit_members
  FOR EACH ROW EXECUTE FUNCTION public.audit_guard_submitted();
CREATE TRIGGER audit_lines_guard
  BEFORE UPDATE OR DELETE ON public.audit_lines
  FOR EACH ROW EXECUTE FUNCTION public.audit_guard_submitted();

-- members/lines can only be added to draft audits
CREATE FUNCTION public.audit_guard_insert_child()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.audit_site_audits a
             WHERE a.id = NEW.audit_id AND a.status = 'submitted') THEN
    RAISE EXCEPTION 'Submitted audits are fixed records and cannot be edited';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER audit_members_guard_insert
  BEFORE INSERT ON public.audit_members
  FOR EACH ROW EXECUTE FUNCTION public.audit_guard_insert_child();
CREATE TRIGGER audit_lines_guard_insert
  BEFORE INSERT ON public.audit_lines
  FOR EACH ROW EXECUTE FUNCTION public.audit_guard_insert_child();

-- updated_at for the new tables (own function; the existing one is not touched)
CREATE FUNCTION public.audit_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER audit_site_audits_touch
  BEFORE UPDATE ON public.audit_site_audits
  FOR EACH ROW EXECUTE FUNCTION public.audit_touch_updated_at();
CREATE TRIGGER kit_items_touch
  BEFORE UPDATE ON public.kit_items
  FOR EACH ROW EXECUTE FUNCTION public.audit_touch_updated_at();

-- ---------------------------------------------------------------- RLS: admins only
ALTER TABLE public.audit_checklist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kit_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_site_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kit_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kit_van_kit_list ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_ppe_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kit_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage audit checklist items" ON public.audit_checklist_items
  FOR ALL TO authenticated USING ((SELECT public.audit_is_admin())) WITH CHECK ((SELECT public.audit_is_admin()));
CREATE POLICY "Admins manage kit types" ON public.kit_types
  FOR ALL TO authenticated USING ((SELECT public.audit_is_admin())) WITH CHECK ((SELECT public.audit_is_admin()));
CREATE POLICY "Admins manage site audits" ON public.audit_site_audits
  FOR ALL TO authenticated USING ((SELECT public.audit_is_admin())) WITH CHECK ((SELECT public.audit_is_admin()));
CREATE POLICY "Admins manage audit members" ON public.audit_members
  FOR ALL TO authenticated USING ((SELECT public.audit_is_admin())) WITH CHECK ((SELECT public.audit_is_admin()));
CREATE POLICY "Admins manage kit items" ON public.kit_items
  FOR ALL TO authenticated USING ((SELECT public.audit_is_admin())) WITH CHECK ((SELECT public.audit_is_admin()));
CREATE POLICY "Admins manage van kit lists" ON public.kit_van_kit_list
  FOR ALL TO authenticated USING ((SELECT public.audit_is_admin())) WITH CHECK ((SELECT public.audit_is_admin()));
CREATE POLICY "Admins manage audit lines" ON public.audit_lines
  FOR ALL TO authenticated USING ((SELECT public.audit_is_admin())) WITH CHECK ((SELECT public.audit_is_admin()));
CREATE POLICY "Admins manage PPE expiry" ON public.audit_ppe_items
  FOR ALL TO authenticated USING ((SELECT public.audit_is_admin())) WITH CHECK ((SELECT public.audit_is_admin()));
CREATE POLICY "Admins manage kit history" ON public.kit_history
  FOR ALL TO authenticated USING ((SELECT public.audit_is_admin())) WITH CHECK ((SELECT public.audit_is_admin()));

REVOKE ALL ON public.audit_checklist_items, public.kit_types, public.audit_site_audits,
  public.audit_members, public.kit_items, public.kit_van_kit_list, public.audit_lines,
  public.audit_ppe_items, public.kit_history FROM anon;
REVOKE EXECUTE ON FUNCTION public.audit_is_admin() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.audit_is_admin() TO authenticated;

-- ---------------------------------------------------------------- seed (from the paper NSF Audit Sheet)
INSERT INTO public.audit_checklist_items (section, name, expected_qty, has_expiry, has_date_tag, sort_order) VALUES
  ('ppe', 'Hi vis', 'Per person', true, false, 10),
  ('ppe', 'Overalls', 'Per person', true, false, 20),
  ('ppe', 'Hard hats', 'Per person', true, false, 30),
  ('ppe', 'Leather gloves', 'Per person', true, false, 40),
  ('ppe', 'Safety boots', 'Per person', true, false, 50),
  ('ppe', 'Safety gloves', 'Per person', true, false, 60),
  ('ppe', 'Ear defenders', 'Per person', true, false, 70),
  ('ppe', 'Goggles', 'Per person', true, false, 80),
  ('ppe', 'Face masks', 'Per person', true, false, 90),
  ('hs', 'First aid kit', '1 per van', false, false, 10),
  ('hs', 'Eye wash', '2 × 500ml', false, false, 20),
  ('hs', 'Spill kit', '1 per van', false, false, 30),
  ('hs', 'Fire ext 2KG dry powder', '1 per van', false, false, 40),
  ('hs', 'Burns kit', '2 × patches', false, false, 50),
  ('hs', 'Hand wipes', '1 per van', false, false, 60),
  ('hs', 'Travel loo', '2 per van', false, false, 70),
  ('hs', 'Mark up sprays', 'Red, yellow, blue, white, green', false, false, 80),
  ('other', 'Water containers', 'x1 · "not drinking water" label', false, true, 10),
  ('other', 'Gerry cans', 'x2', false, true, 20),
  ('other', 'Fuel cans', 'x2', false, true, 30),
  ('other', 'NSF folder', 'x1', false, true, 40),
  ('other', 'Powercare checklist', 'Correct dates Y/N', false, true, 50);

INSERT INTO public.kit_types (name, sort_order) VALUES
  ('Cat & Genny', 10),
  ('Digger', 20),
  ('Trailer', 30),
  ('STIHL saw', 40),
  ('Floor saw', 50),
  ('Breaker', 60),
  ('Pecker', 70);
