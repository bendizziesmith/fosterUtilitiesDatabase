-- Round 15: dates for the 4 dated H&S items (Fire ext 2KG dry powder, First aid kit, Eye wash, Burns kit).
--  1. Update sheet: fire extinguisher "Tested" (same one) or "Replaced" with Date tested + expiry;
--     the other three "Replaced" with a new expiry. History logs 'tested' / 'replaced' with the dates.
--  2. Yard Lockup: these 4 are kept as one line per expiry (Date tested too for the fire extinguisher);
--     adding with the same expiry adds to that line. Issue copies the line's dates onto the person's
--     record; Return asks for the dates. The person's holdings add up all lines of the item.
-- The 4 = audit_checklist_items with section 'hs' and has_expiry (the fire extinguisher is the one with a
-- service interval). Touches only this build's audit_ / kit_ objects. No DELETE; no row of any table changed.

-- ---------------------------------------------------------------- which kind of dates an item takes
CREATE OR REPLACE FUNCTION public.kit_hs_date_kind(p_checklist_item_id uuid)
RETURNS text LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT CASE WHEN c.section = 'hs' AND c.has_expiry THEN
              CASE WHEN c.service_interval_months IS NOT NULL THEN 'tested' ELSE 'expiry' END END
    FROM public.audit_checklist_items c WHERE c.id = p_checklist_item_id;
$$;

-- ---------------------------------------------------------------- history: 'tested'
ALTER TABLE public.kit_history DROP CONSTRAINT kit_history_action_check;
ALTER TABLE public.kit_history ADD CONSTRAINT kit_history_action_check CHECK (action = ANY (ARRAY[
  'added', 'reserviced', 'replaced', 'expiry_updated', 'audit_seen', 'swapped_out', 'swapped_in', 'assigned',
  'sent_for_service', 'back_from_service', 'moved_to_spare', 'removed', 'tested']));

-- ---------------------------------------------------------------- lockup lines carry dates
ALTER TABLE public.kit_lockup_stock ADD COLUMN IF NOT EXISTS tested_date date;
ALTER TABLE public.kit_lockup_stock ADD COLUMN IF NOT EXISTS expiry_date date;
-- one line per audit-sheet item AND expiry (undated items still have exactly one line)
DROP INDEX IF EXISTS public.kit_lockup_stock_item_uidx;
CREATE UNIQUE INDEX kit_lockup_stock_item_uidx ON public.kit_lockup_stock (checklist_item_id, is_test, expiry_date)
  NULLS NOT DISTINCT WHERE checklist_item_id IS NOT NULL;

CREATE OR REPLACE VIEW public.kit_lockup_overview WITH (security_invoker = true) AS
SELECT s.id,
       s.section,
       s.checklist_item_id,
       COALESCE(c.name, s.custom_name) AS name,
       c.expected_qty,
       c.service_interval_months,
       c.date_label,
       s.quantity,
       s.note,
       s.is_test,
       s.created_at,
       s.updated_at,
       COALESCE(c.sort_order, 1000) AS sheet_order,
       s.low_at,
       s.tested_date,
       s.expiry_date,
       public.kit_hs_date_kind(s.checklist_item_id) AS date_kind
  FROM public.kit_lockup_stock s
  LEFT JOIN public.audit_checklist_items c ON c.id = s.checklist_item_id;

-- What a person holds: all lines of one audit-sheet item together (stock_id = the line last moved).
CREATE OR REPLACE VIEW public.kit_lockup_person_issues WITH (security_invoker = true) AS
SELECT m.employee_id,
       (array_agg(m.stock_id ORDER BY m.created_at DESC))[1] AS stock_id,
       o.section,
       o.checklist_item_id,
       o.name AS item_name,
       (sum(CASE m.kind WHEN 'issued' THEN m.quantity WHEN 'returned' THEN -m.quantity END))::integer AS quantity_held,
       max(m.created_at) FILTER (WHERE m.kind = 'issued') AS last_issued_at,
       bool_or(m.is_test) AS is_test
  FROM public.kit_lockup_movements m
  JOIN public.kit_lockup_overview o ON o.id = m.stock_id
 WHERE m.kind IN ('issued', 'returned') AND m.employee_id IS NOT NULL
 GROUP BY m.employee_id, COALESCE(o.checklist_item_id, m.stock_id), o.is_test, o.section, o.checklist_item_id, o.name;

