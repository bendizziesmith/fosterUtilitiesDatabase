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
      storage: {
        from: (bucket: string) => ({
          remove: (paths: string[]) => {
            H.calls.push({ table: `storage:${bucket}`, op: 'remove', payload: paths, filters: [] });
            return Promise.resolve({ data: [], error: null });
          },
        }),
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
  holder_employee_id: 'e1',
  auditor_id: 'a1',
  auditor_name: 'Christina Pearson',
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
    expect(audit?.payload).toMatchObject({ team_name_snapshot: "D. Oliver's gang", is_test: true, status: 'draft', holder_employee_id: 'e1', auditor_name: 'Christina Pearson' });
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
    expect(H.calls.filter((c) => c.op === 'delete').map((c) => c.table).sort()).toEqual(['audit_lines', 'audit_members', 'audit_photos']);
  });

  it('round 12: Save draft sends exactly the dates on screen (edited, auto-filled, or cleared)', async () => {
    H.calls = [];
    await svc.saveDraftAudit('a1', header, [], [
      { section: 'kit', item_name: 'Floor saw', kit_type_id: 't-f', kit_item_id: 'k-f', result: 'Y', plant_no_snapshot: '1654', service_date: '2026-12-05', expiry_date: '2027-12-05', expiryManual: false },
      { section: 'kit', item_name: 'Breaker', kit_type_id: 't-b', kit_item_id: 'k-b', result: 'Y', plant_no_snapshot: '166456', service_date: '2025-11-28', expiry_date: null },
      { section: 'hs', item_name: 'Fire ext 2KG dry powder', checklist_item_id: 'c-fire', result: 'Y', service_date: '2026-11-04', expiry_date: '2027-11-04', gauge: 'green' },
    ]);
    const ins = H.calls.find((c) => c.table === 'audit_lines' && c.op === 'insert')!;
    expect((ins.payload as Record<string, unknown>[]).map((r) => [r.item_name, r.service_date, r.expiry_date])).toEqual([
      ['Floor saw', '2026-12-05', '2027-12-05'],
      ['Breaker', '2025-11-28', null],
      ['Fire ext 2KG dry powder', '2026-11-04', '2027-11-04'],
    ]);
    // the local-only "typed by hand" flag is never sent
    expect((ins.payload as Record<string, unknown>[]).some((r) => 'expiryManual' in r)).toBe(false);
  });

  it('Fosters | Hire: Save draft sends each kit line’s choice (audit → kit item on submit)', async () => {
    H.calls = [];
    await svc.saveDraftAudit('a1', header, [], [
      { section: 'kit', item_name: 'CAT', kit_type_id: 't-c', kit_item_id: 'k-c', result: 'Y', plant_no_snapshot: '1234', expiry_date: null, ownership: 'hire' },
      { section: 'kit', item_name: 'Digger', kit_type_id: 't-d', kit_item_id: null, result: 'Y', plant_no_snapshot: 'D1', expiry_date: null, ownership: 'fosters' },
      { section: 'ppe', item_name: 'Hard hats', checklist_item_id: 'c-hat', result: 'Y', expiry_date: null },
    ]);
    const ins = H.calls.find((c) => c.table === 'audit_lines' && c.op === 'insert')!;
    expect((ins.payload as Record<string, unknown>[]).map((r) => [r.item_name, r.ownership])).toEqual([
      ['CAT', 'hire'], ['Digger', 'fosters'], ['Hard hats', null],
    ]);
  });

  it('Fosters | Hire: set on a kit item outside an audit (Add kit, Swap → Add new, Update, Yard Lockup)', async () => {
    H.calls = [];
    await svc.setKitOwnership('k-1', 'hire');
    expect(H.calls[0]).toMatchObject({ table: 'kit_items', op: 'update', payload: { ownership: 'hire' } });
    expect(H.calls[0].filters).toContainEqual(['eq', 'id', 'k-1']);
  });

  it('round 9: Save draft keeps the photos already uploaded (slot photos, reasons, additional with caption)', async () => {
    H.calls = [];
    await svc.saveDraftAudit('a1', header, [], [], [
      { slot_id: 's1', slot_name: 'Van & reg', path: 'photos/van.jpg', caption: null, skip_reason: 'ignored', taken_at: '2026-11-05T14:32:00Z', sort_order: 0 },
      { slot_id: 's2', slot_name: 'Van open', path: null, caption: null, skip_reason: ' Van locked ', taken_at: null, sort_order: 0 },
      { slot_id: 's3', slot_name: 'CAT', path: null, caption: null, skip_reason: '', taken_at: null, sort_order: 0 },
      { slot_id: null, slot_name: null, path: 'photos/extra.jpg', caption: ' Broken step ', skip_reason: null, taken_at: '2026-11-05T14:40:00Z', sort_order: 0 },
    ]);
    const ins = H.calls.find((c) => c.table === 'audit_photos' && c.op === 'insert')!;
    expect(ins.payload).toEqual([
      { audit_id: 'a1', slot_id: 's1', slot_name: 'Van & reg', path: 'photos/van.jpg', caption: null, skip_reason: null, taken_at: '2026-11-05T14:32:00Z', sort_order: 0, is_test: header.is_test },
      { audit_id: 'a1', slot_id: 's2', slot_name: 'Van open', path: null, caption: null, skip_reason: 'Van locked', taken_at: null, sort_order: 1, is_test: header.is_test },
      { audit_id: 'a1', slot_id: null, slot_name: null, path: 'photos/extra.jpg', caption: 'Broken step', skip_reason: null, taken_at: '2026-11-05T14:40:00Z', sort_order: 2, is_test: header.is_test },
    ]);
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
      itemId: 'k1', destination: 'away_for_service', destHolderEmployeeId: null, destVehicleId: null, serviceCompany: 'Speedy',
      replacement: 'spare', spareId: 'k2', newPlantNo: null, newServiceDate: null, newExpiryDate: null, note: 'x', actorId: 'a1',
    });
    expect(H.calls[0]).toMatchObject({
      rpc: 'kit_swap',
      payload: { p_item_id: 'k1', p_destination: 'away_for_service', p_service_company: 'Speedy', p_replacement: 'spare', p_spare_id: 'k2', p_actor_id: 'a1' },
    });
  });

  it('swapKit to another person sends the person, not a van', async () => {
    await svc.swapKit({
      itemId: 'k1', destination: 'holder', destHolderEmployeeId: 'e9', destVehicleId: null, serviceCompany: null,
      replacement: 'none', spareId: null, newPlantNo: null, newServiceDate: null, newExpiryDate: null, note: null, actorId: 'a1',
    });
    expect(H.calls[0].payload).toMatchObject({ p_destination: 'holder', p_dest_holder_employee_id: 'e9', p_dest_vehicle_id: null });
  });

  it('updateAttentionItem uses the PPE function for PPE and the kit function for kit', async () => {
    await svc.updateAttentionItem({ source: 'ppe', itemId: 'p1', action: 'replaced', serviceDate: null, expiryDate: '2027-01-01', plantNo: null, certificatePath: null, note: null, actorId: 'a1' });
    await svc.updateAttentionItem({ source: 'kit', itemId: 'k1', action: 'reserviced', serviceDate: '2026-11-04', expiryDate: '2027-11-04', plantNo: null, certificatePath: null, note: 'ok', actorId: 'a2' });
    expect(H.calls.map((c) => c.rpc)).toEqual(['audit_update_ppe', 'kit_update_item']);
    expect(H.calls[0].payload).toMatchObject({ p_ppe_id: 'p1', p_expiry_date: '2027-01-01', p_actor_id: 'a1' });
    expect(H.calls[1].payload).toMatchObject({ p_item_id: 'k1', p_action: 'reserviced', p_actor_id: 'a2' });
  });

  it('addKit to a person sends the person; to a spare van sends the van', async () => {
    const base = { kitTypeId: 't', plantNo: 'P', serviceDate: null, expiryDate: null, status: 'on_van' as const, serviceCompany: null, notes: null, isTest: true, actorId: 'a1' };
    await svc.addKit({ ...base, holderEmployeeId: 'e1', vehicleId: null });
    await svc.addKit({ ...base, holderEmployeeId: null, vehicleId: 'v2' });
    expect(H.calls[0].payload).toMatchObject({ p_holder_employee_id: 'e1', p_vehicle_id: null, p_actor_id: 'a1' });
    expect(H.calls[1].payload).toMatchObject({ p_holder_employee_id: null, p_vehicle_id: 'v2' });
  });

  it('moveKit sends the holder and who did it', async () => {
    await svc.moveKit({ itemId: 'k1', status: 'on_van', holderEmployeeId: 'e1', vehicleId: null, serviceCompany: null, note: null, actorId: 'a3' });
    expect(H.calls[0]).toMatchObject({ rpc: 'kit_move_item', payload: { p_item_id: 'k1', p_status: 'on_van', p_holder_employee_id: 'e1', p_vehicle_id: null, p_actor_id: 'a3' } });
  });
});

