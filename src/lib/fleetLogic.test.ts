import { describe, it, expect } from 'vitest';
import {
  dateAlerts,
  auditSchedule,
  formatDue,
  kitTiles,
  planOffRoad,
  diffAuditLines,
  type ScheduleAudit,
} from './fleetLogic';
import { buildAuditTargets, auditTargetsOf } from './siteAuditLogic';

const TODAY = '2026-11-05';
const employees = [
  { id: 'e1', full_name: 'Dom Oliver', role: 'Ganger', assigned_vehicle_id: 'v1' },
  { id: 'e2', full_name: 'Phil Hall', role: 'Ganger', assigned_vehicle_id: null },
  { id: 'e3', full_name: 'Kevin Noble', role: 'Backup Driver', assigned_vehicle_id: 'v3' },
];
const vehicles = [
  { id: 'v1', registration_number: 'YE24 TNL' },
  { id: 'v2', registration_number: 'WV72 OZL' },
  { id: 'v3', registration_number: 'BV23 ZHK' },
  { id: 'v4', registration_number: 'OW72 SKV' },
];
const a = (over: Partial<ScheduleAudit>): ScheduleAudit => ({
  id: Math.random().toString(), status: 'submitted', audit_date: '2026-06-01', holder_employee_id: null, ganger_id: null, vehicle_id: null, ...over,
});

describe('auditSchedule — every gang and spare van audited every 6 months', () => {
  const targets = auditTargetsOf(buildAuditTargets(employees, vehicles));
  const audits = [
    a({ holder_employee_id: 'e1', audit_date: '2026-04-01' }), // due 1 Oct → 5 weeks overdue
    a({ holder_employee_id: 'e1', audit_date: '2025-10-01' }), // older one, ignored
    a({ holder_employee_id: 'e3', audit_date: '2026-05-20' }), // due 20 Nov → due soon
    a({ vehicle_id: 'v2', audit_date: '2026-09-01' }),         // due 1 Mar → ok
    a({ vehicle_id: 'v4', audit_date: '2026-11-01', status: 'draft' }), // drafts don't count
  ];
  const rows = auditSchedule(targets, audits, 6, TODAY);
  const byKey = (k: string) => rows.find((r) => r.key === k)!;

  it('next audit due = last submitted audit + 6 months', () => {
    expect(byKey('person:e1')).toMatchObject({ lastAudit: '2026-04-01', due: '2026-10-01', status: 'overdue', daysLeft: -35 });
    expect(byKey('person:e3')).toMatchObject({ due: '2026-11-20', status: 'due_soon', daysLeft: 15 });
    expect(byKey('van:v2')).toMatchObject({ due: '2027-03-01', status: 'ok' });
  });
  it('never audited = "Due now"', () => {
    expect(byKey('van:v4')).toMatchObject({ lastAudit: null, due: null, status: 'never' });
    expect(formatDue(byKey('van:v4'))).toBe('Due now');
  });
  it('orders never audited (by name) and overdue first, then due within 30 days, then the rest by date', () => {
    // Phil Hall is a ganger with no van: his gang still needs auditing
    expect(rows.map((r) => r.key)).toEqual(['van:v4', 'person:e2', 'person:e1', 'person:e3', 'van:v2']);
  });
  it('follows the interval setting', () => {
    expect(auditSchedule(targets, audits, 12, TODAY).find((r) => r.key === 'person:e1')).toMatchObject({ due: '2027-04-01', status: 'ok' });
  });
  it('a deleted audit drops out, so the schedule falls back to the previous one', () => {
    const without = audits.filter((x) => x.audit_date !== '2026-04-01');
    expect(auditSchedule(targets, without, 6, TODAY).find((r) => r.key === 'person:e1')).toMatchObject({ lastAudit: '2025-10-01', due: '2026-04-01', status: 'overdue' });
  });
  it('a ganger’s old audits (before round 3) count through ganger_id', () => {
    const r = auditSchedule(targets, [a({ ganger_id: 'e1', audit_date: '2026-09-01' })], 6, TODAY);
    expect(r.find((x) => x.key === 'person:e1')?.lastAudit).toBe('2026-09-01');
  });
});

describe('formatDue', () => {
  it.each([
    [{ status: 'overdue', daysLeft: -21 }, '3 weeks overdue'],
    [{ status: 'overdue', daysLeft: -5 }, '5 days overdue'],
    [{ status: 'overdue', daysLeft: -1 }, '1 day overdue'],
    [{ status: 'due_soon', daysLeft: 0 }, 'Due today'],
    [{ status: 'due_soon', daysLeft: 12 }, 'Due in 12 days'],
    [{ status: 'ok', daysLeft: 100 }, 'Due in 14 weeks'],
  ])('%o → %s', (r, text) => {
    expect(formatDue(r as never)).toBe(text);
  });
});

describe('kitTiles — Kit & Plant summary tiles', () => {
  it('counts audited (last 6 months), needs auditing, away, expired, due soon', () => {
    const targets = auditTargetsOf(buildAuditTargets(employees, vehicles));
    const schedule = auditSchedule(targets, [
      a({ holder_employee_id: 'e1', audit_date: '2026-09-01' }), // audited, ok
      a({ holder_employee_id: 'e3', audit_date: '2026-05-20' }), // audited in last 6 months, due soon
    ], 6, TODAY);
    const t = kitTiles(schedule, [
      { status: 'away_for_service', expiry_status: 'expired' },
      { status: 'on_van', expiry_status: 'expired' },
      { status: 'spare', expiry_status: 'due_soon' },
      { status: 'on_van', expiry_status: 'ok' },
    ]);
    // 5 to audit: Dom (ok), Kevin (due soon), Phil, WV72 OZL, OW72 SKV (never)
    expect(t).toEqual({ audited: 2, auditTargets: 5, needsAuditing: 4, away: 1, expired: 1, dueSoon: 1 });
  });
});