-- "13 Nov 2026"
CREATE OR REPLACE FUNCTION public.kit_day(p date)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = '' AS $$ SELECT to_char(p, 'DD Mon YYYY') $$;

-- Check the dates a dated item needs; returns the kind (null = not one of the 4: dates are dropped).
CREATE OR REPLACE FUNCTION public.kit_hs_check_dates(p_checklist_item_id uuid, p_tested_date date, p_expiry_date date)
RETURNS text LANGUAGE plpgsql STABLE SET search_path = '' AS $$
DECLARE
  v_kind text := public.kit_hs_date_kind(p_checklist_item_id);
BEGIN
  IF v_kind = 'tested' AND p_tested_date IS NULL THEN RAISE EXCEPTION 'Enter the date tested'; END IF;
  IF v_kind IS NOT NULL AND p_expiry_date IS NULL THEN RAISE EXCEPTION 'Enter the expiry date'; END IF;
  RETURN v_kind;
END;
$$;

-- The line for an item + expiry (made, with 0 in it and the item's "Low at", if there isn't one yet).
CREATE OR REPLACE FUNCTION public.kit_lockup_dated_line(p_checklist_item_id uuid, p_is_test boolean, p_tested_date date, p_expiry_date date)
RETURNS uuid LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.kit_lockup_stock
   WHERE checklist_item_id = p_checklist_item_id AND is_test = p_is_test AND expiry_date IS NOT DISTINCT FROM p_expiry_date
   FOR UPDATE;
  IF v_id IS NULL THEN
    INSERT INTO public.kit_lockup_stock (section, checklist_item_id, quantity, is_test, tested_date, expiry_date, low_at)
    VALUES ('hs', p_checklist_item_id, 0, p_is_test, p_tested_date, p_expiry_date,
            (SELECT max(low_at) FROM public.kit_lockup_stock WHERE checklist_item_id = p_checklist_item_id AND is_test = p_is_test))
    RETURNING id INTO v_id;
  ELSIF p_tested_date IS NOT NULL THEN
    UPDATE public.kit_lockup_stock SET tested_date = COALESCE(tested_date, p_tested_date) WHERE id = v_id;
  END IF;
  RETURN v_id;
END;
$$;

-- ---------------------------------------------------------------- Add to lockup, with dates
CREATE OR REPLACE FUNCTION public.kit_lockup_add(p_section text, p_checklist_item_id uuid, p_custom_name text, p_quantity integer,
  p_note text, p_is_test boolean, p_actor_id uuid, p_tested_date date, p_expiry_date date)
RETURNS uuid LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_id uuid;
  v_qty integer;
  v_section text := p_section;
  v_kind text;
  v_is_test boolean := COALESCE(p_is_test, false);
BEGIN
  PERFORM public.kit_require_admin();
  IF p_actor_id IS NULL THEN RAISE EXCEPTION 'Pick who’s doing this'; END IF;
  IF p_quantity IS NULL OR p_quantity < 1 THEN RAISE EXCEPTION 'Enter how many (1 or more)'; END IF;
  IF p_checklist_item_id IS NOT NULL THEN
    SELECT section INTO v_section FROM public.audit_checklist_items WHERE id = p_checklist_item_id;
    IF v_section IS NULL THEN RAISE EXCEPTION 'That audit sheet item was not found'; END IF;
    v_kind := public.kit_hs_check_dates(p_checklist_item_id, p_tested_date, p_expiry_date);
    IF v_kind IS NOT NULL THEN
      v_id := public.kit_lockup_dated_line(p_checklist_item_id, v_is_test, CASE WHEN v_kind = 'tested' THEN p_tested_date END, p_expiry_date);
    ELSE
      SELECT id INTO v_id FROM public.kit_lockup_stock
       WHERE checklist_item_id = p_checklist_item_id AND is_test = v_is_test AND expiry_date IS NULL FOR UPDATE;
    END IF;
  ELSE
    IF NULLIF(btrim(p_custom_name), '') IS NULL THEN RAISE EXCEPTION 'Type the name of the new item'; END IF;
    SELECT id INTO v_id FROM public.kit_lockup_stock
     WHERE checklist_item_id IS NULL AND section = p_section AND lower(btrim(custom_name)) = lower(btrim(p_custom_name))
       AND is_test = v_is_test FOR UPDATE;
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO public.kit_lockup_stock (section, checklist_item_id, custom_name, quantity, note, is_test)
    VALUES (v_section, p_checklist_item_id, CASE WHEN p_checklist_item_id IS NULL THEN btrim(p_custom_name) END,
            p_quantity, NULLIF(btrim(p_note), ''), v_is_test)
    RETURNING id, quantity INTO v_id, v_qty;
  ELSE
    UPDATE public.kit_lockup_stock
       SET quantity = quantity + p_quantity, note = COALESCE(NULLIF(btrim(p_note), ''), note)
     WHERE id = v_id
    RETURNING quantity INTO v_qty;
  END IF;
  PERFORM public.kit_lockup_log(v_id, 'added', p_quantity, v_qty, NULL, NULL, p_note, p_actor_id, v_is_test);
  RETURN v_id;
