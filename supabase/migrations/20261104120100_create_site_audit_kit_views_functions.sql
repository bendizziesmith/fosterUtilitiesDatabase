/*
  # Site Audits + Kit & Plant — views and functions (ADD ONLY)

  Statuses are worked out in Postgres, the same rule as
  getVehicleServiceStatus(): expired when the date is past, due soon when it
  is today or within 30 days. "Today" is UK time.

  Views (security_invoker, so the admin-only RLS of the tables applies):
    - kit_items_overview        every kit item + type, van, ganger, status
    - audit_needs_attention     KIT and PPE that is expired or due within 30 days (never H&S)
    - audit_site_audit_summary  one row per audit with fail / expired / due-soon counts
    - kit_recent_updates        what was cleared/changed, by whom, when

  Functions (SECURITY INVOKER, admins only):
    - audit_submit, kit_add_item, kit_update_item, kit_move_item, kit_swap,
      kit_set_van_carried, audit_update_ppe
*/

-- ---------------------------------------------------------------- date helpers
CREATE FUNCTION public.audit_today()
RETURNS date
LANGUAGE sql
STABLE
SET search_path = ''
AS $$ SELECT (now() AT TIME ZONE 'Europe/London')::date; $$;

CREATE FUNCTION public.audit_expiry_status(p_expiry date, p_on date DEFAULT NULL)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_expiry IS NULL THEN NULL
    WHEN p_expiry < COALESCE(p_on, public.audit_today()) THEN 'expired'
    WHEN p_expiry <= COALESCE(p_on, public.audit_today()) + 30 THEN 'due_soon'
    ELSE 'ok'
  END;
$$;

CREATE FUNCTION public.audit_actor_name()
RETURNS text
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT COALESCE(
    (SELECT e.full_name FROM public.user_profiles up
       JOIN public.employees e ON e.id = up.employee_id
      WHERE up.id = (SELECT auth.uid())),
    (SELECT auth.jwt() ->> 'email'),
    'Unknown'
  );
$$;

-- ---------------------------------------------------------------- views
CREATE VIEW public.kit_items_overview
WITH (security_invoker = true) AS
SELECT
  k.id, k.kit_type_id, t.name AS type_name, t.sort_order AS type_sort,
  k.plant_no, k.status, k.vehicle_id,
  COALESCE(v.registration_number, k.vehicle_reg_snapshot) AS vehicle_reg,
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

CREATE VIEW public.audit_needs_attention
WITH (security_invoker = true) AS
SELECT
  'kit'::text AS source, k.id AS item_id, k.type_name AS item_name, k.plant_no,
  k.status AS kit_status, k.vehicle_id, k.vehicle_reg, k.ganger_name,
  k.expiry_date, k.days_left, k.expiry_status, k.is_test
FROM public.kit_items_overview k
WHERE k.status IN ('on_van', 'spare')
  AND k.expiry_status IN ('expired', 'due_soon')
UNION ALL
SELECT
  'ppe'::text, p.id, p.item_name, NULL::text,
  NULL::text, p.vehicle_id,
  COALESCE(v.registration_number, p.vehicle_reg_snapshot), g.full_name,
  p.expiry_date, p.expiry_date - public.audit_today(),
  public.audit_expiry_status(p.expiry_date), p.is_test
FROM public.audit_ppe_items p
LEFT JOIN public.vehicles v ON v.id = p.vehicle_id
LEFT JOIN LATERAL (
  SELECT e.full_name FROM public.employees e
  WHERE e.role = 'Ganger' AND e.assigned_vehicle_id = p.vehicle_id
  ORDER BY e.full_name LIMIT 1
) g ON p.vehicle_id IS NOT NULL
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
  m.member_names
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
  COALESCE(v.registration_number, k.vehicle_reg_snapshot, pv.registration_number, p.vehicle_reg_snapshot) AS vehicle_reg,
  h.old_values, h.new_values
