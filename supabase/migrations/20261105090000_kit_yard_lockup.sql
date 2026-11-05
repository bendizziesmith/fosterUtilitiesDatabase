/*
  # Yard Lockup (NEW objects only, no DROP)

  - kit_lockup_stock: counted lockup lines (PPE / health & safety / other),
    each an audit-sheet item (checklist_item_id) or a custom name. Quantity can
    never go below 0.
  - kit_lockup_movements: every change: added / adjusted / issued / returned,
    with the person, "Who's doing this?" name and when. This is the lockup's history.
  - kit_lockup_add / kit_lockup_adjust / kit_lockup_issue / kit_lockup_return:
    all-or-nothing, admin only. Issuing a dated PPE item (hard hats) with a
    "Date on hat" sets that person's PPE expiry (audit_ppe_items) and logs it in
    kit_history, so the reminder clears.
  - Views: kit_lockup_overview (names + audit-sheet order),
    kit_lockup_person_issues (what each person still holds from the lockup).
  Plant kit in the lockup stays kit_items with status 'spare' (shown as "Yard Lockup").
  Existing tables (employees, ...) are only read.
*/

CREATE TABLE public.kit_lockup_stock (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section text NOT NULL CHECK (section IN ('ppe', 'hs', 'other')),
  checklist_item_id uuid REFERENCES public.audit_checklist_items(id) ON DELETE SET NULL,
  custom_name text,
  quantity integer NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  note text,
  is_test boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (checklist_item_id IS NOT NULL OR NULLIF(btrim(custom_name), '') IS NOT NULL)
);
-- one line per audit-sheet item (test and real kept apart until test rows are cleared)
CREATE UNIQUE INDEX kit_lockup_stock_item_uidx ON public.kit_lockup_stock (checklist_item_id, is_test) WHERE checklist_item_id IS NOT NULL;
CREATE UNIQUE INDEX kit_lockup_stock_custom_uidx ON public.kit_lockup_stock (section, lower(btrim(custom_name)), is_test) WHERE checklist_item_id IS NULL;

CREATE TABLE public.kit_lockup_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_id uuid NOT NULL REFERENCES public.kit_lockup_stock(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('added', 'adjusted', 'issued', 'returned')),
  quantity integer NOT NULL CHECK (quantity <> 0),
  qty_after integer NOT NULL CHECK (qty_after >= 0),
  employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  person_name text,
  date_on_hat date,
  note text,
  actor_id uuid REFERENCES public.audit_auditors(id) ON DELETE SET NULL,
  actor_name text,
  by_user uuid DEFAULT auth.uid() REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  is_test boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX kit_lockup_movements_stock_idx ON public.kit_lockup_movements (stock_id, created_at DESC);
CREATE INDEX kit_lockup_movements_employee_idx ON public.kit_lockup_movements (employee_id, created_at DESC);
CREATE INDEX kit_lockup_movements_actor_idx ON public.kit_lockup_movements (actor_id);
CREATE INDEX kit_lockup_movements_by_idx ON public.kit_lockup_movements (by_user);

ALTER TABLE public.kit_lockup_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kit_lockup_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage lockup stock" ON public.kit_lockup_stock
  FOR ALL TO authenticated USING ((SELECT public.audit_is_admin())) WITH CHECK ((SELECT public.audit_is_admin()));
CREATE POLICY "Admins manage lockup movements" ON public.kit_lockup_movements
  FOR ALL TO authenticated USING ((SELECT public.audit_is_admin())) WITH CHECK ((SELECT public.audit_is_admin()));
REVOKE ALL ON public.kit_lockup_stock, public.kit_lockup_movements FROM anon;

CREATE TRIGGER kit_lockup_stock_touch
  BEFORE UPDATE ON public.kit_lockup_stock
  FOR EACH ROW EXECUTE FUNCTION public.audit_touch_updated_at();

-- ---------------------------------------------------------------- functions
CREATE FUNCTION public.kit_lockup_log(
  p_stock_id uuid, p_kind text, p_quantity integer, p_qty_after integer, p_employee_id uuid,
  p_date_on_hat date, p_note text, p_actor_id uuid, p_is_test boolean)