describe('deleteAuditFile', () => {
  beforeEach(() => (H.calls = []));

  it('removes the file from the audit-photos bucket, then records who deleted it', async () => {
    await svc.deleteAuditFile('lines/a.jpg', true, { id: 'a1', name: 'Neil Foster' });
    expect(H.calls.map((c) => [c.table, c.op])).toEqual([
      ['storage:audit-photos', 'remove'],
      ['audit_file_deletions', 'insert'],
    ]);
    expect(H.calls[0].payload).toEqual(['lines/a.jpg']);
    expect(H.calls[1].payload).toEqual({ path: 'lines/a.jpg', is_test: true, actor_id: 'a1', actor_name: 'Neil Foster' });
  });

  it('never touches the audit line itself', async () => {
    await svc.deleteAuditFile('lines/a.jpg', false, { id: 'a1', name: 'Neil Foster' });
    expect(H.calls.some((c) => c.table === 'audit_lines')).toBe(false);
  });
});

describe('createKitType', () => {
  beforeEach(() => (H.calls = []));

  it('saves the service interval with the new type', async () => {
    await svc.createKitType(' Water pump ', 6);
    const ins = H.calls.find((c) => c.table === 'kit_types' && c.op === 'insert');
    expect(ins?.payload).toMatchObject({ name: 'Water pump', service_interval_months: 6 });
  });
});

describe('round 14: recording audit downloads', () => {
  it('one row per audit, with who and the kind (single / zip), test-marked in a local build', async () => {
    H.calls = [];
    await svc.recordDownloads(['a1', 'a2'], { id: 'act1', name: 'Christina Pearson' }, 'zip', true);
    const ins = H.calls.find((c) => c.table === 'audit_downloads' && c.op === 'insert')!;
    expect(ins.payload).toEqual([
      { audit_id: 'a1', actor_id: 'act1', actor_name: 'Christina Pearson', kind: 'zip', is_test: true },
      { audit_id: 'a2', actor_id: 'act1', actor_name: 'Christina Pearson', kind: 'zip', is_test: true },
    ]);
    expect(H.calls.some((c) => c.table === 'audit_site_audits' && c.op !== 'select')).toBe(false);
  });
  it('nothing downloaded: nothing written', async () => {
    H.calls = [];
    await svc.recordDownloads([], null, 'zip', true);
    expect(H.calls.length).toBe(0);
  });
});
