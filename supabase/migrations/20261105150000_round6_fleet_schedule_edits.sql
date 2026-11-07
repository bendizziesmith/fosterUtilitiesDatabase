/*
  # Round 6 (this build's objects only, no DROP)

  1. Kit stays with the van when a person goes
     - kit_person_vans.employee_ref: a lasting copy of the person's id (the FK
       column is SET NULL when staff are deleted), kept by a trigger.
     - Triggers on kit_items / audit_ppe_items / kit_van_kit_list: when a holder
       is deleted from staff (ON DELETE SET NULL), their rows become spare-van
       rows of the last van recorded for them. Guarded so they can never block a
       staff delete; if the last van is unknown the kit stays "needs a home".
     - kit_take_out_of_van(): "Take out of van" — all a person's kit, PPE dates and
       not-carried list stay with the van as spare-van kit. Logged.
     - kit_reconcile_unassigned(): same outcome for a van unassigned in Employee
       Management (run when the audit / kit pages load). Logged as "Automatic".
  2. Van off the road: kit_van_status + kit_van_off_road() / kit_van_back_on_road().
     vehicles is never written.
  3. Audit schedule setting: audit_settings (audit every N months, default 6).
  4. Edit / delete submitted audits: audit_edit(), audit_delete(), with logs
     audit_edits / audit_deletions. The submitted-audit lock (CREATE OR REPLACE)
     lets changes through only from inside these two actions.
     audit_submit's write-back moves into audit_write_back() so edits reuse it.
  5. kit_delete_item(): delete a plant item completely (history too); audit
     lines keep only their own text.
  employees / vehicles / user_profiles are only read.
*/

-- =============================================================== 1. person → van
ALTER TABLE public.kit_person_vans ADD COLUMN employee_ref uuid;
UPDATE public.kit_person_vans SET employee_ref = employee_id WHERE employee_ref IS NULL;
CREATE INDEX kit_person_vans_ref_idx ON public.kit_person_vans (employee_ref);

CREATE FUNCTION public.kit_person_vans_keep_ref()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.employee_ref := COALESCE(NEW.employee_id, NEW.employee_ref, CASE WHEN TG_OP = 'UPDATE' THEN OLD.employee_ref END);
  RETURN NEW;
END;
$$;
CREATE TRIGGER kit_person_vans_ref
  BEFORE INSERT OR UPDATE ON public.kit_person_vans
  FOR EACH ROW EXECUTE FUNCTION public.kit_person_vans_keep_ref();

