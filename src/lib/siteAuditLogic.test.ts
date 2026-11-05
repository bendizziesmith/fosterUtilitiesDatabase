import { describe, it, expect } from 'vitest';
import {
  sectionProgress,
  unansweredLines,
  otherAnswerFor,
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
  auditTargetsOf,
  allTargetsOf,
  holderLabel,
  holderKey,
  whoName,
  summariseKitByHolder,
  buildAuditPrefill,
  addMonths,
  autoExpiry,
  applyServiceDate,
  applyExpiry,
  summariseKitByType,
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

describe('buildAuditTargets — holders: gangers, other staff, spare vans', () => {
  const t = buildAuditTargets(employees, vehicles);

  it('labels people "Name · their van", or "no van"', () => {
    expect(t.gangs.map((g) => g.label)).toEqual(['Dom Oliver · YE24 TNL', 'Phil Hall · no van']);
    expect(t.staff.map((g) => g.label)).toEqual(['Kevin Noble · BV23 ZHK', 'Luca Clarke · no van', 'Tristan Rose · no van']);
  });
  it('labels vans nobody is assigned "reg · spare van"', () => {
    expect(t.spareVans.map((v) => v.label)).toEqual(['WV72 OZL · spare van']);
  });
  it('uses person:<id> and van:<id> keys', () => {
    expect(t.gangs[0]).toMatchObject({ key: 'person:e1', kind: 'person', personId: 'e1', isGanger: true, vehicleId: 'v1', reg: 'YE24 TNL', teamName: "D. Oliver's gang" });
    expect(t.spareVans[0]).toMatchObject({ key: 'van:v2', kind: 'spare_van', personId: null, vehicleId: 'v2' });
  });
  it('audit targets are gangers, staff who have a van, then spare vans', () => {
    expect(auditTargetsOf(t).map((x) => x.key)).toEqual(['person:e1', 'person:e2', 'person:e3', 'van:v2']);
  });
});

describe('vanLabelFor — label for a van id', () => {
  const t = buildAuditTargets(employees, vehicles);
  it('names the person on the van (ganger first)', () => {
    expect(vanLabelFor(t, 'v1')).toBe('Dom Oliver · YE24 TNL');
    expect(vanLabelFor(t, 'v3')).toBe('Kevin Noble · BV23 ZHK');
  });
  it('says spare van when nobody has it', () => {
    expect(vanLabelFor(t, 'v2')).toBe('WV72 OZL · spare van');
  });
  it('falls back to the reg snapshot, or a dash', () => {
    expect(vanLabelFor(t, 'gone', 'AB12 CDE')).toBe('AB12 CDE');
    expect(vanLabelFor(t, null)).toBe('—');
  });
});

describe('searchTargets — type a name or a reg', () => {
  const t = buildAuditTargets(employees, vehicles);
  const all = allTargetsOf(t);
  it('matches a name in any case', () => {
    expect(searchTargets(all, 'oliv').map((x) => x.key)).toEqual(['person:e1']);
  });
  it('matches a reg ignoring spaces', () => {
    expect(searchTargets(all, 'bv23z').map((x) => x.key)).toEqual(['person:e3']);
  });
  it('lists gangers, then other staff, then spare vans', () => {
    expect(searchTargets(all, '').map((x) => x.key)).toEqual(['person:e1', 'person:e2', 'person:e3', 'person:e4', 'person:e5', 'van:v2']);
  });
  it('can be limited to vans (people with a van, and spare vans)', () => {
    expect(searchTargets(all, '', { vansOnly: true }).map((x) => x.key)).toEqual(['person:e1', 'person:e3', 'van:v2']);
  });
});

describe('holderLabel / holderKey — who a kit item belongs to', () => {
  it('a person: "Name · their current van" (kit goes with the ganger)', () => {
    const k = { status: 'on_van', holder_kind: 'person', holder_employee_id: 'e1', holder_name: 'Dom Oliver', holder_reg: 'WV72 OZL', vehicle_id: 'v2' } as const;
    expect(holderLabel(k)).toBe('Dom Oliver · WV72 OZL');
    expect(holderKey(k)).toBe('person:e1');
  });
  it('a person with no van', () => {
    expect(holderLabel({ status: 'on_van', holder_kind: 'person', holder_employee_id: 'e2', holder_name: 'Phil Hall', holder_reg: null, vehicle_id: null })).toBe('Phil Hall · no van');
  });
  it('a spare van', () => {
    const k = { status: 'on_van', holder_kind: 'spare_van', holder_employee_id: null, holder_name: null, holder_reg: 'WV72 OZL', vehicle_id: 'v2' } as const;
    expect(holderLabel(k)).toBe('WV72 OZL · spare van');
    expect(holderKey(k)).toBe('van:v2');
  });
  it('a holder who was deleted from staff: needs a home', () => {
    const k = { status: 'on_van', holder_kind: 'none', holder_employee_id: null, holder_name: null, holder_reg: null, vehicle_id: null } as const;
    expect(holderLabel(k)).toBe('Unassigned, needs a home');
    expect(holderKey(k)).toBeNull();
  });
  it('yard and service as before', () => {
    expect(holderLabel({ status: 'spare', holder_kind: 'none', holder_employee_id: null, holder_name: null, holder_reg: null, vehicle_id: null })).toBe('Yard Lockup');
  });
});

describe('whoName — never show a login email', () => {
  it('shows the picked name', () => {
    expect(whoName('Christina Pearson')).toBe('Christina Pearson');
  });
  it('shows "Office login" when only an email or nothing was recorded', () => {
    expect(whoName(null)).toBe('Office login');
    expect(whoName('')).toBe('Office login');
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
  it('puts kit that needs a home (holder deleted) at the very top', () => {
    const homeless = row({ item_name: 'H', expiry_status: 'no_home', days_left: null, expiry_date: null });
    expect(sortAttention([...rows, homeless])[0].item_name).toBe('H');
    expect(filterAttention([...rows, homeless], 'expired').some((r) => r.item_name === 'H')).toBe(false);
    expect(filterAttention([...rows, homeless], 'all').some((r) => r.item_name === 'H')).toBe(true);
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
      incoming: 'P-200 (from Yard Lockup) → on YE24 TNL',
    });
  });
  it('describes back to yard + a new item', () => {
    expect(previewSwap(item, { destination: 'spare' }, { mode: 'new', plantNo: 'P-300' })).toEqual({
      outgoing: 'P-101 → Yard Lockup',
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
      .toBe('Digger (no plant no) → Yard Lockup');
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
      ['Yard Lockup', ['1']],
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
  vehicle_id: 'v1', holder_kind: 'person', holder_employee_id: 'e1', expiry_date: '2027-01-01', expiry_status: 'ok', days_left: 58, ...over,
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

describe('summariseKitByHolder — one row per person / spare van', () => {
  it('counts kit held by each, with warning badges', () => {
    const t = buildAuditTargets(employees, vehicles);
    const rows = summariseKitByHolder([...t.gangs, ...t.spareVans], [
      kitRow({ holder_kind: 'person', holder_employee_id: 'e1', expiry_status: 'expired' }),
      kitRow({ holder_kind: 'person', holder_employee_id: 'e1', expiry_status: 'due_soon' }),
      kitRow({ holder_kind: 'person', holder_employee_id: 'e1' }),
      kitRow({ holder_kind: 'spare_van', holder_employee_id: null, vehicle_id: 'v2' }),
      kitRow({ status: 'spare', holder_kind: 'none', holder_employee_id: null, vehicle_id: null }),
    ]);
    expect(rows.map((r) => [r.key, r.items, r.expired, r.dueSoon])).toEqual([
      ['person:e1', 3, 1, 1],
      ['person:e2', 0, 0, 0],
      ['van:v2', 1, 0, 0],
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

// ---------------------------------------------------------------- round 3: audits <-> kit in sync
const checklistItems = [
  { id: 'c-hat', section: 'ppe', name: 'Hard hats', expected_qty: 'Per person', sort_order: 30, service_interval_months: 36, date_label: 'Date on hat' },
  { id: 'c-hivis', section: 'ppe', name: 'Hi vis', expected_qty: 'Per person', sort_order: 10, service_interval_months: null, date_label: null },
  { id: 'c-aid', section: 'hs', name: 'First aid kit', expected_qty: '1 per van', sort_order: 10, service_interval_months: null, date_label: null },
  { id: 'c-fuel', section: 'other', name: 'Fuel cans', expected_qty: 'x2', sort_order: 30, service_interval_months: null, date_label: null },
] as never[];
const types = [
  { id: 't-saw', name: 'STIHL saw', sort_order: 40 },
  { id: 't-dig', name: 'Digger', sort_order: 20 },
  { id: 't-brk', name: 'Breaker', sort_order: 60 },
];

describe('buildAuditPrefill — a new audit starts from the person’s (or spare van’s) record', () => {
  // (a) Dom was audited: kit, PPE dates, quantities and "not carried" were written back to his record
  const domRecord = {
    heldKit: [
      { id: 'k-saw', kit_type_id: 't-saw', plant_no: 'S-100', service_date: '2026-05-01', expiry_date: '2027-05-01' },
      { id: 'k-dig', kit_type_id: 't-dig', plant_no: 'D-7', service_date: '2026-01-10', expiry_date: '2027-01-10' },
    ],
    ppe: [{ checklist_item_id: 'c-hat', expiry_date: '2029-03-01' }],
    notCarried: [{ kit_type_id: 't-brk', carried: false }],
    lastLines: [
      { section: 'ppe', checklist_item_id: 'c-hat', qty: '3', service_date: '2026-03-01', date_tag: null, result: 'Y' },
      { section: 'hs', checklist_item_id: 'c-aid', qty: '1', service_date: null, date_tag: null, result: 'N' },
      { section: 'other', checklist_item_id: 'c-fuel', qty: '2', service_date: null, date_tag: 'Tag 44', result: 'Y' },
    ],
  };
  const lines = buildAuditPrefill({ checklist: checklistItems, kitTypes: types, ...domRecord });
  const byName = (n: string) => lines.find((l) => l.item_name === n)!;

  it('(a) carries over every kit item Dom holds, with plant no, service and expiry', () => {
    expect(byName('STIHL saw')).toMatchObject({ kit_item_id: 'k-saw', plant_no_snapshot: 'S-100', service_date: '2026-05-01', expiry_date: '2027-05-01' });
    expect(byName('Digger')).toMatchObject({ kit_item_id: 'k-dig', plant_no_snapshot: 'D-7' });
  });
  it('(a) carries over PPE expiry dates and the date on the hat', () => {
    expect(byName('Hard hats')).toMatchObject({ expiry_date: '2029-03-01', service_date: '2026-03-01' });
    expect(byName('Hi vis').expiry_date).toBeNull();
  });
  it('(a) carries over quantities (and date tags) from the last audit', () => {
    expect(byName('Hard hats').qty).toBe('3');
    expect(byName('First aid kit').qty).toBe('1');
    expect(byName('Fuel cans')).toMatchObject({ qty: '2', date_tag: 'Tag 44' });
  });
  it('(a) carries over kit marked "not carried"', () => {
    expect(byName('Breaker')).toMatchObject({ result: 'not_carried', notCarriedBefore: true });
  });
  it('(a) starts every Y/N box blank', () => {
    expect(lines.filter((l) => l.result === 'Y' || l.result === 'N')).toEqual([]);
  });
  it('(a) treats carried-over expiry dates as automatic, so a new service date recalculates them', () => {
    expect(byName('STIHL saw').expiryManual).toBe(false);
  });

  it('(b) after a swap on Kit & Plant, the next audit shows the new plant no', () => {
    const afterSwap = { ...domRecord, heldKit: [{ id: 'k-saw2', kit_type_id: 't-saw', plant_no: 'S-200', service_date: '2026-11-04', expiry_date: '2027-11-04' }, domRecord.heldKit[1]] };
    const l2 = buildAuditPrefill({ checklist: checklistItems, kitTypes: types, ...afterSwap });
    expect(l2.find((l) => l.item_name === 'STIHL saw')).toMatchObject({ kit_item_id: 'k-saw2', plant_no_snapshot: 'S-200' });
  });

  it('(c) kit assigned to a spare van appears in that van’s audit', () => {
    const vanRecord = { heldKit: [{ id: 'k-trl', kit_type_id: 't-dig', plant_no: 'D-55', service_date: null, expiry_date: null }], ppe: [], notCarried: [], lastLines: [] };
    const l3 = buildAuditPrefill({ checklist: checklistItems, kitTypes: types, ...vanRecord });
    expect(l3.find((l) => l.item_name === 'Digger')).toMatchObject({ kit_item_id: 'k-trl', plant_no_snapshot: 'D-55' });
  });

  it('(d) kit follows the ganger: his record is keyed by person, so a new van changes only the label', () => {
    const t1 = buildAuditTargets(employees, vehicles);
    const moved = employees.map((e) => (e.id === 'e1' ? { ...e, assigned_vehicle_id: 'v2' } : e));
    const t2 = buildAuditTargets(moved, vehicles);
    expect(t1.gangs[0].key).toBe('person:e1');
    expect(t2.gangs[0].key).toBe('person:e1');
    expect(t2.gangs[0].label).toBe('Dom Oliver · WV72 OZL');
    expect(holderLabel({ status: 'on_van', holder_kind: 'person', holder_employee_id: 'e1', holder_name: 'Dom Oliver', holder_reg: 'WV72 OZL', vehicle_id: 'v2' }))
      .toBe('Dom Oliver · WV72 OZL');
  });
});

describe('buildAuditTargets — vans off the road', () => {
  const emp = [
    { id: 'e1', full_name: 'Dom Oliver', role: 'Ganger', assigned_vehicle_id: 'v1' },
  ];
  const veh = [
    { id: 'v1', registration_number: 'YE24 TNL' },
    { id: 'v2', registration_number: 'WV72 OZL' },
    { id: 'v3', registration_number: 'OW72 SKV' },
  ];
  it('leaves an off-the-road spare van out of pickers and audit lists', () => {
    const t = buildAuditTargets(emp, veh, new Set(['v2']));
    expect(t.spareVans.map((v) => v.reg)).toEqual(['OW72 SKV']);
  });
  it('marks a person whose van is off the road, and leaves them out of audit lists', () => {
    const t = buildAuditTargets(emp, veh, new Set(['v1']));
    expect(t.gangs[0].label).toBe('Dom Oliver · YE24 TNL (off the road)');
    expect(auditTargetsOf(t).map((x) => x.key)).toEqual(['van:v3', 'van:v2']); // spare vans by reg
  });
});

describe('otherAnswerFor — what the "Other" section asks, from the checklist item (round 7)', () => {
  it('"Label on?" Y/N for items with the label check (Water containers, Gerry cans, Fuel cans)', () => {
    expect(otherAnswerFor({ section: 'other', has_date_tag: false, has_label_check: true })).toBe('label');
  });
  it('no box at all when neither is set (NSF folder, Powercare checklist)', () => {
    expect(otherAnswerFor({ section: 'other', has_date_tag: false, has_label_check: false })).toBe('none');
  });
  it('the old free-text box only where an item still asks for it', () => {
    expect(otherAnswerFor({ section: 'other', has_date_tag: true, has_label_check: false })).toBe('date_tag');
  });
  it('the label check wins over the text box if both are set', () => {
    expect(otherAnswerFor({ section: 'other', has_date_tag: true, has_label_check: true })).toBe('label');
  });
  it('only the Other section asks either', () => {
    expect(otherAnswerFor({ section: 'ppe', has_date_tag: true, has_label_check: true })).toBe('none');
    expect(otherAnswerFor(undefined)).toBe('none');
  });
});

describe('buildAuditPrefill — "Label on?" carries over like quantities (round 7)', () => {
  const checklist = [
    { id: 'c-water', section: 'other', name: 'Water containers', expected_qty: 'x1', sort_order: 10 },
    { id: 'c-nsf', section: 'other', name: 'NSF folder', expected_qty: 'x1', sort_order: 40 },
  ];
  const lines = buildAuditPrefill({
    checklist, kitTypes: [], heldKit: [], ppe: [], notCarried: [],
    lastLines: [{ section: 'other', checklist_item_id: 'c-water', qty: '1', service_date: null, date_tag: null, label_on: 'N' }],
  });
  it('the last answer is pre-filled', () => {
    expect(lines.find((l) => l.checklist_item_id === 'c-water')).toMatchObject({ qty: '1', label_on: 'N' });
  });
  it('never answered = blank', () => {
    expect(lines.find((l) => l.checklist_item_id === 'c-nsf')!.label_on).toBeNull();
  });
});

describe('summariseAuditLines — no label is a fail (round 8)', () => {
  const base = { section: 'other' as const, item_name: 'Water containers', expiry_date: null };
  it('"Label on? = N" counts as 1 fail, like Fit for purpose = N', () => {
    expect(summariseAuditLines([{ ...base, result: 'Y', label_on: 'N' }], '2026-11-05').fails).toBe(1);
  });
  it('one item with both N is still one fail', () => {
    expect(summariseAuditLines([{ ...base, result: 'N', label_on: 'N' }], '2026-11-05').fails).toBe(1);
  });
  it('label Y or blank is not a fail', () => {
    expect(summariseAuditLines([{ ...base, result: 'Y', label_on: 'Y' }, { ...base, result: 'Y', label_on: null }], '2026-11-05').fails).toBe(0);
  });
});

describe('buildAuditPrefill — answers come from the person’s record (round 8)', () => {
  const checklist = [
    { id: 'c-hat', section: 'ppe', name: 'Hard hats', expected_qty: 'Per person', sort_order: 30 },
    { id: 'c-aid', section: 'hs', name: 'First aid kit', expected_qty: '1', sort_order: 10 },
    { id: 'c-water', section: 'other', name: 'Water containers', expected_qty: 'x1', sort_order: 10 },
  ];
  const record = [
    { checklist_item_id: 'c-hat', qty: '2', service_date: '2026-10-26', label_on: null, date_tag: null },
    { checklist_item_id: 'c-aid', qty: '1', service_date: null, label_on: null, date_tag: null },
    { checklist_item_id: 'c-water', qty: '1', service_date: null, label_on: 'N', date_tag: null },
  ];
  it('still pre-fills qty, date on hat and Label on when the last audit was deleted (no last lines)', () => {
    const lines = buildAuditPrefill({ checklist, kitTypes: [], heldKit: [], ppe: [{ checklist_item_id: 'c-hat', expiry_date: '2029-10-26' }], notCarried: [], lastLines: [], answers: record });
    const by = (id: string) => lines.find((l) => l.checklist_item_id === id)!;
    expect(by('c-hat')).toMatchObject({ qty: '2', service_date: '2026-10-26', expiry_date: '2029-10-26', result: null });
    expect(by('c-aid')).toMatchObject({ qty: '1', result: null });
    expect(by('c-water')).toMatchObject({ qty: '1', label_on: 'N', result: null });
  });
  it('the record wins over an older audit’s lines', () => {
    const lines = buildAuditPrefill({ checklist, kitTypes: [], heldKit: [], ppe: [], notCarried: [], answers: record,
      lastLines: [{ section: 'hs', checklist_item_id: 'c-aid', qty: '9', service_date: null, date_tag: null }] });
    expect(lines.find((l) => l.checklist_item_id === 'c-aid')!.qty).toBe('1');
  });
  it('falls back to the last audit’s lines for items not on the record yet', () => {
    const lines = buildAuditPrefill({ checklist, kitTypes: [], heldKit: [], ppe: [], notCarried: [], answers: [],
      lastLines: [{ section: 'hs', checklist_item_id: 'c-aid', qty: '4', service_date: null, date_tag: null }] });
    expect(lines.find((l) => l.checklist_item_id === 'c-aid')!.qty).toBe('4');
  });
  it('kit marked Y with no plant no or dates comes back next time as that kit type', () => {
    const lines = buildAuditPrefill({ checklist: [], kitTypes: [{ id: 't-dig', name: 'Digger', sort_order: 1 }],
      heldKit: [{ id: 'k1', kit_type_id: 't-dig', plant_no: null, service_date: null, expiry_date: null }], ppe: [], notCarried: [], lastLines: [], answers: [] });
    expect(lines[0]).toMatchObject({ kit_item_id: 'k1', item_name: 'Digger', result: null, plant_no_snapshot: null });
  });
});

describe('sectionProgress / unansweredLines — progress chips and Submit (round 8)', () => {
  const l = (section: 'ppe' | 'hs' | 'kit' | 'other', name: string, result: 'Y' | 'N' | 'not_carried' | null) =>
    ({ key: name, section, item_name: name, result, expiry_date: null });
  const lines = [l('ppe', 'Hi vis', 'Y'), l('ppe', 'Boots', null), l('hs', 'First aid', 'N'), l('kit', 'Digger', 'not_carried'), l('kit', 'Saw', null)];
  it('counts an item as answered when Y, N or Not carried', () => {
    expect(sectionProgress(lines)).toEqual([
      { key: 'ppe', title: 'PPE', answered: 1, total: 2, done: false },
      { key: 'hs', title: 'H&S', answered: 1, total: 1, done: true },
      { key: 'kit', title: 'Kit', answered: 1, total: 2, done: false },
      { key: 'other', title: 'Other', answered: 0, total: 0, done: true },
    ]);
  });
  it('lists unanswered items in form order', () => {
    expect(unansweredLines(lines).map((x) => x.item_name)).toEqual(['Boots', 'Saw']);
  });
});
