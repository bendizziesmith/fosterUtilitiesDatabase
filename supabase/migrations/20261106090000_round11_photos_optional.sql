-- Round 11: photos are optional. Submit always goes through, with any number of photos.
-- (The photo slots stay as data; the app now calls them "suggested".)
-- Touches only this build's audit_ objects. No DROP, no DELETE.
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