FROM public.kit_history h
LEFT JOIN public.kit_items k ON k.id = h.kit_item_id
LEFT JOIN public.kit_types t ON t.id = k.kit_type_id
LEFT JOIN public.vehicles v ON v.id = k.vehicle_id
LEFT JOIN public.audit_ppe_items p ON p.id = h.ppe_item_id
LEFT JOIN public.vehicles pv ON pv.id = p.vehicle_id
WHERE h.action <> 'audit_seen';

-- ---------------------------------------------------------------- internal helpers
CREATE FUNCTION public.kit_require_admin()
RETURNS void
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
BEGIN
  IF NOT public.audit_is_admin() THEN
    RAISE EXCEPTION 'Only admins can change audits and kit' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE FUNCTION public.kit_snapshot(p_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'plant_no', k.plant_no, 'status', k.status, 'vehicle_id', k.vehicle_id,
    'vehicle_reg', k.vehicle_reg_snapshot, 'service_company', k.service_company,
    'service_date', k.service_date, 'expiry_date', k.expiry_date)
  FROM public.kit_items k WHERE k.id = p_id;
$$;

CREATE FUNCTION public.kit_log(
  p_kit_item_id uuid, p_ppe_item_id uuid, p_action text,
  p_old jsonb, p_new jsonb, p_note text, p_certificate_path text,
  p_audit_id uuid, p_is_test boolean)
RETURNS void
LANGUAGE sql
SET search_path = ''
AS $$
  INSERT INTO public.kit_history
    (kit_item_id, ppe_item_id, action, old_values, new_values, note,
     certificate_path, audit_id, by_user, by_name, is_test)
  VALUES
    (p_kit_item_id, p_ppe_item_id, p_action, p_old, p_new, NULLIF(btrim(p_note), ''),
     NULLIF(btrim(p_certificate_path), ''), p_audit_id, (SELECT auth.uid()),
     public.audit_actor_name(), COALESCE(p_is_test, false));
$$;

CREATE FUNCTION public.kit_set_van_carried(
  p_vehicle_id uuid, p_kit_type_id uuid, p_carried boolean, p_is_test boolean DEFAULT false)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  PERFORM public.kit_require_admin();
  IF p_vehicle_id IS NULL OR p_kit_type_id IS NULL THEN RETURN; END IF;
  INSERT INTO public.kit_van_kit_list (vehicle_id, kit_type_id, carried, is_test, updated_by, updated_at)
  VALUES (p_vehicle_id, p_kit_type_id, p_carried, COALESCE(p_is_test, false), (SELECT auth.uid()), now())
  ON CONFLICT (vehicle_id, kit_type_id) DO UPDATE
    SET carried = EXCLUDED.carried, updated_by = EXCLUDED.updated_by, updated_at = now();
END;
$$;

