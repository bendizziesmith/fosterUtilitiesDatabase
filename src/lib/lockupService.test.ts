import { describe, it, expect, beforeEach, vi } from 'vitest';

type Call = { table?: string; rpc?: string; op: string; payload?: unknown; filters: unknown[][] };
const H = vi.hoisted(() => ({ calls: [] as Call[] }));

vi.mock('./supabase', () => {
  const builder = (call: Call) => {
    const b: Record<string, unknown> = {};
    const chain = (op: string) => (...args: unknown[]) => {
      if (['insert', 'update', 'upsert', 'delete'].includes(op)) {
        call.op = op;
        call.payload = args[0];
      } else call.filters.push([op, ...args]);
      return b;
    };
    ['insert', 'update', 'upsert', 'delete', 'select', 'eq', 'in', 'order', 'gt'].forEach((m) => (b[m] = chain(m)));
    b.then = (resolve: (r: unknown) => unknown) => resolve({ data: [], error: null });
    return b;
  };
  return {
    supabase: {
      from: (table: string) => {
        const call: Call = { table, op: 'select', filters: [] };
        H.calls.push(call);
        return builder(call);
      },
      rpc: (fn: string, args: unknown) => {
        H.calls.push({ rpc: fn, op: 'rpc', payload: args, filters: [] });
        return Promise.resolve({ data: 7, error: null });
      },
    },
  };
});

const svc = await import('./lockupService');

describe('Yard Lockup service', () => {
  beforeEach(() => (H.calls = []));

  it('adds an audit-sheet item to the lockup, test-marked, with who did it', async () => {
    await svc.addToLockup({ section: 'ppe', checklistItemId: 'c-hat', customName: null, quantity: 12, note: 'M/L', isTest: true, actorId: 'a1' });
    expect(H.calls[0]).toMatchObject({ rpc: 'kit_lockup_add', payload: { p_section: 'ppe', p_checklist_item_id: 'c-hat', p_custom_name: null, p_quantity: 12, p_is_test: true, p_actor_id: 'a1' } });
  });

  it('quick count sends a + / − change', async () => {
    await svc.adjustLockup('s1', -1, 'a1');
    expect(H.calls[0]).toMatchObject({ rpc: 'kit_lockup_adjust', payload: { p_stock_id: 's1', p_delta: -1, p_actor_id: 'a1' } });
  });

  it('issuing sends the person, quantity and date on hat', async () => {
    await svc.issueFromLockup({ stockId: 's1', employeeId: 'e1', quantity: 2, dateOnHat: '2026-11-05', note: null, actorId: 'a1' });
    expect(H.calls[0]).toMatchObject({ rpc: 'kit_lockup_issue', payload: { p_stock_id: 's1', p_employee_id: 'e1', p_quantity: 2, p_date_on_hat: '2026-11-05' } });
  });

  it('returning sends the person and quantity', async () => {
    await svc.returnToLockup({ stockId: 's1', employeeId: 'e1', quantity: 1, note: null, actorId: 'a1' });
    expect(H.calls[0]).toMatchObject({ rpc: 'kit_lockup_return', payload: { p_stock_id: 's1', p_employee_id: 'e1', p_quantity: 1 } });
  });

  it('refuses before calling the database when the count would go below 0', async () => {
    await expect(svc.adjustLockupChecked({ id: 's1', quantity: 0 }, -1, 'a1')).rejects.toThrow('Only 0 in the Yard Lockup');
    expect(H.calls).toEqual([]);
  });

  it('saves a note on the line itself', async () => {
    await svc.setLockupNote('s1', ' sizes S–XL ');
    expect(H.calls[0]).toMatchObject({ table: 'kit_lockup_stock', op: 'update', payload: { note: 'sizes S–XL' } });
    expect(H.calls[0].filters).toContainEqual(['eq', 'id', 's1']);
  });

  it('never touches employees', async () => {
    await svc.issueFromLockup({ stockId: 's1', employeeId: 'e1', quantity: 1, dateOnHat: null, note: null, actorId: 'a1' });
    expect(H.calls.some((c) => c.table === 'employees')).toBe(false);
  });

  it('saves "Low at" on the line, and blank clears the warning', async () => {
    await svc.setLockupLowAt('s1', 5);
    await svc.setLockupLowAt('s1', null);
    expect(H.calls.map((c) => [c.table, c.op, c.payload])).toEqual([
      ['kit_lockup_stock', 'update', { low_at: 5 }],
      ['kit_lockup_stock', 'update', { low_at: null }],
    ]);
  });

  it('adds a dated H&S item with its date tested and expiry (round 15)', async () => {
    await svc.addToLockup({ section: 'hs', checklistItemId: 'c-fire', customName: null, quantity: 2, note: null, isTest: true, actorId: 'a1', testedDate: '2026-11-06', expiryDate: '2027-11-06' });
    expect(H.calls[0]).toMatchObject({ rpc: 'kit_lockup_add', payload: { p_checklist_item_id: 'c-fire', p_tested_date: '2026-11-06', p_expiry_date: '2027-11-06', p_is_test: true } });
  });

  it('returns a dated item with the dates it is asked for', async () => {
    await svc.returnDatedToLockup({ stockId: 's1', employeeId: 'e1', quantity: 1, testedDate: null, expiryDate: '2028-03-01', note: null, actorId: 'a1' });
    expect(H.calls[0]).toMatchObject({ rpc: 'kit_lockup_return_dated', payload: { p_stock_id: 's1', p_employee_id: 'e1', p_quantity: 1, p_tested_date: null, p_expiry_date: '2028-03-01' } });
  });

  it('one "Low at" for an item kept as several lines: set on every line', async () => {
    await svc.setLockupLowAt(['s1', 's2'], 4);
    expect(H.calls[0]).toMatchObject({ table: 'kit_lockup_stock', op: 'update', payload: { low_at: 4 } });
    expect(H.calls[0].filters).toContainEqual(['in', 'id', ['s1', 's2']]);
  });

  it('refuses a negative "Low at" before calling the database', async () => {
    await expect(svc.setLockupLowAt('s1', -1)).rejects.toThrow('0 or more');
    expect(H.calls).toEqual([]);
  });
});