END;
$$;

-- the earlier call (no dates): same rules, so the 4 still need their dates
CREATE OR REPLACE FUNCTION public.kit_lockup_add(p_section text, p_checklist_item_id uuid, p_custom_name text, p_quantity integer,
  p_note text, p_is_test boolean, p_actor_id uuid)
RETURNS uuid LANGUAGE sql SET search_path = '' AS $$
  SELECT public.kit_lockup_add(p_section, p_checklist_item_id, p_custom_name, p_quantity, p_note, p_is_test, p_actor_id, NULL::date, NULL::date);
$$;

-- ---------------------------------------------------------------- the person's record gets the dates
CREATE OR REPLACE FUNCTION public.kit_hs_set_holder_dates(p_employee_id uuid, p_vehicle_id uuid, p_checklist_item_id uuid,
  p_kind text, p_tested_date date, p_expiry_date date, p_is_test boolean)
RETURNS uuid LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_ppe uuid;
  v_name text;
BEGIN
  SELECT name INTO v_name FROM public.audit_checklist_items WHERE id = p_checklist_item_id;
  IF p_employee_id IS NOT NULL THEN
    SELECT id INTO v_ppe FROM public.audit_ppe_items WHERE holder_employee_id = p_employee_id AND checklist_item_id = p_checklist_item_id FOR UPDATE;
  ELSE
    SELECT id INTO v_ppe FROM public.audit_ppe_items WHERE holder_employee_id IS NULL AND vehicle_id = p_vehicle_id AND checklist_item_id = p_checklist_item_id FOR UPDATE;
  END IF;
  IF v_ppe IS NULL THEN
    INSERT INTO public.audit_ppe_items (holder_employee_id, vehicle_id, checklist_item_id, item_name, expiry_date, source, is_test, updated_by)
    VALUES (p_employee_id, CASE WHEN p_employee_id IS NULL THEN p_vehicle_id END, p_checklist_item_id, v_name, p_expiry_date, 'update', p_is_test, (SELECT auth.uid()))
    RETURNING id INTO v_ppe;
  ELSE
    UPDATE public.audit_ppe_items SET expiry_date = p_expiry_date, source = 'update', updated_by = (SELECT auth.uid()), updated_at = now()
     WHERE id = v_ppe;
  END IF;
  -- fire extinguisher: the date tested is the holder's "service date" (pre-fills the next audit)
  IF p_kind = 'tested' THEN
    IF p_employee_id IS NOT NULL THEN
      INSERT INTO public.audit_holder_answers (holder_employee_id, checklist_item_id, service_date, is_test)
      VALUES (p_employee_id, p_checklist_item_id, p_tested_date, p_is_test)
      ON CONFLICT (holder_employee_id, checklist_item_id) WHERE holder_employee_id IS NOT NULL
      DO UPDATE SET service_date = EXCLUDED.service_date, updated_at = now();
    ELSIF p_vehicle_id IS NOT NULL THEN
      INSERT INTO public.audit_holder_answers (vehicle_id, checklist_item_id, service_date, is_test)
      VALUES (p_vehicle_id, p_checklist_item_id, p_tested_date, p_is_test)
      ON CONFLICT (vehicle_id, checklist_item_id) WHERE holder_employee_id IS NULL
      DO UPDATE SET service_date = EXCLUDED.service_date, updated_at = now();
    END IF;
  END IF;
  RETURN v_ppe;
