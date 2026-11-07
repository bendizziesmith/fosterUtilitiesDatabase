-- Removes every TEST row from the Site Audits + Kit & Plant tables (is_test = true), the test kit
-- type "Water Pmup", and sets the audit interval to 6 months (go-live, 7 Nov 2026).
-- Touches only this build's audit_/kit_ tables. Nothing existing is affected.
-- Real settings are kept: audit_auditors, audit_photo_slots, audit_checklist_items, kit_types
-- (CAT, Genny, Digger, Trailer, STIHL saw, Floor saw, Breaker, Pecker), audit_settings.
-- Test photos/certificates in the private "audit-photos" bucket are not removed by
-- this; delete them from Storage → audit-photos.

BEGIN;

-- test audits: their photo rows, download ticks and edit log first, then the audits
-- (members and lines go with their audits)
DELETE FROM public.audit_photos WHERE is_test;
DELETE FROM public.audit_downloads WHERE is_test;
DELETE FROM public.audit_edits WHERE is_test;
DELETE FROM public.audit_site_audits WHERE is_test;

-- test kit (its history goes with it)
DELETE FROM public.kit_history WHERE is_test;
DELETE FROM public.kit_items WHERE is_test;

-- test PPE / H&S expiry rows, carry-over answers and van kit list entries
DELETE FROM public.audit_ppe_items WHERE is_test;
DELETE FROM public.audit_holder_answers WHERE is_test;
DELETE FROM public.kit_van_kit_list WHERE is_test;

-- test "photo deleted by …" records and remembered vans
DELETE FROM public.audit_file_deletions WHERE is_test;
DELETE FROM public.kit_person_vans WHERE is_test;

-- van off the road records, audit deletion log
DELETE FROM public.kit_van_status WHERE is_test;
DELETE FROM public.audit_deletions WHERE is_test;

-- Yard Lockup: test movements, then test stock lines (incl. round 15 dated lines)
DELETE FROM public.kit_lockup_movements WHERE is_test;
DELETE FROM public.kit_lockup_stock WHERE is_test;

-- test kit type "Water Pmup": only if nothing uses it any more
DELETE FROM public.kit_types t
 WHERE t.name = 'Water Pmup'
   AND NOT EXISTS (SELECT 1 FROM public.kit_items k WHERE k.kit_type_id = t.id)
   AND NOT EXISTS (SELECT 1 FROM public.kit_van_kit_list v WHERE v.kit_type_id = t.id)
   AND NOT EXISTS (SELECT 1 FROM public.audit_lines l WHERE l.kit_type_id = t.id);

-- audit every 6 months (Justin, 7 Nov 2026)
UPDATE public.audit_settings SET audit_interval_months = 6, updated_at = now(), updated_by_name = 'Go-live';

-- check: every count should be 0, interval 6, 8 kit types
SELECT
  (SELECT count(*) FROM public.audit_site_audits WHERE is_test) AS test_audits,
  (SELECT count(*) FROM public.audit_photos WHERE is_test)      AS test_photos,
  (SELECT count(*) FROM public.audit_downloads WHERE is_test)   AS test_downloads,
  (SELECT count(*) FROM public.audit_edits WHERE is_test)       AS test_edits,
  (SELECT count(*) FROM public.kit_items WHERE is_test)         AS test_kit,
  (SELECT count(*) FROM public.kit_history WHERE is_test)       AS test_history,
  (SELECT count(*) FROM public.audit_ppe_items WHERE is_test)   AS test_ppe,
  (SELECT count(*) FROM public.audit_holder_answers WHERE is_test) AS test_holder_answers,
  (SELECT count(*) FROM public.kit_van_kit_list WHERE is_test)  AS test_van_lists,
  (SELECT count(*) FROM public.audit_file_deletions WHERE is_test) AS test_file_deletions,
  (SELECT count(*) FROM public.kit_person_vans WHERE is_test)   AS test_person_vans,
  (SELECT count(*) FROM public.kit_lockup_movements WHERE is_test) AS test_lockup_moves,
  (SELECT count(*) FROM public.kit_lockup_stock WHERE is_test)  AS test_lockup_lines,
  (SELECT count(*) FROM public.kit_van_status WHERE is_test)    AS test_van_status,
  (SELECT count(*) FROM public.audit_deletions WHERE is_test)   AS test_audit_deletions,
  (SELECT count(*) FROM public.kit_types)                       AS kit_types,
  (SELECT audit_interval_months FROM public.audit_settings)     AS audit_interval_months;

COMMIT;
