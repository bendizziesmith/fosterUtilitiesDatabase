-- Round 14: a record of every audit PDF download (single "Download PDF" or inside "Download all").
-- Its own table, so submitted audits (locked) are never changed. Deleted with the audit.
-- This build's audit_ objects only. No DROP, no DELETE.
CREATE TABLE public.audit_downloads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id uuid NOT NULL REFERENCES public.audit_site_audits(id) ON DELETE CASCADE,
  downloaded_at timestamptz NOT NULL DEFAULT now(),
  actor_id uuid REFERENCES public.audit_auditors(id) ON DELETE SET NULL,
  actor_name text,
  kind text NOT NULL DEFAULT 'single' CHECK (kind IN ('single', 'zip')),
  is_test boolean NOT NULL DEFAULT false
);
COMMENT ON TABLE public.audit_downloads IS 'Each time an audit PDF was downloaded, and by whom';
CREATE INDEX audit_downloads_audit_idx ON public.audit_downloads (audit_id, downloaded_at DESC);
CREATE INDEX audit_downloads_actor_idx ON public.audit_downloads (actor_id);
ALTER TABLE public.audit_downloads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage audit downloads" ON public.audit_downloads
  FOR ALL TO authenticated USING ((SELECT public.audit_is_admin())) WITH CHECK ((SELECT public.audit_is_admin()));
REVOKE ALL ON public.audit_downloads FROM anon;