describe('planOffRoad — where the kit goes when a van is off the road', () => {
  const kit = [{ id: 'k1' }, { id: 'k2' }, { id: 'k3' }];
  it('"all to Yard Lockup"', () => {
    expect(planOffRoad(kit, { kind: 'spare' }, {})).toEqual({
      moves: [
        { item_id: 'k1', to: 'spare' },
        { item_id: 'k2', to: 'spare' },
        { item_id: 'k3', to: 'spare' },
      ],
      missing: [],
    });
  });
  it('mixed: item by item overrides "all to"', () => {
    const p = planOffRoad(kit, { kind: 'spare' }, {
      k2: { kind: 'holder', holderEmployeeId: 'e9', vehicleId: null },
      k3: { kind: 'away_for_service', serviceCompany: 'Speedy' },
    });
    expect(p.moves).toEqual([
      { item_id: 'k1', to: 'spare' },
      { item_id: 'k2', to: 'holder', holder_employee_id: 'e9', vehicle_id: null },
      { item_id: 'k3', to: 'away_for_service', service_company: 'Speedy' },
    ]);
  });
  it('lists items with no destination yet, so it can’t be saved half done', () => {
    expect(planOffRoad(kit, null, { k1: { kind: 'spare' } }).missing).toEqual(['k2', 'k3']);
  });
  it('another spare van as the destination', () => {
    expect(planOffRoad([{ id: 'k1' }], { kind: 'holder', holderEmployeeId: null, vehicleId: 'v2' }, {}).moves)
      .toEqual([{ item_id: 'k1', to: 'holder', holder_employee_id: null, vehicle_id: 'v2' }]);
  });
});

describe('diffAuditLines — what an edit changed, for the log', () => {
  const before = [
    { id: 'l1', item_name: 'Ear defenders', result: 'N', qty: '2', comment: 'missing', expiry_date: null, service_date: null, plant_no_snapshot: null, date_tag: null },
    { id: 'l2', item_name: 'Hard hats', result: 'Y', qty: '3', comment: null, expiry_date: '2029-01-01', service_date: null, plant_no_snapshot: null, date_tag: null },
  ] as never[];
  it('lists only what changed, as "Ear defenders N → Y"', () => {
    const after = [{ ...(before[0] as object), result: 'Y', comment: 'arrived' }, before[1]] as never[];
    const d = diffAuditLines(before, after);
    expect(d.changes).toEqual([
      { line_id: 'l1', field: 'result', from: 'N', to: 'Y' },
      { line_id: 'l1', field: 'comment', from: 'missing', to: 'arrived' },
    ]);
    expect(d.summary).toEqual(['Ear defenders N → Y', 'Ear defenders comment: missing → arrived']);
  });
  it('nothing changed = nothing to save', () => {
    expect(diffAuditLines(before, before).changes).toEqual([]);
  });
  it('treats blank and empty the same', () => {
    const after = [{ ...(before[0] as object), comment: 'missing ' }, { ...(before[1] as object), comment: '' }] as never[];
    expect(diffAuditLines(before, after).changes).toEqual([]);
  });
});

describe('diffAuditLines — "Label on?" is editable (round 7)', () => {
  it('logs "Water containers label on: N → Y"', () => {
    const before = [{ id: 'w', item_name: 'Water containers', result: 'Y', qty: '1', comment: null, expiry_date: null, service_date: null, plant_no_snapshot: null, date_tag: null, label_on: 'N' }] as never[];
    const after = [{ ...(before[0] as object), label_on: 'Y' }] as never[];
    const d = diffAuditLines(before, after);
    expect(d.changes).toEqual([{ line_id: 'w', field: 'label_on', from: 'N', to: 'Y' }]);
    expect(d.summary).toEqual(['Water containers label on: N → Y']);
  });
});

describe('round 9: Edit audit — gauge in the log, and the expired / due-soon summary', () => {
  const base = { item_name: 'Fire ext 2KG dry powder', result: 'Y', qty: '1', comment: null, expiry_date: null, service_date: null, plant_no_snapshot: null, date_tag: null };
  it('logs "Fire ext 2KG dry powder gauge: amber → green"', () => {
    const d = diffAuditLines([{ id: 'f', ...base, gauge: 'amber' }] as never[], [{ id: 'f', ...base, gauge: 'green' }] as never[]);
    expect(d.summary).toEqual(['Fire ext 2KG dry powder gauge: amber → green']);
  });
  it('"2 expired · 1 due soon", with the lines to jump to (not-carried kit ignored)', () => {
    const a = dateAlerts([
      { id: 'a', result: 'Y', expiry_date: '2026-10-01' },
      { id: 'b', result: 'Y', expiry_date: '2026-09-01' },
      { id: 'c', result: 'Y', expiry_date: '2026-11-20' },
      { id: 'd', result: 'not_carried', expiry_date: '2026-01-01' },
      { id: 'e', result: 'Y', expiry_date: '2028-01-01' },
    ], '2026-11-05');
    expect(a).toEqual({ expired: ['a', 'b'], dueSoon: ['c'], text: '2 expired · 1 due soon' });
    expect(dateAlerts([], '2026-11-05').text).toBe('');
  });
});
