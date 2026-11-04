import { describe, it, expect, beforeEach, vi } from 'vitest';

/** The van change must never write the live employees table in test mode. */
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
    ['insert', 'update', 'upsert', 'delete', 'select', 'eq'].forEach((m) => (b[m] = chain(m)));
    b.then = (resolve: (r: unknown) => unknown) => resolve({ data: null, error: null });
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
        return Promise.resolve({ data: null, error: null });
      },
    },
  };
});

const { changeVan } = await import('./vanChangeService');

const input = {
  personId: 'e1',
  oldVehicleId: 'v-old',
  newVehicleId: 'v-new',
  moves: [{ itemId: 'k1', to: 'new_van' as const }],
  note: 'Van change',
};

describe('changeVan', () => {
  beforeEach(() => (H.calls = []));

  it('in test mode moves the kit but never writes employees', async () => {
    const r = await changeVan({ ...input, testMode: true });
    expect(r.vanSaved).toBe(false);
    expect(H.calls.some((c) => c.table === 'employees')).toBe(false);
    expect(H.calls[0]).toMatchObject({
      rpc: 'kit_change_van',
      payload: { p_old_vehicle_id: 'v-old', p_new_vehicle_id: 'v-new', p_moves: [{ item_id: 'k1', to: 'new_van' }], p_is_test: true },
    });
  });

  it('in test mode does not record the person’s van either (it did not change)', async () => {
    await changeVan({ ...input, testMode: true });
    expect(H.calls.some((c) => c.table === 'kit_person_vans')).toBe(false);
  });

  it('in live mode updates employees.assigned_vehicle_id for that person only, after the kit moves', async () => {
    const r = await changeVan({ ...input, testMode: false });
    expect(r.vanSaved).toBe(true);
    const order = H.calls.map((c) => c.rpc ?? `${c.table}:${c.op}`);
    expect(order.indexOf('kit_change_van')).toBeLessThan(order.indexOf('employees:update'));
    const emp = H.calls.find((c) => c.table === 'employees');
    expect(emp?.payload).toEqual({ assigned_vehicle_id: 'v-new' });
    expect(emp?.filters).toEqual([['eq', 'id', 'e1']]);
  });

  it('in live mode remembers the van so an old-way change can be spotted later', async () => {
    await changeVan({ ...input, testMode: false });
    const rec = H.calls.find((c) => c.table === 'kit_person_vans');
    expect(rec).toMatchObject({ op: 'upsert', payload: { employee_id: 'e1', vehicle_id: 'v-new' } });
  });

  it('skips the employees write when the van was already changed in Employee Management', async () => {
    await changeVan({ ...input, testMode: false, assignmentAlreadyDone: true });
    expect(H.calls.some((c) => c.table === 'employees')).toBe(false);
    expect(H.calls.some((c) => c.table === 'kit_person_vans')).toBe(true);
  });
});

const { recordAllPersonVans } = await import('./vanChangeService');

describe('recordAllPersonVans', () => {
  beforeEach(() => (H.calls = []));

  it('records every person’s current van in one database call, test-marked in a local build', async () => {
    await recordAllPersonVans(true);
    expect(H.calls).toEqual([{ rpc: 'kit_record_person_vans', op: 'rpc', payload: { p_is_test: true }, filters: [] }]);
  });
  it('never writes employees', async () => {
    await recordAllPersonVans(false);
    expect(H.calls.some((c) => c.table === 'employees')).toBe(false);
  });
});
