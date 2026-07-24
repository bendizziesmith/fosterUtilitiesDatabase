import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Contract guard (not a red-first TDD test): updateJobRow spreads `...updates`, so these
 * assertions already held before `notes` was added to its type — the change there was
 * type-level, enforced by tsc. This locks the runtime contract so a future refactor that
 * replaced the spread with an explicit field whitelist would fail loudly instead of
 * silently dropping the note.
 */
const H = vi.hoisted(() => ({
  calls: [] as Array<{ table: string; payload: Record<string, unknown>; eq: string[][] }>,
}));

vi.mock('./supabase', () => ({
  supabase: {
    from: (table: string) => {
      const record = { table, payload: {} as Record<string, unknown>, eq: [] as string[][] };
      const builder: Record<string, unknown> = {
        update: (payload: Record<string, unknown>) => {
          record.payload = payload;
          H.calls.push(record);
          return builder;
        },
        eq: (column: string, value: string) => {
          record.eq.push([column, value]);
          return builder;
        },
        then: (resolve: (r: unknown) => unknown) => resolve({ data: null, error: null }),
      };
      return builder;
    },
  },
}));

const { updateJobRow } = await import('./timesheetService');

describe('updateJobRow — notes', () => {
  beforeEach(() => {
    H.calls = [];
  });

  it('persists a note against the job row', async () => {
    await updateJobRow('row-1', { notes: 'Gate locked - call site manager' });
    const call = H.calls[0];
    expect(call.table).toBe('timesheet_job_rows');
    expect(call.payload.notes).toBe('Gate locked - call site manager');
    expect(call.eq).toContainEqual(['id', 'row-1']);
  });

  it('persists a cleared note as null', async () => {
    await updateJobRow('row-1', { notes: null });
    expect(H.calls[0].payload.notes).toBeNull();
  });
});
