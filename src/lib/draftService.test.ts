import { describe, it, expect, beforeEach, vi } from 'vitest';

type Call = { table?: string; op: string; payload?: unknown; filters: unknown[][] };
const H = vi.hoisted(() => ({ calls: [] as Call[], data: {} as Record<string, unknown[]> }));

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
    ['insert', 'update', 'upsert', 'delete', 'select', 'eq', 'is', 'not', 'order', 'limit'].forEach((m) => (b[m] = chain(m)));
    b.then = (resolve: (r: unknown) => unknown) => resolve({ data: call.op === 'select' ? H.data[call.table as string] ?? [] : [], error: null });
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
    },
  };
});

const svc = await import('./draftService');

beforeEach(() => {
  H.calls = [];
  H.data = {};
});

describe('Discard draft', () => {
  it('deletes only a draft (never a submitted audit) and removes its photos', async () => {
    H.data.audit_lines = [{ photo_path: 'lines/a.jpg' }, { photo_path: null }];
    await svc.discardDraft('d1');
    const del = H.calls.find((c) => c.table === 'audit_site_audits' && c.op === 'delete')!;
    expect(del.filters).toContainEqual(['eq', 'id', 'd1']);
    expect(del.filters).toContainEqual(['eq', 'status', 'draft']);
    expect(H.calls.find((c) => c.op === 'remove')?.payload).toEqual(['lines/a.jpg']);
  });
  it('no photos = no storage call', async () => {
    await svc.discardDraft('d2');
    expect(H.calls.some((c) => c.op === 'remove')).toBe(false);
  });
  it('never writes employees or vehicles', async () => {
    H.data.audit_lines = [{ photo_path: 'lines/a.jpg' }];
    await svc.discardDraft('d1');
    expect(H.calls.some((c) => (c.table === 'employees' || c.table === 'vehicles') && c.op !== 'select')).toBe(false);
  });
});
