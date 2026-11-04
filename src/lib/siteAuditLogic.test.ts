import { describe, it, expect } from 'vitest';
import {
  getExpiryStatus,
  formatExpiryStatus,
  buildAuditTargets,
  buildTeam,
  sortAttention,
  filterAttention,
  summariseAuditLines,
  buildKitLines,
  previewSwap,
  groupKitForPhone,
  type AttentionRow,
  type DraftLine,
} from './siteAuditLogic';

const TODAY = '2026-11-04';

describe('getExpiryStatus — same rule as getVehicleServiceStatus (≤30 days due, past = overdue)', () => {
  it('has no status when there is no date (N/A)', () => {
    expect(getExpiryStatus(null, TODAY)).toEqual({ status: null, daysLeft: null });
  });
  it('is expired the day after the expiry date', () => {
    expect(getExpiryStatus('2026-11-03', TODAY)).toEqual({ status: 'expired', daysLeft: -1 });
  });
  it('is due soon (not expired) on the expiry date itself', () => {
    expect(getExpiryStatus('2026-11-04', TODAY)).toEqual({ status: 'due_soon', daysLeft: 0 });
  });
  it('is due soon at exactly 30 days', () => {
    expect(getExpiryStatus('2026-12-04', TODAY)).toEqual({ status: 'due_soon', daysLeft: 30 });
  });
  it('is ok at 31 days', () => {
    expect(getExpiryStatus('2026-12-05', TODAY)).toEqual({ status: 'ok', daysLeft: 31 });
  });
  it('counts whole days across the October clock change', () => {
    expect(getExpiryStatus('2026-10-02', TODAY)).toEqual({ status: 'expired', daysLeft: -33 });
  });
});

describe('formatExpiryStatus — status as text, not only colour', () => {
  it.each([
    [-33, '33 days over'],
    [-1, '1 day over'],
    [0, 'Due today'],
    [1, '1 day left'],
    [16, '16 days left'],
  ])('%i → %s', (days, text) => {
    expect(formatExpiryStatus(days)).toBe(text);
  });
  it('says N/A when there is no date', () => {
    expect(formatExpiryStatus(null)).toBe('N/A');
  });
});

const vehicles = [
  { id: 'v1', registration_number: 'YE24 TNL' },
  { id: 'v2', registration_number: 'WV72 OZL' },
  { id: 'v3', registration_number: 'BV23 ZHK' },
];
const employees = [
  { id: 'e1', full_name: 'Dom Oliver', role: 'Ganger', assigned_vehicle_id: 'v1' },
  { id: 'e2', full_name: 'Phil Hall', role: 'Ganger', assigned_vehicle_id: null },
  { id: 'e3', full_name: 'Kevin Noble', role: 'Backup Driver', assigned_vehicle_id: 'v3' },
  { id: 'e4', full_name: 'Luca Clarke', role: 'Labourer', assigned_vehicle_id: null },
  { id: 'e5', full_name: 'Tristan Rose', role: 'Labourer', assigned_vehicle_id: null },
];