-- ---------------------------------------------------------------- kit actions
CREATE FUNCTION public.kit_add_item(
  p_kit_type_id uuid, p_plant_no text, p_service_date date, p_expiry_date date,
  p_status text, p_vehicle_id uuid, p_service_company text, p_notes text,
  p_is_test boolean DEFAULT false, p_audit_id uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
  v_reg text;
BEGIN
  PERFORM public.kit_require_admin();
  IF p_status NOT IN ('on_van', 'spare', 'away_for_service') THEN
    RAISE EXCEPTION 'Choose where the kit is: a van, spare in yard, or away for service';
  END IF;
  IF p_status = 'on_van' AND p_vehicle_id IS NULL THEN
    RAISE EXCEPTION 'Pick the van this kit is on';
  END IF;
  IF p_status = 'on_van' THEN
    SELECT registration_number INTO v_reg FROM public.vehicles WHERE id = p_vehicle_id;
  END IF;

  INSERT INTO public.kit_items
    (kit_type_id, plant_no, status, vehicle_id, vehicle_reg_snapshot, service_company,
     service_date, expiry_date, notes, last_seen_at, last_seen_source, last_seen_audit_id,
     is_test, created_by)
  VALUES
    (p_kit_type_id, NULLIF(btrim(p_plant_no), ''), p_status,
     CASE WHEN p_status = 'on_van' THEN p_vehicle_id END, v_reg,
     CASE WHEN p_status = 'away_for_service' THEN NULLIF(btrim(p_service_company), '') END,
     p_service_date, p_expiry_date, NULLIF(btrim(p_notes), ''), now(),
     CASE WHEN p_audit_id IS NULL THEN 'added' ELSE 'audit' END, p_audit_id,
     COALESCE(p_is_test, false), (SELECT auth.uid()))
  RETURNING id INTO v_id;

  IF p_status = 'on_van' THEN
    PERFORM public.kit_set_van_carried(p_vehicle_id, p_kit_type_id, true, p_is_test);
  END IF;
  PERFORM public.kit_log(v_id, NULL, 'added', NULL, public.kit_snapshot(v_id), p_notes, NULL, p_audit_id, p_is_test);
  RETURN v_id;
END;
$$;

CREATE FUNCTION public.kit_update_item(
  p_item_id uuid, p_action text, p_service_date date, p_expiry_date date,
  p_plant_no text, p_certificate_path text, p_note text)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_old jsonb;
  v_is_test boolean;
BEGIN
  PERFORM public.kit_require_admin();
  IF p_action NOT IN ('reserviced', 'replaced') THEN
    RAISE EXCEPTION 'Unknown update type %', p_action;
  END IF;
  SELECT is_test INTO v_is_test FROM public.kit_items WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Kit item not found'; END IF;
  v_old := public.kit_snapshot(p_item_id);

  UPDATE public.kit_items SET
    service_date = p_service_date,
    expiry_date = p_expiry_date,
    plant_no = COALESCE(NULLIF(btrim(p_plant_no), ''), plant_no),
    last_seen_at = now(),
    last_seen_source = 'update'
  WHERE id = p_item_id;

  PERFORM public.kit_log(p_item_id, NULL, p_action, v_old, public.kit_snapshot(p_item_id),
                         p_note, p_certificate_path, NULL, v_is_test);
END;
$$;

CREATE FUNCTION public.kit_move_item(
  p_item_id uuid, p_status text, p_vehicle_id uuid, p_service_company text,
  p_note text, p_action text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_old jsonb;
  v_old_status text;
  v_type uuid;
  v_is_test boolean;
  v_reg text;
  v_action text;
BEGIN
  PERFORM public.kit_require_admin();
  IF p_status NOT IN ('on_van', 'spare', 'away_for_service', 'removed') THEN
    RAISE EXCEPTION 'Unknown destination %', p_status;
  END IF;
  IF p_status = 'on_van' AND p_vehicle_id IS NULL THEN
    RAISE EXCEPTION 'Pick the van';
  END IF;
  SELECT status, kit_type_id, is_test INTO v_old_status, v_type, v_is_test
  FROM public.kit_items WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Kit item not found'; END IF;
  v_old := public.kit_snapshot(p_item_id);
  IF p_status = 'on_van' THEN
    SELECT registration_number INTO v_reg FROM public.vehicles WHERE id = p_vehicle_id;
  END IF;

  v_action := COALESCE(p_action, CASE
    WHEN p_status = 'removed' THEN 'removed'
    WHEN p_status = 'away_for_service' THEN 'sent_for_service'
    WHEN v_old_status = 'away_for_service' THEN 'back_from_service'
    WHEN p_status = 'spare' THEN 'moved_to_spare'
    ELSE 'assigned'
  END);

  UPDATE public.kit_items SET
    status = p_status,
    vehicle_id = CASE WHEN p_status = 'on_van' THEN p_vehicle_id END,
    vehicle_reg_snapshot = CASE WHEN p_status = 'on_van' THEN v_reg ELSE vehicle_reg_snapshot END,
    service_company = CASE WHEN p_status = 'away_for_service' THEN NULLIF(btrim(p_service_company), '') END,
    removed_at = CASE WHEN p_status = 'removed' THEN now() END,
    last_seen_at = now(),
    last_seen_source = CASE WHEN v_action IN ('swapped_out', 'swapped_in') THEN 'swap' ELSE 'moved' END
  WHERE id = p_item_id;

  IF p_status = 'on_van' THEN
    PERFORM public.kit_set_van_carried(p_vehicle_id, v_type, true, v_is_test);
  END IF;
  PERFORM public.kit_log(p_item_id, NULL, v_action, v_old, public.kit_snapshot(p_item_id),
                         p_note, NULL, NULL, v_is_test);
END;
$$;

CREATE FUNCTION public.kit_swap(
  p_item_id uuid, p_destination text, p_dest_vehicle_id uuid, p_service_company text,
  p_replacement text, p_spare_id uuid, p_new_plant_no text, p_new_service_date date,
  p_new_expiry_date date, p_note text)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_item public.kit_items%ROWTYPE;
  v_spare public.kit_items%ROWTYPE;
  v_new uuid;
BEGIN
  PERFORM public.kit_require_admin();
  SELECT * INTO v_item FROM public.kit_items WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Kit item not found'; END IF;
  IF v_item.status <> 'on_van' OR v_item.vehicle_id IS NULL THEN
    RAISE EXCEPTION 'Only kit that is on a van can be swapped';
  END IF;
  IF p_destination = 'on_van' AND p_dest_vehicle_id = v_item.vehicle_id THEN
    RAISE EXCEPTION 'Pick a different van';
  END IF;

  -- 1. where the old item goes
  PERFORM public.kit_move_item(p_item_id, p_destination, p_dest_vehicle_id,
                               p_service_company, p_note, 'swapped_out');

  -- 2. what goes on the van instead
  IF p_replacement = 'spare' THEN
    SELECT * INTO v_spare FROM public.kit_items WHERE id = p_spare_id FOR UPDATE;
    IF NOT FOUND OR v_spare.status <> 'spare' OR v_spare.kit_type_id <> v_item.kit_type_id THEN
      RAISE EXCEPTION 'That spare is not available';
    END IF;
    PERFORM public.kit_move_item(p_spare_id, 'on_van', v_item.vehicle_id, NULL, p_note, 'swapped_in');
    RETURN p_spare_id;
  ELSIF p_replacement = 'new' THEN
    v_new := public.kit_add_item(v_item.kit_type_id, p_new_plant_no, p_new_service_date,
                                 p_new_expiry_date, 'on_van', v_item.vehicle_id, NULL,
                                 p_note, v_item.is_test, NULL);
    PERFORM public.kit_log(v_new, NULL, 'swapped_in', NULL, public.kit_snapshot(v_new),
                           p_note, NULL, NULL, v_item.is_test);
    RETURN v_new;
  ELSIF p_replacement = 'none' THEN
    RETURN NULL;
  END IF;
  RAISE EXCEPTION 'Unknown replacement %', p_replacement;
END;
$$;

CREATE FUNCTION public.audit_update_ppe(
  p_ppe_id uuid, p_expiry_date date, p_certificate_path text, p_note text)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_old date;
  v_is_test boolean;
BEGIN
  PERFORM public.kit_require_admin();
  SELECT expiry_date, is_test INTO v_old, v_is_test
  FROM public.audit_ppe_items WHERE id = p_ppe_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PPE item not found'; END IF;
  UPDATE public.audit_ppe_items
     SET expiry_date = p_expiry_date, source = 'update',
         updated_by = (SELECT auth.uid()), updated_at = now()
   WHERE id = p_ppe_id;
  PERFORM public.kit_log(NULL, p_ppe_id, 'expiry_updated',
                         jsonb_build_object('expiry_date', v_old),
                         jsonb_build_object('expiry_date', p_expiry_date),
                         p_note, p_certificate_path, NULL, v_is_test);
END;
$$;

-- ---------------------------------------------------------------- submit an audit
CREATE FUNCTION public.audit_submit(p_audit_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_audit public.audit_site_audits%ROWTYPE;
  v_line public.audit_lines%ROWTYPE;
  v_item_id uuid;
  v_old jsonb;
  v_reg text;
BEGIN
  PERFORM public.kit_require_admin();
  SELECT * INTO v_audit FROM public.audit_site_audits WHERE id = p_audit_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Audit not found'; END IF;
  IF v_audit.status <> 'draft' THEN RAISE EXCEPTION 'This audit has already been submitted'; END IF;
  IF v_audit.vehicle_id IS NOT NULL THEN
    SELECT registration_number INTO v_reg FROM public.vehicles WHERE id = v_audit.vehicle_id;
  END IF;

  -- Kit lines update the Kit & Plant list
  FOR v_line IN
    SELECT * FROM public.audit_lines
    WHERE audit_id = p_audit_id AND section = 'kit' ORDER BY sort_order
  LOOP
    IF v_line.result = 'not_carried' THEN
      PERFORM public.kit_set_van_carried(v_audit.vehicle_id, v_line.kit_type_id, false, v_audit.is_test);
      CONTINUE;
    END IF;
    -- empty line (nothing ticked, no plant no, no dates): nothing to record
    IF v_line.result IS NULL AND NULLIF(btrim(v_line.plant_no_snapshot), '') IS NULL
       AND v_line.service_date IS NULL AND v_line.expiry_date IS NULL THEN
      CONTINUE;
    END IF;
    IF v_line.kit_type_id IS NULL THEN CONTINUE; END IF;

    PERFORM public.kit_set_van_carried(v_audit.vehicle_id, v_line.kit_type_id, true, v_audit.is_test);

    v_item_id := v_line.kit_item_id;
    IF v_item_id IS NULL AND NULLIF(btrim(v_line.plant_no_snapshot), '') IS NOT NULL THEN
      SELECT id INTO v_item_id FROM public.kit_items
      WHERE status <> 'removed' AND lower(btrim(plant_no)) = lower(btrim(v_line.plant_no_snapshot))
      LIMIT 1;
    END IF;

    IF v_item_id IS NULL THEN
      INSERT INTO public.kit_items
        (kit_type_id, plant_no, status, vehicle_id, vehicle_reg_snapshot, service_date,
         expiry_date, last_seen_at, last_seen_source, last_seen_audit_id, is_test, created_by)
      VALUES
        (v_line.kit_type_id, NULLIF(btrim(v_line.plant_no_snapshot), ''),
         CASE WHEN v_audit.vehicle_id IS NULL THEN 'spare' ELSE 'on_van' END,
         v_audit.vehicle_id, COALESCE(v_reg, v_audit.vehicle_reg_snapshot),
         v_line.service_date, v_line.expiry_date, now(), 'audit', p_audit_id,
         v_audit.is_test, (SELECT auth.uid()))
      RETURNING id INTO v_item_id;
      PERFORM public.kit_log(v_item_id, NULL, 'added', NULL, public.kit_snapshot(v_item_id),
                             'Recorded in audit', NULL, p_audit_id, v_audit.is_test);
    ELSE
      v_old := public.kit_snapshot(v_item_id);
      UPDATE public.kit_items SET
        plant_no = COALESCE(NULLIF(btrim(v_line.plant_no_snapshot), ''), plant_no),
        service_date = COALESCE(v_line.service_date, service_date),
        expiry_date = COALESCE(v_line.expiry_date, expiry_date),
        status = CASE WHEN v_audit.vehicle_id IS NULL THEN status ELSE 'on_van' END,
        vehicle_id = COALESCE(v_audit.vehicle_id, vehicle_id),
        vehicle_reg_snapshot = COALESCE(v_reg, vehicle_reg_snapshot),
        service_company = CASE WHEN v_audit.vehicle_id IS NULL THEN service_company END,
        removed_at = NULL,
        last_seen_at = now(),
        last_seen_source = 'audit',
        last_seen_audit_id = p_audit_id
      WHERE id = v_item_id;
      PERFORM public.kit_log(v_item_id, NULL, 'audit_seen', v_old, public.kit_snapshot(v_item_id),
                             NULL, NULL, p_audit_id, v_audit.is_test);
    END IF;

    UPDATE public.audit_lines SET kit_item_id = v_item_id WHERE id = v_line.id;
  END LOOP;

  -- PPE: the van's latest audit sets the expiry used by Needs attention
  IF v_audit.vehicle_id IS NOT NULL THEN
    INSERT INTO public.audit_ppe_items
      (vehicle_id, vehicle_reg_snapshot, checklist_item_id, item_name, expiry_date,
       source, source_audit_id, is_test, updated_by, updated_at)
    SELECT v_audit.vehicle_id, COALESCE(v_reg, v_audit.vehicle_reg_snapshot),
           l.checklist_item_id, l.item_name, l.expiry_date,
           'audit', p_audit_id, v_audit.is_test, (SELECT auth.uid()), now()
    FROM public.audit_lines l
    WHERE l.audit_id = p_audit_id AND l.section = 'ppe' AND l.checklist_item_id IS NOT NULL
    ON CONFLICT (vehicle_id, checklist_item_id) DO UPDATE SET
      expiry_date = EXCLUDED.expiry_date, item_name = EXCLUDED.item_name,
      vehicle_reg_snapshot = EXCLUDED.vehicle_reg_snapshot, source = 'audit',
      source_audit_id = EXCLUDED.source_audit_id, is_test = EXCLUDED.is_test,
      updated_by = EXCLUDED.updated_by, updated_at = now();
  END IF;

  UPDATE public.audit_site_audits
     SET status = 'submitted', submitted_at = now()
   WHERE id = p_audit_id;
END;
$$;

-- ---------------------------------------------------------------- grants: signed-in users only (RLS + kit_require_admin limit to admins)
REVOKE ALL ON public.kit_items_overview, public.audit_needs_attention,
  public.audit_site_audit_summary, public.kit_recent_updates FROM anon;

REVOKE EXECUTE ON FUNCTION
  public.audit_today(), public.audit_expiry_status(date, date), public.audit_actor_name(),
  public.kit_require_admin(), public.kit_snapshot(uuid),
  public.kit_log(uuid, uuid, text, jsonb, jsonb, text, text, uuid, boolean),
  public.kit_set_van_carried(uuid, uuid, boolean, boolean),
  public.kit_add_item(uuid, text, date, date, text, uuid, text, text, boolean, uuid),
  public.kit_update_item(uuid, text, date, date, text, text, text),
  public.kit_move_item(uuid, text, uuid, text, text, text),
  public.kit_swap(uuid, text, uuid, text, text, uuid, text, date, date, text),
  public.audit_update_ppe(uuid, date, text, text),
  public.audit_submit(uuid),
  public.audit_guard_submitted(), public.audit_guard_insert_child(), public.audit_touch_updated_at()
FROM anon, public;

GRANT EXECUTE ON FUNCTION
  public.audit_today(), public.audit_expiry_status(date, date), public.audit_actor_name(),
  public.kit_require_admin(), public.kit_snapshot(uuid),
  public.kit_log(uuid, uuid, text, jsonb, jsonb, text, text, uuid, boolean),
  public.kit_set_van_carried(uuid, uuid, boolean, boolean),
  public.kit_add_item(uuid, text, date, date, text, uuid, text, text, boolean, uuid),
  public.kit_update_item(uuid, text, date, date, text, text, text),
  public.kit_move_item(uuid, text, uuid, text, text, text),
  public.kit_swap(uuid, text, uuid, text, text, uuid, text, date, date, text),
  public.audit_update_ppe(uuid, date, text, text),
  public.audit_submit(uuid)
TO authenticated;