END;
$$;

-- ---------------------------------------------------------------- Issue to: copies the line's dates
CREATE OR REPLACE FUNCTION public.kit_lockup_issue(p_stock_id uuid, p_employee_id uuid, p_quantity integer, p_date_on_hat date, p_note text, p_actor_id uuid)
RETURNS integer LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_line public.kit_lockup_stock%ROWTYPE;
  v_item public.audit_checklist_items%ROWTYPE;
  v_qty integer;
  v_expiry date;
  v_ppe uuid;
  v_old date;
  v_kind text;
BEGIN
  PERFORM public.kit_require_admin();
  IF p_actor_id IS NULL THEN RAISE EXCEPTION 'Pick who’s doing this'; END IF;
  IF p_employee_id IS NULL THEN RAISE EXCEPTION 'Pick who it is issued to'; END IF;
  IF p_quantity IS NULL OR p_quantity < 1 THEN RAISE EXCEPTION 'Enter how many (1 or more)'; END IF;
  SELECT * INTO v_line FROM public.kit_lockup_stock WHERE id = p_stock_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lockup line not found'; END IF;
  IF v_line.quantity < p_quantity THEN
    RAISE EXCEPTION 'Only % in the Yard Lockup, so % can’t be issued', v_line.quantity, p_quantity;
  END IF;
  UPDATE public.kit_lockup_stock SET quantity = quantity - p_quantity WHERE id = p_stock_id RETURNING quantity INTO v_qty;
  PERFORM public.kit_lockup_log(p_stock_id, 'issued', p_quantity, v_qty, p_employee_id, p_date_on_hat, p_note, p_actor_id, v_line.is_test);

  v_kind := public.kit_hs_date_kind(v_line.checklist_item_id);
  IF v_kind IS NOT NULL AND v_line.expiry_date IS NOT NULL THEN
    SELECT expiry_date INTO v_old FROM public.audit_ppe_items WHERE holder_employee_id = p_employee_id AND checklist_item_id = v_line.checklist_item_id;
    v_ppe := public.kit_hs_set_holder_dates(p_employee_id, NULL, v_line.checklist_item_id, v_kind,
                                            v_line.tested_date, v_line.expiry_date, v_line.is_test);
    PERFORM public.kit_log(NULL, v_ppe, 'replaced',
                           jsonb_build_object('expiry_date', v_old),
                           jsonb_build_object('expiry_date', v_line.expiry_date, 'tested_date', v_line.tested_date),
                           concat_ws(' · ', 'Issued from Yard Lockup',
                                     CASE WHEN v_kind = 'tested' AND v_line.tested_date IS NOT NULL THEN 'date tested ' || public.kit_day(v_line.tested_date) END,
                                     'expiry ' || public.kit_day(v_line.expiry_date)),
                           NULL, NULL, v_line.is_test, p_actor_id);
  ELSIF v_line.checklist_item_id IS NOT NULL AND p_date_on_hat IS NOT NULL THEN
    SELECT * INTO v_item FROM public.audit_checklist_items WHERE id = v_line.checklist_item_id;
    IF v_item.section = 'ppe' AND v_item.service_interval_months IS NOT NULL THEN
      v_expiry := (p_date_on_hat + make_interval(months => v_item.service_interval_months))::date;
      SELECT id, expiry_date INTO v_ppe, v_old FROM public.audit_ppe_items
       WHERE holder_employee_id = p_employee_id AND checklist_item_id = v_item.id FOR UPDATE;
      IF v_ppe IS NULL THEN
        INSERT INTO public.audit_ppe_items
          (holder_employee_id, checklist_item_id, item_name, expiry_date, source, is_test, updated_by)
        VALUES (p_employee_id, v_item.id, v_item.name, v_expiry, 'update', v_line.is_test, (SELECT auth.uid()))
        RETURNING id INTO v_ppe;
      ELSE
        UPDATE public.audit_ppe_items
           SET expiry_date = v_expiry, source = 'update', updated_by = (SELECT auth.uid()), updated_at = now()
         WHERE id = v_ppe;
      END IF;
      PERFORM public.kit_log(NULL, v_ppe, 'expiry_updated',
                             jsonb_build_object('expiry_date', v_old),
                             jsonb_build_object('expiry_date', v_expiry, 'date_on_hat', p_date_on_hat),
                             'Issued from Yard Lockup', NULL, NULL, v_line.is_test, p_actor_id);
    END IF;
  END IF;
  RETURN v_qty;