describe('buildAuditTargets — the "Audit who?" dropdown', () => {
  const targets = buildAuditTargets(employees, vehicles);

  it('lists gangs labelled by ganger initial + surname and van reg', () => {
    expect(targets.gangs.map((g) => g.label)).toEqual([
      "D. Oliver's gang · YE24 TNL",
      "P. Hall's gang · no van assigned",
    ]);
  });
  it('carries the ganger and van ids on each gang', () => {
    expect(targets.gangs[0]).toMatchObject({ gangerId: 'e1', vehicleId: 'v1', reg: 'YE24 TNL' });
  });
  it('lists every van not assigned to a ganger under Other vans, with who has it', () => {
    expect(targets.otherVans.map((v) => v.label)).toEqual([
      'BV23 ZHK · Kevin Noble',
      'WV72 OZL · no one assigned',
    ]);
    expect(targets.otherVans.every((v) => v.gangerId === null)).toBe(true);
  });
  it('gives every option a unique key so each pick is its own audit', () => {
    const keys = [...targets.gangs, ...targets.otherVans].map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('buildTeam — this week’s members', () => {
  const ganger = employees[0];

  it('uses the ganger plus the labourers on the latest timesheet, matched to staff names', () => {
    const team = buildTeam({
      ganger,
      timesheet: { labourer_1_name: 'Luca clarke', labourer_2_name: 'Tristan rose ' },
      havsMembers: [],
      employees,
    });
    expect(team).toEqual([
      { name: 'Dom Oliver', employee_id: 'e1' },
      { name: 'Luca Clarke', employee_id: 'e4' },
      { name: 'Tristan Rose', employee_id: 'e5' },
    ]);
  });
  it('drops the ganger when they put themselves in a labourer slot', () => {
    const team = buildTeam({
      ganger,
      timesheet: { labourer_1_name: 'dom oliver', labourer_2_name: null },
      havsMembers: [],
      employees,
    });
    expect(team).toEqual([{ name: 'Dom Oliver', employee_id: 'e1' }]);
  });
  it('keeps a name it cannot match, as typed (trimmed), with no staff link', () => {
    const team = buildTeam({
      ganger,
      timesheet: { labourer_1_name: ' Jo calley ', labourer_2_name: '' },
      havsMembers: [],
      employees,
    });
    expect(team[1]).toEqual({ name: 'Jo calley', employee_id: null });
  });
  it('falls back to the latest HAVS week members when there is no timesheet', () => {
    const team = buildTeam({
      ganger,
      timesheet: null,
      havsMembers: [
        { employee_id: 'e1', manual_name: null, person_type: 'ganger' },
        { employee_id: null, manual_name: 'Luca', person_type: 'operative' },
      ],
      employees,
    });
    expect(team).toEqual([
      { name: 'Dom Oliver', employee_id: 'e1' },
      { name: 'Luca', employee_id: null },
    ]);
  });
  it('is just the ganger when nothing is on record', () => {
    expect(buildTeam({ ganger, timesheet: null, havsMembers: [], employees })).toEqual([
      { name: 'Dom Oliver', employee_id: 'e1' },
    ]);
  });
  it('is empty for a standalone van (no ganger)', () => {
    expect(buildTeam({ ganger: null, timesheet: null, havsMembers: [], employees })).toEqual([]);
  });
});

const row = (over: Partial<AttentionRow>): AttentionRow => ({
  source: 'kit', item_id: Math.random().toString(), item_name: 'Digger', plant_no: null,
  kit_status: 'on_van', vehicle_id: 'v1', vehicle_reg: 'YE24 TNL', ganger_name: 'Dom Oliver',
  expiry_date: '2026-11-10', days_left: 6, expiry_status: 'due_soon', is_test: false, ...over,
});

describe('Needs attention list', () => {
  const rows = [
    row({ item_name: 'A', days_left: 16, expiry_status: 'due_soon' }),
    row({ item_name: 'B', days_left: -2, expiry_status: 'expired' }),
    row({ item_name: 'C', days_left: 3, expiry_status: 'due_soon', source: 'ppe' }),
    row({ item_name: 'D', days_left: -33, expiry_status: 'expired' }),
  ];

  it('puts expired first (most overdue first), then the soonest due', () => {
    expect(sortAttention(rows).map((r) => r.item_name)).toEqual(['D', 'B', 'C', 'A']);
  });
  it('Expired tab shows only expired', () => {
    expect(filterAttention(rows, 'expired').map((r) => r.item_name).sort()).toEqual(['B', 'D']);
  });
  it('Due within 30 days tab shows only due soon', () => {
    expect(filterAttention(rows, 'due').map((r) => r.item_name).sort()).toEqual(['A', 'C']);
  });
  it('All tab shows everything', () => {
    expect(filterAttention(rows, 'all')).toHaveLength(4);
  });
});

const line = (over: Partial<DraftLine>): DraftLine => ({
  section: 'ppe', item_name: 'Hard hats', result: 'Y', expiry_date: null, ...over,
});

describe('summariseAuditLines — "N fails, N expired, N due soon"', () => {
  it('counts N answers as fails', () => {
    expect(summariseAuditLines([line({ result: 'N' }), line({ result: 'Y' })], TODAY).fails).toBe(1);
  });
  it('does not count "Not carried on this van" as a fail', () => {
    const s = summariseAuditLines([line({ section: 'kit', result: 'not_carried' })], TODAY);
    expect(s).toEqual({ fails: 0, expired: 0, dueSoon: 0 });
  });
  it('ignores dates on not-carried kit', () => {
    const s = summariseAuditLines([line({ section: 'kit', result: 'not_carried', expiry_date: '2026-01-01' })], TODAY);
    expect(s.expired).toBe(0);
  });
  it('counts expired and due-soon dates on PPE and kit', () => {
    const s = summariseAuditLines([
      line({ section: 'ppe', expiry_date: '2026-10-01' }),
      line({ section: 'kit', expiry_date: '2026-11-20' }),
    ], TODAY);
    expect(s).toEqual({ fails: 0, expired: 1, dueSoon: 1 });
  });
  it('never counts dates on health & safety items', () => {
    const s = summariseAuditLines([line({ section: 'hs', expiry_date: '2026-01-01' })], TODAY);
    expect(s.expired).toBe(0);
  });
});

describe('buildKitLines — kit section pre-filled from the van’s kit list', () => {
  const types = [
    { id: 't1', name: 'Cat & Genny', sort_order: 10 },
    { id: 't2', name: 'Digger', sort_order: 20 },
    { id: 't3', name: 'Breaker', sort_order: 60 },
  ];

  it('makes one empty line per kit type for a van with nothing recorded', () => {
    const lines = buildKitLines(types, [], []);
    expect(lines.map((l) => l.item_name)).toEqual(['Cat & Genny', 'Digger', 'Breaker']);
    expect(lines.every((l) => l.result === null && l.kit_item_id === null)).toBe(true);
  });
  it('pre-fills plant no, service date and expiry from kit on the van', () => {
    const lines = buildKitLines(types, [], [
      { id: 'k1', kit_type_id: 't2', plant_no: 'P-101', service_date: '2026-05-01', expiry_date: '2027-05-01' },
    ]);
    expect(lines[1]).toMatchObject({
      kit_type_id: 't2', kit_item_id: 'k1', plant_no_snapshot: 'P-101',
      service_date: '2026-05-01', expiry_date: '2027-05-01',
    });
  });
  it('shows kit marked not carried as greyed "Not carried"', () => {
    const lines = buildKitLines(types, [{ kit_type_id: 't3', carried: false }], []);
    expect(lines[2]).toMatchObject({ result: 'not_carried', notCarriedBefore: true });
  });
  it('adds a second line when a van has two of the same type', () => {
    const lines = buildKitLines(types, [], [
      { id: 'k1', kit_type_id: 't2', plant_no: 'P-1', service_date: null, expiry_date: null },
      { id: 'k2', kit_type_id: 't2', plant_no: 'P-2', service_date: null, expiry_date: null },
    ]);
    expect(lines.filter((l) => l.kit_type_id === 't2').map((l) => l.plant_no_snapshot)).toEqual(['P-1', 'P-2']);
  });
});

describe('previewSwap — what the van ends up with', () => {
  const item = { plant_no: 'P-101', type_name: 'Digger', vehicle_reg: 'YE24 TNL' };

  it('describes away for service + a spare going on', () => {
    expect(previewSwap(item, { destination: 'away_for_service', serviceCompany: 'Speedy' },
      { mode: 'spare', plantNo: 'P-200' })).toEqual({
      outgoing: 'P-101 → Away for service (Speedy)',
      incoming: 'P-200 (spare) → on YE24 TNL',
    });
  });
  it('describes back to yard + a new item', () => {
    expect(previewSwap(item, { destination: 'spare' }, { mode: 'new', plantNo: 'P-300' })).toEqual({
      outgoing: 'P-101 → Spare · Yard',
      incoming: 'New Digger P-300 → on YE24 TNL',
    });
  });
  it('describes another van, and nothing going on', () => {
    expect(previewSwap(item, { destination: 'on_van', vanReg: 'WV72 OZL' }, { mode: 'none' })).toEqual({
      outgoing: 'P-101 → WV72 OZL',
      incoming: 'Nothing for now: YE24 TNL will have no Digger',
    });
  });
  it('describes scrapped', () => {
    expect(previewSwap(item, { destination: 'removed' }, { mode: 'none' }).outgoing).toBe('P-101 → Scrapped / removed');
  });
  it('uses "no plant no" when the item has none', () => {
    expect(previewSwap({ ...item, plant_no: null }, { destination: 'spare' }, { mode: 'none' }).outgoing)
      .toBe('Digger (no plant no) → Spare · Yard');
  });
});

describe('groupKitForPhone — cards by van, then spares, then away for service', () => {
  it('groups and orders', () => {
    const groups = groupKitForPhone([
      { id: '1', status: 'spare', vehicle_reg: null, ganger_name: null },
      { id: '2', status: 'on_van', vehicle_reg: 'YE24 TNL', ganger_name: 'Dom Oliver' },
      { id: '3', status: 'away_for_service', vehicle_reg: null, ganger_name: null },
      { id: '4', status: 'on_van', vehicle_reg: 'BV23 ZHK', ganger_name: null },
      { id: '5', status: 'removed', vehicle_reg: null, ganger_name: null },
    ]);
    expect(groups.map((g) => [g.title, g.items.map((i) => i.id)])).toEqual([
      ['BV23 ZHK', ['4']],
      ['Dom Oliver · YE24 TNL', ['2']],
      ['Spares · Yard', ['1']],
      ['Away for service', ['3']],
    ]);
  });
});