/* The last van recorded for a person (works after they are deleted from staff). */
CREATE FUNCTION public.kit_last_van(p_person uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT vehicle_id FROM public.kit_person_vans
  WHERE employee_ref = p_person AND vehicle_id IS NOT NULL
  ORDER BY updated_at DESC LIMIT 1;
$$;

/* kit_items: holder deleted from staff → spare-van kit of their last van. Never raises. */
CREATE FUNCTION public.kit_items_holder_lost()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF OLD.holder_employee_id IS NOT NULL AND NEW.holder_employee_id IS NULL
     AND NEW.status = 'on_van' AND NEW.vehicle_id IS NULL THEN
    BEGIN
      NEW.vehicle_id := public.kit_last_van(OLD.holder_employee_id);
    EXCEPTION WHEN others THEN
      NEW.vehicle_id := NULL;
    END;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER kit_items_holder_lost
  BEFORE UPDATE OF holder_employee_id ON public.kit_items
  FOR EACH ROW EXECUTE FUNCTION public.kit_items_holder_lost();

/* PPE dates / not-carried rows: same, unless that van already has its own row for the item. */
CREATE FUNCTION public.kit_rows_holder_lost()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_van uuid;
  v_taken boolean := false;
BEGIN
  IF OLD.holder_employee_id IS NOT NULL AND NEW.holder_employee_id IS NULL AND NEW.vehicle_id IS NULL THEN
    BEGIN
      v_van := public.kit_last_van(OLD.holder_employee_id);
      IF v_van IS NOT NULL THEN
        IF TG_TABLE_NAME = 'audit_ppe_items' THEN
          SELECT EXISTS (SELECT 1 FROM public.audit_ppe_items x WHERE x.holder_employee_id IS NULL AND x.vehicle_id = v_van
                          AND x.checklist_item_id = (to_jsonb(NEW) ->> 'checklist_item_id')::uuid AND x.id <> NEW.id) INTO v_taken;
        ELSE
          SELECT EXISTS (SELECT 1 FROM public.kit_van_kit_list x WHERE x.holder_employee_id IS NULL AND x.vehicle_id = v_van
                          AND x.kit_type_id = (to_jsonb(NEW) ->> 'kit_type_id')::uuid AND x.id <> NEW.id) INTO v_taken;
        END IF;
        IF NOT v_taken THEN NEW.vehicle_id := v_van; END IF;
      END IF;
    EXCEPTION WHEN others THEN
      NEW.vehicle_id := NULL;
    END;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER audit_ppe_items_holder_lost
  BEFORE UPDATE OF holder_employee_id ON public.audit_ppe_items
  FOR EACH ROW EXECUTE FUNCTION public.kit_rows_holder_lost();
CREATE TRIGGER kit_van_kit_list_holder_lost
  BEFORE UPDATE OF holder_employee_id ON public.kit_van_kit_list
  FOR EACH ROW EXECUTE FUNCTION public.kit_rows_holder_lost();

/*
  Hand everything a person holds to a van as spare-van kit: kit items, PPE dates,
  not-carried list. p_only_test: only move test rows. Returns rows moved.
*/
CREATE FUNCTION public.kit_hand_to_van(
  p_person uuid, p_van uuid, p_note text, p_actor_id uuid, p_actor_name text, p_only_test boolean)
RETURNS integer
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  r record;
  v_n integer := 0;
  v_reg text;
  v_old jsonb;
BEGIN
  SELECT registration_number INTO v_reg FROM public.vehicles WHERE id = p_van;

  FOR r IN SELECT id, is_test FROM public.kit_items
           WHERE holder_employee_id = p_person AND status = 'on_van' AND (NOT p_only_test OR is_test) FOR UPDATE
  LOOP
    v_old := public.kit_snapshot(r.id);
    UPDATE public.kit_items
       SET holder_employee_id = NULL, vehicle_id = p_van, vehicle_reg_snapshot = COALESCE(v_reg, vehicle_reg_snapshot),
           last_seen_at = now(), last_seen_source = 'moved'
     WHERE id = r.id;
    INSERT INTO public.kit_history (kit_item_id, action, old_values, new_values, note, by_user, by_name, is_test, actor_id, actor_name)
    VALUES (r.id, 'assigned', v_old, public.kit_snapshot(r.id), p_note, (SELECT auth.uid()), public.audit_actor_name(),
            r.is_test, p_actor_id, COALESCE(public.kit_actor_name(p_actor_id), p_actor_name));
    v_n := v_n + 1;
  END LOOP;

  FOR r IN SELECT id, checklist_item_id, is_test FROM public.audit_ppe_items
           WHERE holder_employee_id = p_person AND (NOT p_only_test OR is_test) FOR UPDATE
  LOOP
    -- the person's dates are the current ones; an older spare-van row for the same item gives way
    DELETE FROM public.audit_ppe_items WHERE holder_employee_id IS NULL AND vehicle_id = p_van AND checklist_item_id = r.checklist_item_id;
    UPDATE public.audit_ppe_items SET holder_employee_id = NULL, vehicle_id = p_van, vehicle_reg_snapshot = v_reg, updated_at = now() WHERE id = r.id;
    INSERT INTO public.kit_history (ppe_item_id, action, note, by_user, by_name, is_test, actor_id, actor_name)
    VALUES (r.id, 'assigned', p_note, (SELECT auth.uid()), public.audit_actor_name(), r.is_test, p_actor_id,
            COALESCE(public.kit_actor_name(p_actor_id), p_actor_name));
    v_n := v_n + 1;
  END LOOP;

  FOR r IN SELECT id, kit_type_id FROM public.kit_van_kit_list
           WHERE holder_employee_id = p_person AND (NOT p_only_test OR is_test) FOR UPDATE
  LOOP
    DELETE FROM public.kit_van_kit_list WHERE holder_employee_id IS NULL AND vehicle_id = p_van AND kit_type_id = r.kit_type_id;
    UPDATE public.kit_van_kit_list SET holder_employee_id = NULL, vehicle_id = p_van, updated_at = now() WHERE id = r.id;
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END;
$$;

/* "Take out of van": the van becomes a spare van and keeps all the person's kit. employees is not written here. */
CREATE FUNCTION public.kit_take_out_of_van(
  p_person_id uuid, p_vehicle_id uuid, p_note text, p_is_test boolean, p_actor_id uuid)
RETURNS integer
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_reg text;
BEGIN
  PERFORM public.kit_require_admin();
  IF p_actor_id IS NULL THEN RAISE EXCEPTION 'Pick who’s doing this'; END IF;
  IF p_person_id IS NULL OR p_vehicle_id IS NULL THEN RAISE EXCEPTION 'This person has no van to take them out of'; END IF;
  IF COALESCE(p_is_test, false) AND (
       EXISTS (SELECT 1 FROM public.kit_items WHERE holder_employee_id = p_person_id AND status = 'on_van' AND NOT is_test)
    OR EXISTS (SELECT 1 FROM public.audit_ppe_items WHERE holder_employee_id = p_person_id AND NOT is_test)
    OR EXISTS (SELECT 1 FROM public.kit_van_kit_list WHERE holder_employee_id = p_person_id AND NOT is_test)) THEN
    RAISE EXCEPTION 'Test mode can only move test kit, and this person holds real kit';
  END IF;
  SELECT registration_number INTO v_reg FROM public.vehicles WHERE id = p_vehicle_id;
  RETURN public.kit_hand_to_van(p_person_id, p_vehicle_id,
    COALESCE(NULLIF(btrim(p_note), ''), 'Taken out of van: kit stays with ' || COALESCE(v_reg, 'the van') || ' as spare-van kit'),
    p_actor_id, NULL, false);
END;
$$;

/*
  A van unassigned in Employee Management: the kit stays with the van recorded
  for that person (spare-van kit). Runs when the audit / kit pages load.
*/
CREATE FUNCTION public.kit_reconcile_unassigned(p_is_test boolean)
RETURNS integer
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  r record;
  v_n integer := 0;
BEGIN
  PERFORM public.kit_require_admin();
  FOR r IN
    SELECT p.id AS rec_id, p.employee_id, p.vehicle_id, v.registration_number AS reg
    FROM public.kit_person_vans p
    JOIN public.employees e ON e.id = p.employee_id
    LEFT JOIN public.vehicles v ON v.id = p.vehicle_id
    WHERE p.vehicle_id IS NOT NULL AND e.assigned_vehicle_id IS NULL
  LOOP
    v_n := v_n + public.kit_hand_to_van(r.employee_id, r.vehicle_id,
      'Van unassigned in Employee Management: kit stays with ' || COALESCE(r.reg, 'the van') || ' as spare-van kit',
      NULL, 'Automatic', COALESCE(p_is_test, false));
    UPDATE public.kit_person_vans SET vehicle_id = NULL, updated_at = now() WHERE id = r.rec_id;
  END LOOP;
  RETURN v_n;
END;
$$;

-- =============================================================== 2. van off the road
CREATE TABLE public.kit_van_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid REFERENCES public.vehicles(id) ON DELETE SET NULL,
  vehicle_reg_snapshot text,
  reason text NOT NULL CHECK (reason IN ('broken_down', 'leaving_fleet', 'other')),
  note text,
  off_at timestamptz NOT NULL DEFAULT now(),
  off_actor_id uuid REFERENCES public.audit_auditors(id) ON DELETE SET NULL,
  off_actor_name text,
  back_at timestamptz,
  back_actor_id uuid REFERENCES public.audit_auditors(id) ON DELETE SET NULL,
  back_actor_name text,
  is_test boolean NOT NULL DEFAULT false
);
CREATE UNIQUE INDEX kit_van_status_active_uidx ON public.kit_van_status (vehicle_id) WHERE back_at IS NULL AND vehicle_id IS NOT NULL;
CREATE INDEX kit_van_status_off_actor_idx ON public.kit_van_status (off_actor_id);
CREATE INDEX kit_van_status_back_actor_idx ON public.kit_van_status (back_actor_id);
ALTER TABLE public.kit_van_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage van status" ON public.kit_van_status
  FOR ALL TO authenticated USING ((SELECT public.audit_is_admin())) WITH CHECK ((SELECT public.audit_is_admin()));