RETURNS void
LANGUAGE sql
SET search_path = ''
AS $$
  INSERT INTO public.kit_lockup_movements
    (stock_id, kind, quantity, qty_after, employee_id, person_name, date_on_hat, note, actor_id, actor_name, is_test)
  VALUES
    (p_stock_id, p_kind, p_quantity, p_qty_after, p_employee_id,
     (SELECT full_name FROM public.employees WHERE id = p_employee_id),
     p_date_on_hat, NULLIF(btrim(p_note), ''), p_actor_id, public.kit_actor_name(p_actor_id), COALESCE(p_is_test, false));
$$;

/* Add to the lockup: an audit-sheet item (adds to its line) or a custom item. Returns the line id. */
CREATE FUNCTION public.kit_lockup_add(
  p_section text, p_checklist_item_id uuid, p_custom_name text, p_quantity integer,
  p_note text, p_is_test boolean, p_actor_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
  v_qty integer;
  v_section text := p_section;
BEGIN
  PERFORM public.kit_require_admin();
  IF p_actor_id IS NULL THEN RAISE EXCEPTION 'Pick who’s doing this'; END IF;
  IF p_quantity IS NULL OR p_quantity < 1 THEN RAISE EXCEPTION 'Enter how many (1 or more)'; END IF;
  IF p_checklist_item_id IS NOT NULL THEN
    SELECT section INTO v_section FROM public.audit_checklist_items WHERE id = p_checklist_item_id;
    IF v_section IS NULL THEN RAISE EXCEPTION 'That audit sheet item was not found'; END IF;
    SELECT id INTO v_id FROM public.kit_lockup_stock
     WHERE checklist_item_id = p_checklist_item_id AND is_test = COALESCE(p_is_test, false) FOR UPDATE;
  ELSE
    IF NULLIF(btrim(p_custom_name), '') IS NULL THEN RAISE EXCEPTION 'Type the name of the new item'; END IF;
    SELECT id INTO v_id FROM public.kit_lockup_stock
     WHERE checklist_item_id IS NULL AND section = p_section AND lower(btrim(custom_name)) = lower(btrim(p_custom_name))
       AND is_test = COALESCE(p_is_test, false) FOR UPDATE;
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO public.kit_lockup_stock (section, checklist_item_id, custom_name, quantity, note, is_test)
    VALUES (v_section, p_checklist_item_id, CASE WHEN p_checklist_item_id IS NULL THEN btrim(p_custom_name) END,
            p_quantity, NULLIF(btrim(p_note), ''), COALESCE(p_is_test, false))
    RETURNING id, quantity INTO v_id, v_qty;
  ELSE
    UPDATE public.kit_lockup_stock
       SET quantity = quantity + p_quantity, note = COALESCE(NULLIF(btrim(p_note), ''), note)
     WHERE id = v_id
    RETURNING quantity INTO v_qty;
  END IF;
  PERFORM public.kit_lockup_log(v_id, 'added', p_quantity, v_qty, NULL, NULL, p_note, p_actor_id, p_is_test);
  RETURN v_id;
END;
$$;

/* Quick count: + / − on a line. Never below 0. */
CREATE FUNCTION public.kit_lockup_adjust(p_stock_id uuid, p_delta integer, p_note text, p_actor_id uuid)
RETURNS integer
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_qty integer;
  v_is_test boolean;
BEGIN
  PERFORM public.kit_require_admin();
  IF p_actor_id IS NULL THEN RAISE EXCEPTION 'Pick who’s doing this'; END IF;
  IF p_delta IS NULL OR p_delta = 0 THEN RAISE EXCEPTION 'Nothing to change'; END IF;
  SELECT quantity, is_test INTO v_qty, v_is_test FROM public.kit_lockup_stock WHERE id = p_stock_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lockup line not found'; END IF;
  IF v_qty + p_delta < 0 THEN
    RAISE EXCEPTION 'Only % in the Yard Lockup, so % can’t be taken out', v_qty, -p_delta;
  END IF;
  UPDATE public.kit_lockup_stock SET quantity = quantity + p_delta WHERE id = p_stock_id RETURNING quantity INTO v_qty;
  PERFORM public.kit_lockup_log(p_stock_id, 'adjusted', p_delta, v_qty, NULL, NULL, p_note, p_actor_id, v_is_test);
  RETURN v_qty;
END;
$$;

/* Issue to a person. Dated PPE (e.g. hard hats) with a date on hat updates their PPE expiry. */
CREATE FUNCTION public.kit_lockup_issue(
  p_stock_id uuid, p_employee_id uuid, p_quantity integer, p_date_on_hat date, p_note text, p_actor_id uuid)
RETURNS integer
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_line public.kit_lockup_stock%ROWTYPE;
  v_item public.audit_checklist_items%ROWTYPE;
  v_qty integer;
  v_expiry date;
  v_ppe uuid;
  v_old date;
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

  -- dated PPE: the person's expiry = date on hat + the item's interval
  IF v_line.checklist_item_id IS NOT NULL AND p_date_on_hat IS NOT NULL THEN
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

/* Return to the lockup: only up to what that person still holds from it. */
CREATE FUNCTION public.kit_lockup_return(
  p_stock_id uuid, p_employee_id uuid, p_quantity integer, p_note text, p_actor_id uuid)
RETURNS integer
LANGUAGE plpgsql
SET search_path = ''
AS $$
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
  SELECT COALESCE(sum(CASE kind WHEN 'issued' THEN quantity WHEN 'returned' THEN -quantity END), 0) INTO v_held
    FROM public.kit_lockup_movements WHERE stock_id = p_stock_id AND employee_id = p_employee_id;
  IF p_quantity > v_held THEN
    RAISE EXCEPTION 'They only hold % of these from the Yard Lockup', v_held;
  END IF;
  UPDATE public.kit_lockup_stock SET quantity = quantity + p_quantity WHERE id = p_stock_id RETURNING quantity INTO v_qty;
  PERFORM public.kit_lockup_log(p_stock_id, 'returned', p_quantity, v_qty, p_employee_id, NULL, p_note, p_actor_id, v_is_test);
  RETURN v_qty;
END;
$$;

-- ---------------------------------------------------------------- views
CREATE VIEW public.kit_lockup_overview
WITH (security_invoker = true) AS
SELECT
  s.id, s.section, s.checklist_item_id,
  COALESCE(c.name, s.custom_name) AS name,
  c.expected_qty, c.service_interval_months, c.date_label,
  s.quantity, s.note, s.is_test, s.created_at, s.updated_at,
  COALESCE(c.sort_order, 1000) AS sheet_order
FROM public.kit_lockup_stock s
LEFT JOIN public.audit_checklist_items c ON c.id = s.checklist_item_id;

CREATE VIEW public.kit_lockup_person_issues
WITH (security_invoker = true) AS
SELECT
  m.employee_id, m.stock_id, o.section, o.checklist_item_id, o.name AS item_name,
  sum(CASE m.kind WHEN 'issued' THEN m.quantity WHEN 'returned' THEN -m.quantity END)::integer AS quantity_held,
  max(m.created_at) FILTER (WHERE m.kind = 'issued') AS last_issued_at,
  bool_or(m.is_test) AS is_test
FROM public.kit_lockup_movements m
JOIN public.kit_lockup_overview o ON o.id = m.stock_id
WHERE m.kind IN ('issued', 'returned') AND m.employee_id IS NOT NULL
GROUP BY m.employee_id, m.stock_id, o.section, o.checklist_item_id, o.name;

REVOKE ALL ON public.kit_lockup_overview, public.kit_lockup_person_issues FROM anon;

REVOKE EXECUTE ON FUNCTION
  public.kit_lockup_log(uuid, text, integer, integer, uuid, date, text, uuid, boolean),
  public.kit_lockup_add(text, uuid, text, integer, text, boolean, uuid),
  public.kit_lockup_adjust(uuid, integer, text, uuid),
  public.kit_lockup_issue(uuid, uuid, integer, date, text, uuid),
  public.kit_lockup_return(uuid, uuid, integer, text, uuid)
FROM anon, public;
GRANT EXECUTE ON FUNCTION
  public.kit_lockup_log(uuid, text, integer, integer, uuid, date, text, uuid, boolean),
  public.kit_lockup_add(text, uuid, text, integer, text, boolean, uuid),
  public.kit_lockup_adjust(uuid, integer, text, uuid),
  public.kit_lockup_issue(uuid, uuid, integer, date, text, uuid),
  public.kit_lockup_return(uuid, uuid, integer, text, uuid)
TO authenticated;
