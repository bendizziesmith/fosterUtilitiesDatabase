/** Dashboard badges and page tiles (round 11: each on the right page). Pure, tested in dashboardLogic.test.ts. */

export type Tone = 'red' | 'amber' | 'blue' | 'slate';
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Site Audits card: audits due and drafts. Kit & Plant card: expired, due soon, low stock. Only counts above 0. */
export function dashboardBadges(c: { expired: number; dueSoon: number; lowStock: number; auditsDue: number; drafts: number; onVans?: number; spares?: number }) {
  const audits: { text: string; tone: Tone }[] = [];
  if (c.auditsDue > 0) audits.push({ text: plural(c.auditsDue, 'audit due', 'audits due'), tone: 'blue' });
  if (c.drafts > 0) audits.push({ text: plural(c.drafts, 'draft', 'drafts'), tone: 'slate' });
  const kit: { text: string; tone: Tone }[] = [];
  if (c.expired > 0) kit.push({ text: `${c.expired} expired`, tone: 'red' });
  if (c.dueSoon > 0) kit.push({ text: `${c.dueSoon} due soon`, tone: 'amber' });
  if (c.lowStock > 0) kit.push({ text: `${c.lowStock} low stock`, tone: 'amber' });
  return { audits, kit };
}

export interface Tile { key: string; label: string; value: string; tone?: Tone }

/** Site Audits page tiles. */
export function siteAuditTiles(schedule: { status: string }[], intervalMonths: number): Tile[] {
  const audited = schedule.filter((r) => r.status === 'ok' || r.status === 'due_soon').length;
  return [
    { key: 'audited', label: `Audited in the last ${intervalMonths} months`, value: `${audited} of ${schedule.length}` },
    { key: 'needs', label: 'Needs auditing', value: String(schedule.filter((r) => r.status !== 'ok').length) },
  ];
}

/** Kit & Plant page tiles; expired / due soon match Needs attention (kit, PPE and H&S). */
export function kitPageTiles(kit: { status: string }[], attention: { expiry_status: string }[], lowStock: number): Tile[] {
  return [
    { key: 'away', label: 'Away for service', value: String(kit.filter((k) => k.status === 'away_for_service').length) },
    { key: 'expired', label: 'Expired', value: String(attention.filter((a) => a.expiry_status === 'expired').length), tone: 'red' },
    { key: 'due', label: 'Due within 30 days', value: String(attention.filter((a) => a.expiry_status === 'due_soon').length), tone: 'amber' },
    { key: 'low', label: 'Low stock', value: String(lowStock), tone: 'amber' },
  ];
}
