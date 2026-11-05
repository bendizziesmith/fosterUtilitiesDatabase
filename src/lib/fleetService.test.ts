import { describe, it, expect, beforeEach, vi } from 'vitest';

type Call = { table?: string; rpc?: string; op: string; payload?: unknown; filters: unknown[][] };
const H = vi.hoisted(() => ({ calls: [] as Call[], rpcData: null as unknown, tableData: {} as Record<string, unknown[]> }));

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
    ['insert', 'update', 'upsert', 'delete', 'select', 'eq', 'is', 'order', 'limit', 'maybeSingle'].forEach((m) => (b[m] = chain(m)));
    b.then = (resolve: (r: unknown) => unknown) => resolve({ data: call.op === 'select' ? H.tableData[call.table as string] ?? [] : [], error: null });
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
        return Promise.resolve({ data: H.rpcData, error: null });
      },
      storage: {
        from: (bucket: string) => ({
          remove: (paths: string[]) => {
            H.calls.push({ table: `storage:${bucket}`, op: 'remove', payload: paths, filters: [] });
            return Promise.resolve({ data: [], error: null });
          },
        }),
      },
    },
  };
});

const svc = await import('./fleetService');
const wrote = (table: string) => H.calls.some((c) => c.table === table && c.op !== 'select');

describe('Take out of van', () => {
  beforeEach(() => { H.calls = []; H.rpcData = 3; });

  it('test mode: the kit stays with the van as spare-van kit, but employees is never written', async () => {
    const r = await svc.takeOutOfVan({ personId: 'e1', vehicleId: 'v1', note: null, testMode: true, actorId: 'a1' });
    expect(r.vanSaved).toBe(false);
    expect(H.calls[0]).toMatchObject({ rpc: 'kit_take_out_of_van', payload: { p_person_id: 'e1', p_vehicle_id: 'v1', p_is_test: true, p_actor_id: 'a1' } });
    expect(wrote('employees')).toBe(false);
    expect(wrote('vehicles')).toBe(false);
  });

  it('live mode: after the kit moves, the person is taken off the van', async () => {
    const r = await svc.takeOutOfVan({ personId: 'e1', vehicleId: 'v1', note: null, testMode: false, actorId: 'a1' });
    expect(r.vanSaved).toBe(true);
    const order = H.calls.map((c) => c.rpc ?? `${c.table}:${c.op}`);
    expect(order.indexOf('kit_take_out_of_van')).toBeLessThan(order.indexOf('employees:update'));
    const emp = H.calls.find((c) => c.table === 'employees');
    expect(emp?.payload).toEqual({ assigned_vehicle_id: null });
    expect(emp?.filters).toEqual([['eq', 'id', 'e1']]);
    expect(wrote('vehicles')).toBe(false);
  });
});

describe('Van off the road', () => {
  beforeEach(() => { H.calls = []; H.rpcData = 'status-1'; });

  it('sends the reason and where each item goes; vehicles is never written', async () => {
    await svc.vanOffRoad({ vehicleId: 'v1', reason: 'broken_down', note: 'gearbox', moves: [{ item_id: 'k1', to: 'spare' }], isTest: true, actorId: 'a1' });
    expect(H.calls[0]).toMatchObject({ rpc: 'kit_van_off_road', payload: { p_vehicle_id: 'v1', p_reason: 'broken_down', p_moves: [{ item_id: 'k1', to: 'spare' }], p_is_test: true } });
    expect(wrote('vehicles')).toBe(false);
    expect(wrote('employees')).toBe(false);
  });

  it('back on the road', async () => {
    await svc.vanBackOnRoad('v1', 'a1');
    expect(H.calls[0]).toMatchObject({ rpc: 'kit_van_back_on_road', payload: { p_vehicle_id: 'v1', p_actor_id: 'a1' } });
  });
});

describe('Edit / delete audits', () => {
  beforeEach(() => { H.calls = []; });

  it('edit sends only the changed fields with who did it', async () => {
    H.rpcData = ['Ear defenders N → Y'];
    const s = await svc.editAudit('au1', [{ line_id: 'l1', field: 'result', from: 'N', to: 'Y' }], 'a1');
    expect(s).toEqual(['Ear defenders N → Y']);
    expect(H.calls[0]).toMatchObject({ rpc: 'audit_edit', payload: { p_audit_id: 'au1', p_changes: [{ line_id: 'l1', field: 'result', to: 'Y' }], p_actor_id: 'a1' } });
  });

  it('delete removes the audit, then its photos from storage', async () => {
    H.rpcData = ['lines/a.jpg', 'lines/b.jpg'];
    H.tableData = {};
    await svc.deleteAudit('au1', 'Wrong gang', 'a1');
    expect(H.calls.map((c) => c.rpc ?? `${c.table}:${c.op}`)).toEqual(['audit_photos:select', 'audit_delete', 'storage:audit-photos:remove']);
    expect(H.calls[2].payload).toEqual(['lines/a.jpg', 'lines/b.jpg']);
  });

  it('round 9: delete also removes the standard and additional photos (not the "can\'t take photo" rows)', async () => {
    H.rpcData = ['lines/a.jpg'];
    H.tableData = { audit_photos: [{ path: 'photos/van.jpg' }, { path: null }, { path: 'photos/extra.jpg' }] };
    await svc.deleteAudit('au1', 'Wrong gang', 'a1');
    expect(H.calls.find((c) => c.op === 'remove')?.payload).toEqual(['lines/a.jpg', 'photos/van.jpg', 'photos/extra.jpg']);
    H.tableData = {};
  });
});

describe('Delete plant completely', () => {
  beforeEach(() => { H.calls = []; });

  it('deletes with the typed plant no, then its certificates from storage', async () => {
    H.rpcData = ['certificates/c.pdf'];
    await svc.deletePlant('k1', 'SS-203', 'a1');
    expect(H.calls[0]).toMatchObject({ rpc: 'kit_delete_item', payload: { p_item_id: 'k1', p_confirm: 'SS-203', p_actor_id: 'a1' } });
    expect(H.calls[1]).toMatchObject({ table: 'storage:audit-photos', op: 'remove', payload: ['certificates/c.pdf'] });
  });

  it('skips storage when there were no files', async () => {
    H.rpcData = [];
    await svc.deletePlant('k1', 'SS-203', 'a1');
    expect(H.calls.some((c) => c.table === 'storage:audit-photos')).toBe(false);
  });
});

describe('Audit interval setting', () => {
  beforeEach(() => { H.calls = []; });
  it('saves the interval on the settings row', async () => {
    await svc.setAuditInterval(6, 'Neil Foster');
    expect(H.calls[0]).toMatchObject({ table: 'audit_settings', op: 'update', payload: { audit_interval_months: 6, updated_by_name: 'Neil Foster' } });
  });
  it('refuses nonsense', async () => {
    await expect(svc.setAuditInterval(0, 'x')).rejects.toThrow('between 1 and 60');
  });
});