REVOKE ALL ON public.kit_van_status FROM anon;

/*
  Van off the road. p_moves: [{item_id, to: 'spare' | 'away_for_service' | 'holder',
  service_company?, holder_employee_id?, vehicle_id?}] for kit on this van
  (its spare-van kit, or kit held by people assigned to it).
*/
CREATE FUNCTION public.kit_van_off_road(
  p_vehicle_id uuid, p_reason text, p_note text, p_moves jsonb, p_is_test boolean, p_actor_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_move jsonb;
  v_item public.kit_items%ROWTYPE;
  v_to text;
  v_id uuid;
  v_reg text;
  v_note text;
BEGIN
  PERFORM public.kit_require_admin();
  IF p_actor_id IS NULL THEN RAISE EXCEPTION 'Pick who’s doing this'; END IF;
  IF p_vehicle_id IS NULL THEN RAISE EXCEPTION 'Pick the van'; END IF;
  IF p_reason NOT IN ('broken_down', 'leaving_fleet', 'other') THEN RAISE EXCEPTION 'Say why the van is off the road'; END IF;
  IF EXISTS (SELECT 1 FROM public.kit_van_status WHERE vehicle_id = p_vehicle_id AND back_at IS NULL) THEN
    RAISE EXCEPTION 'This van is already off the road';
  END IF;
  SELECT registration_number INTO v_reg FROM public.vehicles WHERE id = p_vehicle_id;
  v_note := 'Van off the road (' || replace(p_reason, '_', ' ') || '): ' || COALESCE(v_reg, '') ||
            COALESCE(' · ' || NULLIF(btrim(p_note), ''), '');

  FOR v_move IN SELECT * FROM jsonb_array_elements(COALESCE(p_moves, '[]'::jsonb)) LOOP
    v_to := v_move ->> 'to';
    SELECT * INTO v_item FROM public.kit_items WHERE id = (v_move ->> 'item_id')::uuid FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Kit item not found'; END IF;
    IF COALESCE(p_is_test, false) AND NOT v_item.is_test THEN
      RAISE EXCEPTION 'Test mode can only move test kit (% is real kit)', COALESCE(v_item.plant_no, 'an item');
    END IF;
    IF v_item.status <> 'on_van' OR NOT (
         (v_item.holder_employee_id IS NULL AND v_item.vehicle_id = p_vehicle_id)
      OR EXISTS (SELECT 1 FROM public.employees e WHERE e.id = v_item.holder_employee_id AND e.assigned_vehicle_id = p_vehicle_id)) THEN
      RAISE EXCEPTION '% is not on this van any more; reload and try again', COALESCE(v_item.plant_no, 'An item');
    END IF;
    IF v_to = 'spare' THEN
      PERFORM public.kit_move_item(v_item.id, 'spare', NULL, NULL, NULL, v_note, 'moved_to_spare', p_actor_id);
    ELSIF v_to = 'away_for_service' THEN
      PERFORM public.kit_move_item(v_item.id, 'away_for_service', NULL, NULL, v_move ->> 'service_company', v_note, 'sent_for_service', p_actor_id);
    ELSIF v_to = 'holder' THEN
      IF (v_move ->> 'holder_employee_id') IS NULL AND (v_move ->> 'vehicle_id')::uuid = p_vehicle_id THEN
        RAISE EXCEPTION 'Pick somewhere other than this van';
      END IF;
      PERFORM public.kit_move_item(v_item.id, 'on_van', (v_move ->> 'holder_employee_id')::uuid,
                                   (v_move ->> 'vehicle_id')::uuid, NULL, v_note, 'assigned', p_actor_id);
    ELSE
      RAISE EXCEPTION 'Unknown destination %', v_to;
    END IF;
  END LOOP;

  INSERT INTO public.kit_van_status (vehicle_id, vehicle_reg_snapshot, reason, note, off_actor_id, off_actor_name, is_test)
  VALUES (p_vehicle_id, v_reg, p_reason, NULLIF(btrim(p_note), ''), p_actor_id, public.kit_actor_name(p_actor_id), COALESCE(p_is_test, false))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE FUNCTION public.kit_van_back_on_road(p_vehicle_id uuid, p_actor_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  PERFORM public.kit_require_admin();
  IF p_actor_id IS NULL THEN RAISE EXCEPTION 'Pick who’s doing this'; END IF;
  UPDATE public.kit_van_status
     SET back_at = now(), back_actor_id = p_actor_id, back_actor_name = public.kit_actor_name(p_actor_id)
   WHERE vehicle_id = p_vehicle_id AND back_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'This van is not off the road'; END IF;
END;
$$;

-- =============================================================== 3. audit schedule setting
CREATE TABLE public.audit_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  audit_interval_months integer NOT NULL DEFAULT 6 CHECK (audit_interval_months BETWEEN 1 AND 60),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by_name text
);
ALTER TABLE public.audit_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage audit settings" ON public.audit_settings
  FOR ALL TO authenticated USING ((SELECT public.audit_is_admin())) WITH CHECK ((SELECT public.audit_is_admin()));
REVOKE ALL ON public.audit_settings FROM anon;
INSERT INTO public.audit_settings (id, audit_interval_months) VALUES (true, 6);

-- =============================================================== 4. edit / delete audits
CREATE TABLE public.audit_edits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id uuid NOT NULL REFERENCES public.audit_site_audits(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES public.audit_auditors(id) ON DELETE SET NULL,
  actor_name text,
  changes jsonb NOT NULL,
  summary text[] NOT NULL,
  is_test boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX audit_edits_audit_idx ON public.audit_edits (audit_id, created_at);
CREATE INDEX audit_edits_actor_idx ON public.audit_edits (actor_id);

CREATE TABLE public.audit_deletions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id uuid NOT NULL,
  audit_date date,
  team_label text,
  vehicle_reg text,
  reason text NOT NULL,
  actor_id uuid REFERENCES public.audit_auditors(id) ON DELETE SET NULL,
  actor_name text,
  is_test boolean NOT NULL DEFAULT false,
  deleted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_deletions_actor_idx ON public.audit_deletions (actor_id);

ALTER TABLE public.audit_edits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_deletions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read audit edits" ON public.audit_edits
  FOR SELECT TO authenticated USING ((SELECT public.audit_is_admin()));
CREATE POLICY "Admins read audit deletions" ON public.audit_deletions
  FOR SELECT TO authenticated USING ((SELECT public.audit_is_admin()));
-- append-only logs: admins can add (through audit_edit / audit_delete), not change or remove
CREATE POLICY "Admins add audit edits" ON public.audit_edits
  FOR INSERT TO authenticated WITH CHECK ((SELECT public.audit_is_admin()));
CREATE POLICY "Admins add audit deletions" ON public.audit_deletions
  FOR INSERT TO authenticated WITH CHECK ((SELECT public.audit_is_admin()));
REVOKE ALL ON public.audit_edits, public.audit_deletions FROM anon;

/* The lock on submitted audits: changes only from inside audit_edit / audit_delete (transaction flag). */
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
  IF current_setting('audit.allow_change', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
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
    RAISE EXCEPTION 'Submitted audits can only be deleted with "Delete audit"';
  END IF;

  FOREACH v_col IN ARRAY v_fk LOOP
    IF (to_jsonb(NEW) -> v_col) IS DISTINCT FROM (to_jsonb(OLD) -> v_col)
       AND (to_jsonb(NEW) -> v_col) <> 'null'::jsonb THEN
      RAISE EXCEPTION 'Submitted audits can only be changed with "Edit audit"';
    END IF;
  END LOOP;
  IF (to_jsonb(NEW) - v_fk) IS DISTINCT FROM (to_jsonb(OLD) - v_fk) THEN
    RAISE EXCEPTION 'Submitted audits can only be changed with "Edit audit"';
  END IF;
  RETURN NEW;
END;
$$;

/* Write an audit's kit lines and PPE dates back to the audited person / spare van. */
CREATE FUNCTION public.audit_write_back(p_audit_id uuid, p_actor_id uuid)
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
  SELECT * INTO v_audit FROM public.audit_site_audits WHERE id = p_audit_id;
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
                                       v_audit.is_test, p_actor_id, p_audit_id);
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
                             NULL, NULL, p_audit_id, v_audit.is_test, p_actor_id);
    END IF;
    IF v_line.kit_item_id IS DISTINCT FROM v_item_id THEN
      UPDATE public.audit_lines SET kit_item_id = v_item_id WHERE id = v_line.id;
    END IF;
  END LOOP;

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
END;
$$;

/* Submit: same checks as before; the write-back now lives in audit_write_back. */
CREATE OR REPLACE FUNCTION public.audit_submit(p_audit_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_audit public.audit_site_audits%ROWTYPE;
BEGIN
  PERFORM public.kit_require_admin();
  SELECT * INTO v_audit FROM public.audit_site_audits WHERE id = p_audit_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Audit not found'; END IF;
  IF v_audit.status <> 'draft' THEN RAISE EXCEPTION 'This audit has already been submitted'; END IF;
  IF v_audit.auditor_id IS NULL THEN RAISE EXCEPTION 'Pick who did the audit (Audited by)'; END IF;
  PERFORM public.audit_write_back(p_audit_id, v_audit.auditor_id);
  UPDATE public.audit_site_audits SET status = 'submitted', submitted_at = now() WHERE id = p_audit_id;
END;
$$;

/*
  Edit a submitted audit. p_changes: [{line_id, field, to}] with field one of
  result, qty, comment, expiry_date, service_date, plant_no_snapshot, date_tag.
  Logs "Ear defenders N → Y" on the audit and writes back like submit. Returns the summary.
*/
CREATE FUNCTION public.audit_edit(p_audit_id uuid, p_changes jsonb, p_actor_id uuid)
RETURNS text[]
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_audit public.audit_site_audits%ROWTYPE;
  v_c jsonb;
  v_line public.audit_lines%ROWTYPE;
  v_field text;
  v_from text;
  v_to text;
  v_label text;
  v_summary text[] := '{}';
  v_log jsonb := '[]';
BEGIN
  PERFORM public.kit_require_admin();
  IF p_actor_id IS NULL THEN RAISE EXCEPTION 'Pick who’s doing this'; END IF;
  SELECT * INTO v_audit FROM public.audit_site_audits WHERE id = p_audit_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Audit not found'; END IF;
  IF v_audit.status <> 'submitted' THEN RAISE EXCEPTION 'Only submitted audits are edited this way'; END IF;

  PERFORM set_config('audit.allow_change', 'on', true);
  FOR v_c IN SELECT * FROM jsonb_array_elements(COALESCE(p_changes, '[]'::jsonb)) LOOP
    v_field := v_c ->> 'field';
    IF v_field NOT IN ('result', 'qty', 'comment', 'expiry_date', 'service_date', 'plant_no_snapshot', 'date_tag') THEN
      RAISE EXCEPTION 'That can’t be edited';
    END IF;
    SELECT * INTO v_line FROM public.audit_lines WHERE id = (v_c ->> 'line_id')::uuid AND audit_id = p_audit_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'That line is not on this audit'; END IF;
    v_from := NULLIF(btrim(to_jsonb(v_line) ->> v_field), '');
    v_to := NULLIF(btrim(v_c ->> 'to'), '');
    IF v_from IS NOT DISTINCT FROM v_to THEN CONTINUE; END IF;
    IF v_field = 'result' AND v_to IS NOT NULL AND v_to NOT IN ('Y', 'N', 'not_carried') THEN RAISE EXCEPTION 'Unknown answer %', v_to; END IF;

    EXECUTE format('UPDATE public.audit_lines SET %I = $1::%s WHERE id = $2', v_field,
                   CASE WHEN v_field IN ('expiry_date', 'service_date') THEN 'date' ELSE 'text' END)
      USING v_to, v_line.id;

    v_label := CASE v_field WHEN 'result' THEN NULL WHEN 'qty' THEN 'qty' WHEN 'comment' THEN 'comment'
                 WHEN 'expiry_date' THEN 'expiry' WHEN 'service_date' THEN 'service date'
                 WHEN 'plant_no_snapshot' THEN 'plant no' ELSE 'date/tag' END;
    v_summary := v_summary || (v_line.item_name || COALESCE(' ' || v_label || ':', '') || ' ' ||
      CASE WHEN v_from = 'not_carried' THEN 'Not carried' ELSE COALESCE(v_from, '—') END || ' → ' ||
      CASE WHEN v_to = 'not_carried' THEN 'Not carried' ELSE COALESCE(v_to, '—') END);
    v_log := v_log || jsonb_build_object('line_id', v_line.id, 'item', v_line.item_name, 'field', v_field, 'from', v_from, 'to', v_to);
  END LOOP;

  IF jsonb_array_length(v_log) = 0 THEN
    PERFORM set_config('audit.allow_change', 'off', true);
    RAISE EXCEPTION 'Nothing was changed';
  END IF;

  INSERT INTO public.audit_edits (audit_id, actor_id, actor_name, changes, summary, is_test)
  VALUES (p_audit_id, p_actor_id, public.kit_actor_name(p_actor_id), v_log, v_summary, v_audit.is_test);
  PERFORM public.audit_write_back(p_audit_id, p_actor_id);
  PERFORM set_config('audit.allow_change', 'off', true);
  RETURN v_summary;
END;
$$;

/* Delete an audit (lines, members, edits go with it). Kit stays where it is. Returns photo paths to remove from storage. */
CREATE FUNCTION public.audit_delete(p_audit_id uuid, p_reason text, p_actor_id uuid)
RETURNS text[]
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_audit public.audit_site_audits%ROWTYPE;
  v_paths text[];
BEGIN
  PERFORM public.kit_require_admin();
  IF p_actor_id IS NULL THEN RAISE EXCEPTION 'Pick who’s doing this'; END IF;
  IF NULLIF(btrim(p_reason), '') IS NULL THEN RAISE EXCEPTION 'Give a reason for deleting the audit'; END IF;
  SELECT * INTO v_audit FROM public.audit_site_audits WHERE id = p_audit_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Audit not found'; END IF;
  SELECT COALESCE(array_agg(photo_path) FILTER (WHERE photo_path IS NOT NULL), '{}') INTO v_paths
    FROM public.audit_lines WHERE audit_id = p_audit_id;
  INSERT INTO public.audit_deletions (audit_id, audit_date, team_label, vehicle_reg, reason, actor_id, actor_name, is_test)
  VALUES (p_audit_id, v_audit.audit_date,
          COALESCE(v_audit.ganger_name_snapshot, v_audit.team_name_snapshot), v_audit.vehicle_reg_snapshot,
          btrim(p_reason), p_actor_id, public.kit_actor_name(p_actor_id), v_audit.is_test);
  PERFORM set_config('audit.allow_change', 'on', true);
  DELETE FROM public.audit_site_audits WHERE id = p_audit_id;
  PERFORM set_config('audit.allow_change', 'off', true);
  RETURN v_paths;
END;
$$;

-- =============================================================== 5. delete plant completely
/* Type the plant no to confirm (or the kit type when it has none). Returns certificate paths to remove from storage. */
CREATE FUNCTION public.kit_delete_item(p_item_id uuid, p_confirm text, p_actor_id uuid)
RETURNS text[]
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_item public.kit_items%ROWTYPE;
  v_type text;
  v_paths text[];
BEGIN
  PERFORM public.kit_require_admin();
  IF p_actor_id IS NULL THEN RAISE EXCEPTION 'Pick who’s doing this'; END IF;
  SELECT * INTO v_item FROM public.kit_items WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Kit item not found'; END IF;
  SELECT name INTO v_type FROM public.kit_types WHERE id = v_item.kit_type_id;
  IF lower(btrim(COALESCE(p_confirm, ''))) <> lower(btrim(COALESCE(v_item.plant_no, v_type))) THEN
    RAISE EXCEPTION 'Type % exactly to confirm', COALESCE(v_item.plant_no, v_type);
  END IF;
  SELECT COALESCE(array_agg(certificate_path) FILTER (WHERE certificate_path IS NOT NULL), '{}') INTO v_paths
    FROM public.kit_history WHERE kit_item_id = p_item_id;
  -- audit lines keep their own text; their link to the item is cleared by the foreign key
  PERFORM set_config('audit.allow_change', 'on', true);
  DELETE FROM public.kit_items WHERE id = p_item_id;
  PERFORM set_config('audit.allow_change', 'off', true);
  RETURN v_paths;
END;
$$;

-- =============================================================== grants
REVOKE EXECUTE ON FUNCTION
  public.kit_person_vans_keep_ref(), public.kit_last_van(uuid), public.kit_items_holder_lost(), public.kit_rows_holder_lost(),
  public.kit_hand_to_van(uuid, uuid, text, uuid, text, boolean),
  public.kit_take_out_of_van(uuid, uuid, text, boolean, uuid),
  public.kit_reconcile_unassigned(boolean),
  public.kit_van_off_road(uuid, text, text, jsonb, boolean, uuid),
  public.kit_van_back_on_road(uuid, uuid),
  public.audit_write_back(uuid, uuid),
  public.audit_edit(uuid, jsonb, uuid),
  public.audit_delete(uuid, text, uuid),
  public.kit_delete_item(uuid, text, uuid)
FROM anon, public;
GRANT EXECUTE ON FUNCTION
  public.kit_last_van(uuid),
  public.kit_hand_to_van(uuid, uuid, text, uuid, text, boolean),
  public.kit_take_out_of_van(uuid, uuid, text, boolean, uuid),
  public.kit_reconcile_unassigned(boolean),
  public.kit_van_off_road(uuid, text, text, jsonb, boolean, uuid),
  public.kit_van_back_on_road(uuid, uuid),
  public.audit_write_back(uuid, uuid),
  public.audit_edit(uuid, jsonb, uuid),
  public.audit_delete(uuid, text, uuid),
  public.kit_delete_item(uuid, text, uuid)
TO authenticated;
