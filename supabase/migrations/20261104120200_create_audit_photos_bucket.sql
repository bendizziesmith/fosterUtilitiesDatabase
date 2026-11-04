/*
  # Site Audits — photo / certificate bucket (ADD ONLY)

  One new PRIVATE bucket, audit-photos, for optional photos on failed audit
  items and optional certificates on kit/PPE updates. Images and PDFs only,
  10 MB max. Only admins can upload or view; files are shown with short-lived
  signed links. The new policies apply to this bucket only — existing buckets
  and their policies are untouched.
*/

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('audit-photos', 'audit-photos', false, 10485760,
        ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf']);

CREATE POLICY "audit-photos admins read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'audit-photos' AND (SELECT public.audit_is_admin()));

CREATE POLICY "audit-photos admins upload"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'audit-photos' AND (SELECT public.audit_is_admin()));
