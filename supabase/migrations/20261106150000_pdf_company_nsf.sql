-- PDF branding: the company name printed on this build's PDFs is "NSF Utilities Limited".
-- This build's own audit_settings only. No DROP, no DELETE.
ALTER TABLE public.audit_settings ALTER COLUMN company_name SET DEFAULT 'NSF Utilities Limited';
UPDATE public.audit_settings SET company_name = 'NSF Utilities Limited', updated_at = now(), updated_by_name = 'PDF branding';
