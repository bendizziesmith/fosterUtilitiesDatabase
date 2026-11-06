import { describe, it, expect } from 'vitest';
import {
  hsDateKind,
  hsUpdateOptions,
  hsUpdateFields,
  hsUpdateInput,
  lockupDatesError,
  groupLockupLines,
  lineForExpiry,
  issueLineOptions,
  issueCopiesDates,
  lockupLineLabel,
  lockupAttentionRows,
  hsStartDates,
} from './hsDatesLogic';
import { lowStockLines } from './lockupLogic';

const FIRE = { section: 'hs' as const, name: 'Fire ext 2KG dry powder', has_expiry: true, service_interval_months: 12 };
const EYE = { section: 'hs' as const, name: 'Eye wash', has_expiry: true, service_interval_months: null };
const SPILL = { section: 'hs' as const, name: 'Spill kit', has_expiry: false, service_interval_months: null };
const HAT = { section: 'ppe' as const, name: 'Hard hats', has_expiry: true, service_interval_months: 36 };

describe('hsDateKind: only the 4 dated H&S items get dates', () => {
  it('fire extinguisher is "tested" (date tested + 12 months)', () => {
    expect(hsDateKind(FIRE)).toBe('tested');
  });
  it('first aid kit, eye wash, burns kit are "expiry" only', () => {
    expect(hsDateKind(EYE)).toBe('expiry');
    expect(hsDateKind({ ...EYE, name: 'First aid kit' })).toBe('expiry');
    expect(hsDateKind({ ...EYE, name: 'Burns kit' })).toBe('expiry');
  });
  it('other H&S items and PPE get nothing', () => {
    expect(hsDateKind(SPILL)).toBeNull();
    expect(hsDateKind(HAT)).toBeNull();
    expect(hsDateKind(null)).toBeNull();
  });
});

describe('Update sheet: fire extinguisher Tested / Replaced, the others Replaced with new', () => {
  it('fire extinguisher offers "Tested" and "Replaced with new"', () => {
    expect(hsUpdateOptions('tested').map((o) => o.label)).toEqual(['Tested', 'Replaced with new']);
  });
  it('first aid kit / eye wash / burns kit offer only "Replaced with new"', () => {
    expect(hsUpdateOptions('expiry').map((o) => o.label)).toEqual(['Replaced with new']);
  });
  it('fire extinguisher fields: "Date tested" (not "Service date") and an expiry 12 months on', () => {
    expect(hsUpdateFields('tested')).toEqual({ testedLabel: 'Date tested', expiryLabel: 'Expiry', months: 12 });
  });
  it('the other three: just "New expiry date", no service date, no auto-fill', () => {
    expect(hsUpdateFields('expiry')).toEqual({ testedLabel: null, expiryLabel: 'New expiry date', months: null });
  });
});

describe('hsUpdateInput: what is saved', () => {
  it('Tested: same extinguisher, date tested and expiry', () => {
    expect(hsUpdateInput('tested', 'tested', { testedDate: '2026-11-06', expiry: '2027-11-06' }))
      .toEqual({ ok: true, action: 'tested', testedDate: '2026-11-06', expiryDate: '2027-11-06' });
  });
  it('Replaced with new extinguisher: date tested and expiry too', () => {
    expect(hsUpdateInput('tested', 'replaced', { testedDate: '2026-11-06', expiry: '2027-11-06' }))
      .toEqual({ ok: true, action: 'replaced', testedDate: '2026-11-06', expiryDate: '2027-11-06' });
  });
  it('fire extinguisher needs the date tested', () => {
    expect(hsUpdateInput('tested', 'tested', { testedDate: null, expiry: '2027-11-06' })).toEqual({ ok: false, error: 'Enter the date tested.' });
  });
  it('every one needs an expiry', () => {
    expect(hsUpdateInput('tested', 'replaced', { testedDate: '2026-11-06', expiry: null })).toEqual({ ok: false, error: 'Enter the expiry date.' });
    expect(hsUpdateInput('expiry', 'replaced', { testedDate: null, expiry: null })).toEqual({ ok: false, error: 'Enter the new expiry date.' });
  });
  it('eye wash: only the new expiry, never a tested date', () => {
    expect(hsUpdateInput('expiry', 'replaced', { testedDate: '2026-11-06', expiry: '2028-03-01' }))
      .toEqual({ ok: true, action: 'replaced', testedDate: null, expiryDate: '2028-03-01' });
  });
  it('"Tested" is only for the fire extinguisher', () => {
    expect(hsUpdateInput('expiry', 'tested', { testedDate: null, expiry: '2028-03-01' })).toEqual({ ok: false, error: 'Only the fire extinguisher can be tested.' });
  });
});

describe('Add to lockup: dates are required for the 4', () => {
  it('fire extinguisher needs date tested and expiry', () => {
    expect(lockupDatesError('tested', null, '2027-11-06')).toBe('Enter the date tested.');
    expect(lockupDatesError('tested', '2026-11-06', null)).toBe('Enter the expiry date.');
    expect(lockupDatesError('tested', '2026-11-06', '2027-11-06')).toBeNull();
  });
  it('the other three need an expiry', () => {
    expect(lockupDatesError('expiry', null, null)).toBe('Enter the expiry date.');
    expect(lockupDatesError('expiry', null, '2028-03-01')).toBeNull();
  });
  it('items without dates need nothing', () => {
    expect(lockupDatesError(null, null, null)).toBeNull();
  });
});

