import { supabase } from './supabase';

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

/** "Discard draft": deletes a draft audit (its lines and members go with it), then its photos. Never a submitted audit. */
export async function discardDraft(auditId: string): Promise<void> {
  const lines = (check(await supabase.from('audit_lines').select('photo_path').eq('audit_id', auditId)) as { photo_path: string | null }[]) ?? [];
  check(await supabase.from('audit_site_audits').delete().eq('id', auditId).eq('status', 'draft'));
  const paths = lines.map((l) => l.photo_path).filter((p): p is string => !!p);
  if (paths.length) check(await supabase.storage.from('audit-photos').remove(paths));
}
