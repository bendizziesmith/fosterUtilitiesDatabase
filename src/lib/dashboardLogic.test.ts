import { describe, it, expect } from 'vitest';
import { dashboardBadges, siteAuditTiles, kitPageTiles } from './dashboardLogic';

describe('dashboardBadges — each card shows only its own counts (round 11)', () => {
  const c = { expired: 2, dueSoon: 3, lowStock: 1, auditsDue: 4, drafts: 1, onVans: 9, spares: 5 };
  it('Site Audits: audits due and drafts only', () => {
    expect(dashboardBadges(c).audits).toEqual([{ text: '4 audits due', tone: 'blue' }, { text: '1 draft', tone: 'slate' }]);
  });
  it('Kit & Plant: expired, due soon, low stock; never on vans / spares', () => {
    expect(dashboardBadges(c).kit).toEqual([{ text: '2 expired', tone: 'red' }, { text: '3 due soon', tone: 'amber' }, { text: '1 low stock', tone: 'amber' }]);
  });
  it('only counts above 0; "1 audit due"', () => {
    const z = dashboardBadges({ expired: 0, dueSoon: 0, lowStock: 0, auditsDue: 1, drafts: 0, onVans: 0, spares: 0 });
    expect(z.audits).toEqual([{ text: '1 audit due', tone: 'blue' }]);
    expect(z.kit).toEqual([]);
  });
});

describe('page tiles (round 11: on the right page)', () => {
  it('Site Audits: audited in the last N months, needs auditing', () => {
    const schedule = [{ status: 'ok' }, { status: 'due_soon' }, { status: 'overdue' }, { status: 'never' }] as never[];
    expect(siteAuditTiles(schedule, 3)).toEqual([
      { key: 'audited', label: 'Audited in the last 3 months', value: '2 of 4' },
      { key: 'needs', label: 'Needs auditing', value: '3' }, // overdue, never, and due within 30 days (same as the dashboard)
    ]);
  });
  it('Kit & Plant: away for service, expired, due within 30 days, low stock (kit, PPE and H&S)', () => {
    const kit = [{ status: 'away_for_service' }, { status: 'on_van' }, { status: 'removed' }, { status: 'away_for_service' }] as never[];
    const attention = [{ expiry_status: 'expired' }, { expiry_status: 'expired' }, { expiry_status: 'due_soon' }, { expiry_status: 'no_home' }] as never[];
    expect(kitPageTiles(kit, attention, 3)).toEqual([
      { key: 'away', label: 'Away for service', value: '2' },
      { key: 'expired', label: 'Expired', value: '2', tone: 'red' },
      { key: 'due', label: 'Due within 30 days', value: '1', tone: 'amber' },
      { key: 'low', label: 'Low stock', value: '3', tone: 'amber' },
    ]);
  });
});
