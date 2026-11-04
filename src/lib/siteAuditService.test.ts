import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Contract tests for the Site Audit service: which table / function each
 * action hits and with what, using a recording Supabase stub.
 */
type Call = { table?: string; rpc?: string; op: string; payload?: unknown; filters: unknown[][] };
const H = vi.hoisted(() => ({ calls: [] as Call[] }));

vi.mock('./supabase', () => {
  const builder = (call: Call) => {
    const b: Record<string, unknown> = {};
    const chain = (op: string) => (...args: unknown[]) => {
      if (['insert', 'update', 'upsert', 'delete'].includes(op)) {
        call.op = op;
        call.payload = args[0];
      } else {
        call.filters.push([op, ...args]);
      }
      return b;
    };
    ['insert', 'update', 'upsert', 'delete', 'select', 'eq', 'in', 'order', 'limit', 'lte', 'maybeSingle', 'single']
      .forEach((m) => (b[m] = chain(m)));
    b.then = (resolve: (r: unknown) => unknown) =>
      resolve({ data: call.op === 'insert' && call.table === 'audit_site_audits' ? { id: 'new-audit' } : [], error: null });
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
        return Promise.resolve({ data: 'rpc-result', error: null });
      },
    },
  };
});

const svc = await import('./siteAuditService');

const header = {
  audit_date: '2026-11-04',
  audited_by: 'u1',
  audited_by_name: 'Admin',
  vehicle_id: 'v1',
  vehicle_reg_snapshot: 'YE24 TNL',
  ganger_id: 'e1',
  ganger_name_snapshot: 'Dom Oliver',
  team_name_snapshot: "D. Oliver's gang",
  site_visited: 'High St',
  notes: null,
  is_test: true,
};

describe('saveDraftAudit', () => {
  beforeEach(() => (H.calls = []));

  it('creates the audit, then writes members and lines against it', async () => {
    const id = await svc.saveDraftAudit(null, header,
      [{ name: 'Dom Oliver', employee_id: 'e1' }],
      [{ section: 'kit', item_name: 'Digger', result: 'not_carried', expiry_date: null, kit_type_id: 't2', key: 'k' }]);
    expect(id).toBe('new-audit');
    const audit = H.calls.find((c) => c.table === 'audit_site_audits' && c.op === 'insert');
    expect(audit?.payload).toMatchObject({ team_name_snapshot: "D. Oliver's gang", is_test: true, status: 'draft' });
    const members = H.calls.find((c) => c.table === 'audit_members' && c.op === 'insert');
    expect(members?.payload).toEqual([{ audit_id: 'new-audit', employee_id: 'e1', name: 'Dom Oliver', sort_order: 0 }]);
    const lines = H.calls.find((c) => c.table === 'audit_lines' && c.op === 'insert');
    const first = (lines?.payload as Record<string, unknown>[])[0];
    expect(first).toMatchObject({ audit_id: 'new-audit', section: 'kit', result: 'not_carried', kit_type_id: 't2' });
    expect(first).not.toHaveProperty('key');
    expect(first).not.toHaveProperty('notCarriedBefore');
  });

  it('replaces members and lines of an existing draft', async () => {
    await svc.saveDraftAudit('a1', header, [], []);
    const upd = H.calls.find((c) => c.table === 'audit_site_audits' && c.op === 'update');
    expect(upd?.filters).toContainEqual(['eq', 'id', 'a1']);
    expect(upd?.filters).toContainEqual(['eq', 'status', 'draft']);
    expect(H.calls.filter((c) => c.op === 'delete').map((c) => c.table).sort()).toEqual(['audit_lines', 'audit_members']);
  });
});

describe('RPC actions', () => {
  beforeEach(() => (H.calls = []));

  it('submitAudit calls audit_submit', async () => {
    await svc.submitAudit('a1');
    expect(H.calls[0]).toMatchObject({ rpc: 'audit_submit', payload: { p_audit_id: 'a1' } });
  });

  it('swapKit sends where the old item goes and what replaces it', async () => {
    await svc.swapKit({
      itemId: 'k1', destination: 'away_for_service', destVehicleId: null, serviceCompany: 'Speedy',
      replacement: 'spare', spareId: 'k2', newPlantNo: null, newServiceDate: null, newExpiryDate: null, note: 'x',
    });
    expect(H.calls[0]).toMatchObject({
      rpc: 'kit_swap',
      payload: { p_item_id: 'k1', p_destination: 'away_for_service', p_service_company: 'Speedy', p_replacement: 'spare', p_spare_id: 'k2' },
    });
  });

  it('updateAttentionItem uses the PPE function for PPE and the kit function for kit', async () => {
    await svc.updateAttentionItem({ source: 'ppe', itemId: 'p1', action: 'replaced', serviceDate: null, expiryDate: '2027-01-01', plantNo: null, certificatePath: null, note: null });
    await svc.updateAttentionItem({ source: 'kit', itemId: 'k1', action: 'reserviced', serviceDate: '2026-11-04', expiryDate: '2027-11-04', plantNo: null, certificatePath: null, note: 'ok' });
    expect(H.calls.map((c) => c.rpc)).toEqual(['audit_update_ppe', 'kit_update_item']);
    expect(H.calls[0].payload).toMatchObject({ p_ppe_id: 'p1', p_expiry_date: '2027-01-01' });
    expect(H.calls[1].payload).toMatchObject({ p_item_id: 'k1', p_action: 'reserviced' });
  });
});