END;
$$;

-- ---------------------------------------------------------------- Return to lockup
-- How many of an item a person holds: all lines of the same audit-sheet item (or the one custom line).
CREATE OR REPLACE FUNCTION public.kit_lockup_held(p_stock_id uuid, p_employee_id uuid)
RETURNS integer LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT COALESCE(sum(CASE m.kind WHEN 'issued' THEN m.quantity WHEN 'returned' THEN -m.quantity END), 0)::integer
    FROM public.kit_lockup_movements m
    JOIN public.kit_lockup_stock s ON s.id = m.stock_id
    JOIN public.kit_lockup_stock me ON me.id = p_stock_id
   WHERE m.employee_id = p_employee_id AND s.is_test = me.is_test
     AND (s.id = me.id OR (me.checklist_item_id IS NOT NULL AND s.checklist_item_id = me.checklist_item_id));
$$;

CREATE OR REPLACE FUNCTION public.kit_lockup_return(p_stock_id uuid, p_employee_id uuid, p_quantity integer, p_note text, p_actor_id uuid)
RETURNS integer LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_is_test boolean;
  v_held integer;
  v_qty integer;
BEGIN
  PERFORM public.kit_require_admin();
  IF p_actor_id IS NULL THEN RAISE EXCEPTION 'Pick who’s doing this'; END IF;
  IF p_quantity IS NULL OR p_quantity < 1 THEN RAISE EXCEPTION 'Enter how many (1 or more)'; END IF;
  SELECT is_test INTO v_is_test FROM public.kit_lockup_stock WHERE id = p_stock_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lockup line not found'; END IF;
  v_held := public.kit_lockup_held(p_stock_id, p_employee_id);
  IF p_quantity > v_held THEN
    RAISE EXCEPTION 'They only hold % of these from the Yard Lockup', v_held;
  END IF;
  UPDATE public.kit_lockup_stock SET quantity = quantity + p_quantity WHERE id = p_stock_id RETURNING quantity INTO v_qty;
  PERFORM public.kit_lockup_log(p_stock_id, 'returned', p_quantity, v_qty, p_employee_id, NULL, p_note, p_actor_id, v_is_test);
  RETURN v_qty;
END;
$$;

-- Return a dated item with its dates: goes onto the line with that expiry (made if new).
CREATE OR REPLACE FUNCTION public.kit_lockup_return_dated(p_stock_id uuid, p_employee_id uuid, p_quantity integer,
  p_tested_date date, p_expiry_date date, p_note text, p_actor_id uuid)
RETURNS integer LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_line public.kit_lockup_stock%ROWTYPE;
  v_kind text;
  v_held integer;
  v_target uuid;
  v_qty integer;
BEGIN
  PERFORM public.kit_require_admin();
  IF p_actor_id IS NULL THEN RAISE EXCEPTION 'Pick who’s doing this'; END IF;
  IF p_quantity IS NULL OR p_quantity < 1 THEN RAISE EXCEPTION 'Enter how many (1 or more)'; END IF;
  SELECT * INTO v_line FROM public.kit_lockup_stock WHERE id = p_stock_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lockup line not found'; END IF;
  v_kind := public.kit_hs_check_dates(v_line.checklist_item_id, p_tested_date, p_expiry_date);
  IF v_kind IS NULL THEN RAISE EXCEPTION 'This item has no dates; use the plain return'; END IF;
  v_held := public.kit_lockup_held(p_stock_id, p_employee_id);
  IF p_quantity > v_held THEN
    RAISE EXCEPTION 'They only hold % of these from the Yard Lockup', v_held;
  END IF;
  v_target := public.kit_lockup_dated_line(v_line.checklist_item_id, v_line.is_test, CASE WHEN v_kind = 'tested' THEN p_tested_date END, p_expiry_date);
  UPDATE public.kit_lockup_stock SET quantity = quantity + p_quantity WHERE id = v_target RETURNING quantity INTO v_qty;
  PERFORM public.kit_lockup_log(v_target, 'returned', p_quantity, v_qty, p_employee_id, NULL, p_note, p_actor_id, v_line.is_test);
  RETURN v_qty;
