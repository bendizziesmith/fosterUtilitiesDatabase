/** Drafts in progress on the Site Audits page (pure, unit-tested in draftLogic.test.ts). */

/** Only drafts, most recently saved first. */
export function draftsInProgress<T extends { status: string; updated_at?: string | null; created_at?: string | null }>(rows: T[]): T[] {
  const at = (r: T) => r.updated_at ?? r.created_at ?? '';
  return rows.filter((r) => r.status === 'draft').sort((a, b) => at(b).localeCompare(at(a)));
}

export const draftsBadgeText = (n: number): string | null => (n > 0 ? `${n} draft${n === 1 ? '' : 's'}` : null);

/** "Just now" · "25 min ago" · "Today 08:05" · "3 Nov". */
export function lastSavedText(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return '—';
  const t = new Date(iso);
  const mins = Math.floor((now.getTime() - t.getTime()) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  if (t.toDateString() === now.toDateString()) return `Today ${t.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
  return t.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
