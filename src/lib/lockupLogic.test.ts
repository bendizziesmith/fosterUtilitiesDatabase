import { describe, it, expect } from 'vitest';
import { applyStockDelta, sortLockup, netIssued, issuedSince, lockupExpiryFromHat, type LockupLine, type LockupMovement } from './lockupLogic';

describe('applyStockDelta — the lockup count can never go below 0', () => {
  it('adds and takes off', () => {
    expect(applyStockDelta(5, 3)).toEqual({ ok: true, quantity: 8 });
    expect(applyStockDelta(5, -5)).toEqual({ ok: true, quantity: 0 });
  });
  it('refuses to go below 0 with a clear message', () => {
    expect(applyStockDelta(2, -3)).toEqual({ ok: false, quantity: 2, error: 'Only 2 in the Yard Lockup, so 3 can’t be taken out.' });
  });
  it('refuses whole-number nonsense', () => {
    expect(applyStockDelta(2, 1.5).ok).toBe(false);
    expect(applyStockDelta(2, 0).ok).toBe(false);
  });
});

const line = (over: Partial<LockupLine>): LockupLine => ({
  id: Math.random().toString(), section: 'ppe', name: 'X', quantity: 1, sheet_order: 0, note: null, checklist_item_id: null, ...over,
});

describe('sortLockup', () => {
  const lines = [
    line({ name: 'Mark up sprays', section: 'hs', sheet_order: 80, quantity: 6 }),
    line({ name: 'Hi vis', section: 'ppe', sheet_order: 10, quantity: 20 }),
    line({ name: 'Fuel cans', section: 'other', sheet_order: 30, quantity: 4 }),
    line({ name: 'Hard hats', section: 'ppe', sheet_order: 30, quantity: 12 }),
    line({ name: 'Eye wash', section: 'hs', sheet_order: 20, quantity: 10 }),
    line({ name: 'Ear plugs (custom)', section: 'ppe', sheet_order: 1000, quantity: 0 }),
  ];
  const names = (xs: LockupLine[]) => xs.map((x) => x.name);

  it('defaults to the audit sheet order: PPE → H&S → Other, sheet order inside, custom lines last', () => {
    expect(names(sortLockup(lines, 'sheet'))).toEqual(['Hi vis', 'Hard hats', 'Ear plugs (custom)', 'Eye wash', 'Mark up sprays', 'Fuel cans']);
  });
  it('sorts by name inside each section', () => {
    expect(names(sortLockup(lines, 'name'))).toEqual(['Ear plugs (custom)', 'Hard hats', 'Hi vis', 'Eye wash', 'Mark up sprays', 'Fuel cans']);
  });
  it('sorts by quantity, lowest first, inside each section', () => {
    expect(names(sortLockup(lines, 'quantity'))).toEqual(['Ear plugs (custom)', 'Hard hats', 'Hi vis', 'Mark up sprays', 'Eye wash', 'Fuel cans']);
  });
});

const mv = (over: Partial<LockupMovement>): LockupMovement => ({
  id: Math.random().toString(), stock_id: 's-hat', checklist_item_id: 'c-hat', item_name: 'Hard hats', kind: 'issued',
  quantity: 1, employee_id: 'e1', created_at: '2026-11-05T09:00:00Z', ...over,
});

describe('netIssued — what a person still holds from the lockup', () => {
  it('issued minus returned, per line', () => {
    const net = netIssued([
      mv({ quantity: 3 }),
      mv({ kind: 'returned', quantity: 1 }),
      mv({ stock_id: 's-vis', checklist_item_id: 'c-vis', item_name: 'Hi vis', quantity: 2 }),
      mv({ employee_id: 'e2', quantity: 5 }),
      mv({ kind: 'added', employee_id: null, quantity: 10 }),
    ], 'e1');
    expect(net).toEqual([
      { stock_id: 's-hat', item_name: 'Hard hats', checklist_item_id: 'c-hat', quantity: 2 },
      { stock_id: 's-vis', item_name: 'Hi vis', checklist_item_id: 'c-vis', quantity: 2 },
    ]);
  });
  it('drops lines fully returned', () => {
    expect(netIssued([mv({ quantity: 2 }), mv({ kind: 'returned', quantity: 2 })], 'e1')).toEqual([]);
  });
});

describe('issuedSince — "Issued since last audit" under the audit lines', () => {
  const moves = [
    mv({ quantity: 2, created_at: '2026-11-01T09:00:00Z' }),
    mv({ quantity: 1, created_at: '2026-11-05T09:00:00Z' }),
    mv({ kind: 'returned', quantity: 1, created_at: '2026-11-05T10:00:00Z' }),
    mv({ checklist_item_id: 'c-vis', quantity: 4, created_at: '2026-11-04T09:00:00Z' }),
  ];
  it('totals issues (net of returns) per sheet item since the last audit', () => {
    const m = issuedSince(moves, 'e1', '2026-11-03T00:00:00Z');
    expect(m.get('c-hat')).toBe(0);
    expect(m.get('c-vis')).toBe(4);
  });
  it('counts everything when there was no audit before', () => {
    expect(issuedSince(moves, 'e1', null).get('c-hat')).toBe(2);
  });
});

describe('lockupExpiryFromHat — issuing a dated hard hat updates the person’s PPE expiry', () => {
  it('is the date on the hat + the interval', () => {
    expect(lockupExpiryFromHat('2026-11-05', 36)).toBe('2029-11-05');
  });
  it('is nothing without a date or an interval', () => {
    expect(lockupExpiryFromHat(null, 36)).toBeNull();
    expect(lockupExpiryFromHat('2026-11-05', null)).toBeNull();
  });
});