type L = Parameters<typeof groupLockupLines>[0][number];
const ln = (o: Partial<L>): L => ({
  id: o.id ?? Math.random().toString(36).slice(2),
  section: 'hs',
  name: 'Eye wash',
  quantity: 1,
  sheet_order: 20,
  note: null,
  checklist_item_id: 'eye',
  low_at: null,
  tested_date: null,
  expiry_date: null,
  date_kind: 'expiry',
  is_test: true,
  ...o,
});

describe('Lockup lines by expiry: separate lines, merging on the same expiry', () => {
  const lines = [
    ln({ id: 'a', quantity: 6, expiry_date: '2028-03-01' }),
    ln({ id: 'b', quantity: 4, expiry_date: '2027-01-15' }),
    ln({ id: 'h', name: 'Hi vis', section: 'ppe', checklist_item_id: 'hiv', quantity: 9, date_kind: null, sheet_order: 10 }),
  ];
  it('stock with different expiries stays as separate lines under the item, oldest first', () => {
    const g = groupLockupLines(lines).find((x) => x.key === 'eye')!;
    expect(g.lines.map((l) => l.id)).toEqual(['b', 'a']);
    expect(g.total).toBe(10);
    expect(g.dateKind).toBe('expiry');
  });
  it('items without dates are a group of one line', () => {
    const g = groupLockupLines(lines).find((x) => x.key === 'hiv')!;
    expect(g.lines).toHaveLength(1);
    expect(g.total).toBe(9);
  });
  it('adding with the same expiry adds to that line', () => {
    expect(lineForExpiry(lines, 'eye', '2028-03-01')?.id).toBe('a');
  });
  it('a new expiry makes a new line', () => {
    expect(lineForExpiry(lines, 'eye', '2029-05-01')).toBeNull();
  });
  it('line label: "Eye wash · 6 · expires Mar 2028"', () => {
    expect(lockupLineLabel(lines[0])).toBe('Eye wash · 6 · expires Mar 2028');
  });
  it('fire extinguisher line label carries the date tested', () => {
    expect(lockupLineLabel(ln({ name: 'Fire ext 2KG dry powder', date_kind: 'tested', quantity: 2, tested_date: '2026-11-06', expiry_date: '2027-11-06' })))
      .toBe('Fire ext 2KG dry powder · 2 · tested 06 Nov 2026 · expires Nov 2027');
  });
});

describe('Low stock adds up all lines of the item', () => {
  it('two eye wash lines of 1 and 2, low at 4, are one low item with 3', () => {
    const low = lowStockLines([
      ln({ id: 'a', quantity: 1, low_at: 4, expiry_date: '2028-03-01' }),
      ln({ id: 'b', quantity: 2, low_at: 4, expiry_date: '2027-01-15' }),
    ]);
    expect(low).toHaveLength(1);
    expect(low[0].quantity).toBe(3);
  });
  it('6 + 4 = 10 is not low at 4, though one line alone would be', () => {
    expect(lowStockLines([
      ln({ id: 'a', quantity: 6, low_at: 4, expiry_date: '2028-03-01' }),
      ln({ id: 'b', quantity: 4, low_at: 4, expiry_date: '2027-01-15' }),
    ])).toHaveLength(0);
  });
});

describe('Issue to: which line, oldest expiry pre-selected, dates copied to the person', () => {
  const lines = [
    ln({ id: 'a', quantity: 6, expiry_date: '2028-03-01' }),
    ln({ id: 'b', quantity: 4, expiry_date: '2027-01-15' }),
    ln({ id: 'c', quantity: 0, expiry_date: '2026-12-01' }),
  ];
  it('offers the lines with stock, oldest expiry first (that one pre-selected)', () => {
    expect(issueLineOptions(lines).map((l) => l.id)).toEqual(['b', 'a']);
  });
  it('copies the line’s expiry onto the person’s record', () => {
    expect(issueCopiesDates(lines[1])).toEqual({ expiryDate: '2027-01-15', testedDate: null });
  });
  it('fire extinguisher copies the date tested too', () => {
    expect(issueCopiesDates(ln({ date_kind: 'tested', tested_date: '2026-11-06', expiry_date: '2027-11-06' })))
      .toEqual({ expiryDate: '2027-11-06', testedDate: '2026-11-06' });
  });
  it('items without dates copy nothing', () => {
    expect(issueCopiesDates(ln({ date_kind: null }))).toBeNull();
  });
});

describe('Needs attention: lockup lines expired or due within 30 days', () => {
  const today = '2026-11-06';
  const rows = lockupAttentionRows([
    ln({ id: 'old', quantity: 2, expiry_date: '2026-10-01' }),
    ln({ id: 'soon', quantity: 3, expiry_date: '2026-11-20' }),
    ln({ id: 'ok', quantity: 3, expiry_date: '2027-06-01' }),
    ln({ id: 'empty', quantity: 0, expiry_date: '2026-10-01' }),
  ], today);
  it('lists expired and due-soon lines that have stock', () => {
    expect(rows.map((r) => [r.item_id, r.expiry_status])).toEqual([['old', 'expired'], ['soon', 'due_soon']]);
  });
  it('they say Yard Lockup and how many', () => {
    expect(rows[0].source).toBe('lockup');
    expect(rows[0].quantity).toBe(2);
    expect(rows[1].days_left).toBe(14);
  });
});

describe('hsStartDates: what the date boxes start with', () => {
  it('fire extinguisher: tested today, expiry filled in 12 months on (changeable)', () => {
    expect(hsStartDates('tested', '2026-11-06')).toEqual({ serviceDate: '2026-11-06', expiry: '2027-11-06', expiryManual: false });
  });
  it('the other three start blank: the expiry is typed from the label', () => {
    expect(hsStartDates('expiry', '2026-11-06')).toEqual({ serviceDate: null, expiry: null, expiryManual: false });
  });
});