END;
$$;

-- ---------------------------------------------------------------- Update sheet for the 4
CREATE OR REPLACE FUNCTION public.audit_update_hs(p_ppe_id uuid, p_action text, p_tested_date date, p_expiry_date date,
  p_certificate_path text, p_note text, p_actor_id uuid)
RETURNS void LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_row public.audit_ppe_items%ROWTYPE;
  v_kind text;
  v_old_tested date;
BEGIN
  PERFORM public.kit_require_admin();
  IF p_actor_id IS NULL THEN RAISE EXCEPTION 'Pick who’s doing this'; END IF;
  SELECT * INTO v_row FROM public.audit_ppe_items WHERE id = p_ppe_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Item not found'; END IF;
  v_kind := public.kit_hs_check_dates(v_row.checklist_item_id, p_tested_date, p_expiry_date);
  IF v_kind IS NULL THEN RAISE EXCEPTION 'Only the dated H&S items are updated here'; END IF;
  IF p_action NOT IN ('tested', 'replaced') OR (p_action = 'tested' AND v_kind <> 'tested') THEN
    RAISE EXCEPTION 'Only the fire extinguisher can be tested';
  END IF;
  SELECT service_date INTO v_old_tested FROM public.audit_holder_answers
   WHERE checklist_item_id = v_row.checklist_item_id
     AND ((v_row.holder_employee_id IS NOT NULL AND holder_employee_id = v_row.holder_employee_id)
       OR (v_row.holder_employee_id IS NULL AND holder_employee_id IS NULL AND vehicle_id = v_row.vehicle_id));
  PERFORM public.kit_hs_set_holder_dates(v_row.holder_employee_id, v_row.vehicle_id, v_row.checklist_item_id, v_kind,
                                         p_tested_date, p_expiry_date, v_row.is_test);
  PERFORM public.kit_log(NULL, p_ppe_id, p_action,
                         jsonb_build_object('expiry_date', v_row.expiry_date, 'tested_date', v_old_tested),
                         jsonb_build_object('expiry_date', p_expiry_date, 'tested_date', CASE WHEN v_kind = 'tested' THEN p_tested_date END),
                         concat_ws(' · ',
                                   CASE WHEN v_kind = 'tested' THEN 'Date tested ' || public.kit_day(p_tested_date) END,
                                   CASE WHEN v_kind = 'tested' THEN 'expiry ' ELSE 'New expiry ' END || public.kit_day(p_expiry_date),
                                   NULLIF(btrim(p_note), '')),
                         p_certificate_path, NULL, v_row.is_test, p_actor_id);
END;
$$;

-- "What's happened since" on audit records: a test clears a failed fire extinguisher like a re-service.
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
          OR ev.action IN ('reserviced', 'replaced', 'swapped_out', 'removed', 'tested')
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

-- admin-only, like the rest of this build's functions
REVOKE ALL ON FUNCTION public.kit_lockup_dated_line(uuid, boolean, date, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.kit_hs_set_holder_dates(uuid, uuid, uuid, text, date, date, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.kit_lockup_add(text, uuid, text, integer, text, boolean, uuid, date, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.kit_lockup_return_dated(uuid, uuid, integer, date, date, text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.audit_update_hs(uuid, text, date, date, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kit_lockup_add(text, uuid, text, integer, text, boolean, uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.kit_lockup_return_dated(uuid, uuid, integer, date, date, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.audit_update_hs(uuid, text, date, date, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.kit_lockup_dated_line(uuid, boolean, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.kit_hs_set_holder_dates(uuid, uuid, uuid, text, date, date, boolean) TO authenticated;
