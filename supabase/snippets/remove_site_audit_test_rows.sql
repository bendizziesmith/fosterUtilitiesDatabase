-- Removes every TEST row from the Site Audits + Kit & Plant tables (is_test = true).
-- Touches only the new audit_/kit_ tables. Nothing existing is affected.
-- NOT run automatically — Justin decides when. Run it in the Supabase SQL editor.
-- Test photos/certificates in the private "audit-photos" bucket are not removed by
-- this; delete them from Storage → audit-photos if wanted.

BEGIN;

-- test audits (their members and lines go with them)
DELETE FROM public.audit_site_audits WHERE is_test;

-- test kit (its history goes with it)
DELETE FROM public.kit_history WHERE is_test;
DELETE FROM public.kit_items WHERE is_test;

-- test PPE expiry rows, carry-over answers and van kit list entries
DELETE FROM public.audit_ppe_items WHERE is_test;
DELETE FROM public.audit_holder_answers WHERE is_test;
DELETE FROM public.kit_van_kit_list WHERE is_test;

-- test "photo deleted by …" records and remembered vans
DELETE FROM public.audit_file_deletions WHERE is_test;
DELETE FROM public.kit_person_vans WHERE is_test;

-- van off the road records, audit deletion log (edits go with their audits)
DELETE FROM public.kit_van_status WHERE is_test;
DELETE FROM public.audit_deletions WHERE is_test;

-- Yard Lockup: test movements, then test stock lines
DELETE FROM public.kit_lockup_movements WHERE is_test;
DELETE FROM public.kit_lockup_stock WHERE is_test;

-- check: every count should be 0
SELECT
  (SELECT count(*) FROM public.audit_site_audits WHERE is_test) AS test_audits,
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
  (SELECT count(*) FROM public.audit_deletions WHERE is_test)   AS test_audit_deletions;

COMMIT;
