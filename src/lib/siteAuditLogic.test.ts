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
  vanLabelFor,
  searchTargets,
  addMonths,
  autoExpiry,
  applyServiceDate,
  applyExpiry,
  summariseKitByType,
  summariseKitByVan,
  sortKit,
  isFileDeleted,
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

describe('buildAuditTargets — ganger name + van everywhere', () => {
  const targets = buildAuditTargets(employees, vehicles);

  it('labels gangs "Ganger name · reg", and "no van" when none is assigned', () => {
    expect(targets.gangs.map((g) => g.label)).toEqual(['Dom Oliver · YE24 TNL', 'Phil Hall · no van']);
  });
  it('keeps the short team name for the audit record', () => {
    expect(targets.gangs[0].teamName).toBe("D. Oliver's gang");
  });
  it('carries the ganger and van ids on each gang', () => {
    expect(targets.gangs[0]).toMatchObject({ gangerId: 'e1', vehicleId: 'v1', reg: 'YE24 TNL' });
  });
  it('labels other vans "reg · person assigned" or "reg · Unassigned"', () => {
    expect(targets.otherVans.map((v) => v.label)).toEqual(['BV23 ZHK · Kevin Noble', 'WV72 OZL · Unassigned']);
    expect(targets.otherVans.every((v) => v.gangerId === null)).toBe(true);
  });
  it('gives every option a unique key so each pick is its own audit', () => {
    const keys = [...targets.gangs, ...targets.otherVans].map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('vanLabelFor — label for any van id', () => {
  const targets = buildAuditTargets(employees, vehicles);
  it('uses the gang label for a ganger’s van', () => {
    expect(vanLabelFor(targets, 'v1')).toBe('Dom Oliver · YE24 TNL');
  });
  it('uses the other-van label otherwise', () => {
    expect(vanLabelFor(targets, 'v2')).toBe('WV72 OZL · Unassigned');
  });
  it('falls back to the reg snapshot for a van no longer on the fleet', () => {
    expect(vanLabelFor(targets, 'gone', 'AB12 CDE')).toBe('AB12 CDE');
    expect(vanLabelFor(targets, null)).toBe('—');
  });
});

describe('searchTargets — type a ganger’s name or a reg', () => {
  const targets = buildAuditTargets(employees, vehicles);
  const all = [...targets.gangs, ...targets.otherVans];
  it('matches a ganger by any part of the name, case-insensitive', () => {
    expect(searchTargets(all, 'oliv').map((t) => t.key)).toEqual(['gang:e1']);
  });
  it('matches a reg ignoring spaces', () => {
    expect(searchTargets(all, 'bv23z').map((t) => t.key)).toEqual(['van:v3']);
  });
  it('matches the person a van is assigned to', () => {
    expect(searchTargets(all, 'kevin').map((t) => t.key)).toEqual(['van:v3']);
  });
  it('lists gangs first, then other vans, when the search is empty', () => {
    expect(searchTargets(all, '').map((t) => t.key)).toEqual(['gang:e1', 'gang:e2', 'van:v3', 'van:v2']);
  });
  it('can be limited to options that have a van', () => {
    expect(searchTargets(all, '', { vansOnly: true }).map((t) => t.key)).toEqual(['gang:e1', 'van:v3', 'van:v2']);
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

describe('addMonths — service interval date maths', () => {
  it('adds whole months', () => {
    expect(addMonths('2026-03-15', 12)).toBe('2027-03-15');
    expect(addMonths('2026-11-04', 3)).toBe('2027-02-04');
  });
  it('clamps to the last day when the month is shorter', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-08-31', 1)).toBe('2026-09-30');
  });
  it('lands on 29 Feb in a leap year', () => {
    expect(addMonths('2027-01-31', 13)).toBe('2028-02-29');
  });
  it('moves 29 Feb to 28 Feb in a non-leap year', () => {
    expect(addMonths('2028-02-29', 12)).toBe('2029-02-28');
  });
  it('handles 36 months (hard hats) across a leap day', () => {
    expect(addMonths('2028-02-29', 36)).toBe('2031-02-28');
    expect(addMonths('2025-02-28', 36)).toBe('2028-02-28');
  });
});

describe('autoExpiry', () => {
  it('is service date + interval', () => {
    expect(autoExpiry('2026-11-04', 12)).toBe('2027-11-04');
  });
  it('is nothing without a date or an interval', () => {
    expect(autoExpiry(null, 12)).toBeNull();
    expect(autoExpiry('2026-11-04', null)).toBeNull();
    expect(autoExpiry('2026-11-04', 0)).toBeNull();
  });
});

describe('applyServiceDate / applyExpiry — expiry fills itself unless typed by hand', () => {
  const blank = { serviceDate: null, expiry: null, expiryManual: false };

  it('fills expiry from the service date', () => {
    expect(applyServiceDate(blank, '2026-11-04', 12)).toEqual({ serviceDate: '2026-11-04', expiry: '2027-11-04', expiryManual: false });
  });
  it('recalculates when the service date changes again', () => {
    const s1 = applyServiceDate(blank, '2026-11-04', 12);
    expect(applyServiceDate(s1, '2026-12-01', 12).expiry).toBe('2027-12-01');
  });
  it('keeps an expiry the person typed', () => {
    const typed = applyExpiry(applyServiceDate(blank, '2026-11-04', 12), '2027-06-30');
    expect(typed.expiryManual).toBe(true);
    expect(applyServiceDate(typed, '2026-12-01', 12).expiry).toBe('2027-06-30');
  });
  it('goes back to automatic when the typed expiry is cleared', () => {
    const cleared = applyExpiry({ serviceDate: '2026-11-04', expiry: '2027-06-30', expiryManual: true }, null);
    expect(cleared.expiryManual).toBe(false);
    expect(applyServiceDate(cleared, '2026-11-05', 12).expiry).toBe('2027-11-05');
  });
  it('leaves expiry alone when there is no interval', () => {
    expect(applyServiceDate({ serviceDate: null, expiry: '2027-01-01', expiryManual: false }, '2026-11-04', null).expiry).toBe('2027-01-01');
  });
});

const kitRow = (over: Record<string, unknown>) => ({
  id: Math.random().toString(), kit_type_id: 't1', type_name: 'Digger', plant_no: 'P1', status: 'on_van',
  vehicle_id: 'v1', expiry_date: '2027-01-01', expiry_status: 'ok', days_left: 58, ...over,
}) as never;

describe('summariseKitByType — one row per kit type', () => {
  it('counts total, on vans, spares, away, expired and due soon (expired/due ignore away for service)', () => {
    const rows = summariseKitByType(
      [{ id: 't1', name: 'Digger', sort_order: 20 }, { id: 't2', name: 'Trailer', sort_order: 30 }],
      [
        kitRow({ status: 'on_van', expiry_status: 'expired' }),
        kitRow({ status: 'spare', expiry_status: 'due_soon' }),
        kitRow({ status: 'away_for_service', expiry_status: 'expired' }),
        kitRow({ status: 'on_van' }),
      ]
    );
    expect(rows).toEqual([
      { typeId: 't1', name: 'Digger', total: 4, onVans: 2, spares: 1, away: 1, expired: 1, dueSoon: 1 },
      { typeId: 't2', name: 'Trailer', total: 0, onVans: 0, spares: 0, away: 0, expired: 0, dueSoon: 0 },
    ]);
  });
});

describe('summariseKitByVan — one row per gang / van', () => {
  it('counts kit on each van with warning badges', () => {
    const targets = buildAuditTargets(employees, vehicles);
    const rows = summariseKitByVan([...targets.gangs, ...targets.otherVans], [
      kitRow({ vehicle_id: 'v1', expiry_status: 'expired' }),
      kitRow({ vehicle_id: 'v1', expiry_status: 'due_soon' }),
      kitRow({ vehicle_id: 'v1' }),
      kitRow({ vehicle_id: 'v3', status: 'on_van' }),
      kitRow({ vehicle_id: null, status: 'spare' }),
    ]);
    expect(rows.map((r) => [r.key, r.items, r.expired, r.dueSoon])).toEqual([
      ['gang:e1', 3, 1, 1],
      ['gang:e2', 0, 0, 0],
      ['van:v3', 1, 0, 0],
      ['van:v2', 0, 0, 0],
    ]);
  });
});

describe('sortKit', () => {
  const items = [
    kitRow({ plant_no: 'B2', expiry_date: '2027-05-01', vehicle_label: 'Zed · AA11' }),
    kitRow({ plant_no: 'A1', expiry_date: null, vehicle_label: 'Amy · BB22' }),
    kitRow({ plant_no: 'C3', expiry_date: '2026-10-01', vehicle_label: 'Mo · CC33' }),
  ];
  it('puts the soonest expiry first by default, undated last', () => {
    expect(sortKit(items, 'expiry').map((i: { plant_no: string }) => i.plant_no)).toEqual(['C3', 'B2', 'A1']);
  });
  it('sorts by plant no', () => {
    expect(sortKit(items, 'plant').map((i: { plant_no: string }) => i.plant_no)).toEqual(['A1', 'B2', 'C3']);
  });
  it('sorts by van label', () => {
    expect(sortKit(items, 'van').map((i: { plant_no: string }) => i.plant_no)).toEqual(['A1', 'C3', 'B2']);
  });
});

describe('isFileDeleted', () => {
  const deletions = [{ path: 'lines/a.jpg', deleted_by_name: 'Admin', deleted_at: '2026-11-04T10:00:00Z' }];
  it('finds the deletion record for a path', () => {
    expect(isFileDeleted('lines/a.jpg', deletions)?.deleted_by_name).toBe('Admin');
  });
  it('is undefined for a file still there', () => {
    expect(isFileDeleted('lines/b.jpg', deletions)).toBeUndefined();
  });
});
