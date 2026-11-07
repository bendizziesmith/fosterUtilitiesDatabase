/*
  # Round 3 (part A) — auditors and "who did it" names (this build's objects only)
  - audit_auditors: Christina Pearson, Sam Longcroft, Neil Foster (real rows, not test).
  - audit_site_audits + auditor_id, auditor_name, holder_employee_id (the person audited).
  - kit_history + actor_id, actor_name; audit_file_deletions + actor_id, actor_name.
  Links to employees are ON DELETE SET NULL. Existing tables are only referenced.
*/

-- =============================================================== 1. auditors
CREATE TABLE public.audit_auditors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.audit_auditors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage auditors" ON public.audit_auditors
  FOR ALL TO authenticated USING ((SELECT public.audit_is_admin())) WITH CHECK ((SELECT public.audit_is_admin()));
REVOKE ALL ON public.audit_auditors FROM anon;
INSERT INTO public.audit_auditors (name, sort_order) VALUES
  ('Christina Pearson', 10), ('Sam Longcroft', 20), ('Neil Foster', 30);

ALTER TABLE public.audit_site_audits
  ADD COLUMN auditor_id uuid REFERENCES public.audit_auditors(id) ON DELETE SET NULL,
  ADD COLUMN auditor_name text,
  ADD COLUMN holder_employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL;
CREATE INDEX audit_site_audits_auditor_idx ON public.audit_site_audits (auditor_id);
CREATE INDEX audit_site_audits_holder_idx ON public.audit_site_audits (holder_employee_id);

ALTER TABLE public.kit_history
  ADD COLUMN actor_id uuid REFERENCES public.audit_auditors(id) ON DELETE SET NULL,
  ADD COLUMN actor_name text;
CREATE INDEX kit_history_actor_idx ON public.kit_history (actor_id);

ALTER TABLE public.audit_file_deletions
  ADD COLUMN actor_id uuid REFERENCES public.audit_auditors(id) ON DELETE SET NULL,
  ADD COLUMN actor_name text;
CREATE INDEX audit_file_deletions_actor_idx ON public.audit_file_deletions (actor_id);
