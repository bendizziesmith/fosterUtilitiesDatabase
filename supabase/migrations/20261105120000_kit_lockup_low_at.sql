/*
  # Yard Lockup — low-stock level (this build's objects only, no DROP)

  - kit_lockup_stock.low_at: optional "Low at" number per stock line. At or
    below it the line is low stock; blank = no warning.
  - kit_lockup_overview: same columns as before, with low_at added at the end
    (CREATE OR REPLACE only appends; nothing is dropped).
*/

ALTER TABLE public.kit_lockup_stock
  ADD COLUMN low_at integer CHECK (low_at IS NULL OR low_at >= 0);

CREATE OR REPLACE VIEW public.kit_lockup_overview
WITH (security_invoker = true) AS
SELECT
  s.id, s.section, s.checklist_item_id,
  COALESCE(c.name, s.custom_name) AS name,
  c.expected_qty, c.service_interval_months, c.date_label,
  s.quantity, s.note, s.is_test, s.created_at, s.updated_at,
  COALESCE(c.sort_order, 1000) AS sheet_order,
  s.low_at
FROM public.kit_lockup_stock s
LEFT JOIN public.audit_checklist_items c ON c.id = s.checklist_item_id;
