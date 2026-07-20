import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act, waitFor, cleanup } from '@testing-library/react';
import { HavsTimesheetForm } from './HavsTimesheetForm';

const WEEK = '2026-07-19';

// Records the supabase writes so tests can assert what/when was saved.
const H = vi.hoisted(() => ({
  calls: [] as Array<{ op: string; table?: string; name?: string }>,
}));

// Chainable + awaitable supabase query stub that records mutating operations.
function query(table: string, data: unknown) {
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: () => builder,
    order: () => builder,
    update: () => {
      H.calls.push({ op: 'update', table });
      return builder;
    },
    insert: () => {
      H.calls.push({ op: 'insert', table });
      return builder;
    },
    delete: () => {
      H.calls.push({ op: 'delete', table });
      return builder;
    },
    maybeSingle: () => Promise.resolve({ data, error: null }),
    then: (resolve: (r: unknown) => unknown) => resolve({ data, error: null }),
  };
  return builder;
}

vi.mock('../../../lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'havs_weeks') {
        return query(table, {
          id: 'w1',
          ganger_id: 'e1',
          week_ending: WEEK,
          status: 'draft',
          revision_number: 0,
        });
      }
      if (table === 'havs_week_members') {
        return query(table, [
          {
            id: 'm1',
            person_type: 'ganger',
            manual_name: 'Test Ganger',
            exposure_entries: [],
            comments: '',
            actions: '',
          },
        ]);
      }
      if (table === 'havs_exposure_entries') {
        return query(table, []);
      }
      return query(table, null);
    },
    rpc: (name: string) => {
      H.calls.push({ op: 'rpc', name });
      return Promise.resolve({
        data: { success: true, member_count: 1, total_minutes: 5 },
        error: null,
      });
    },
  },
}));

vi.mock('../../../lib/havsUtils', () => ({
  getEffectiveWeekEnding: () => Promise.resolve(WEEK),
  getViewableWeeks: () => Promise.resolve([]),
}));

vi.mock('./GangMemberSelector', () => ({ GangMemberSelector: () => null }));
vi.mock('./StartNewWeekModal', () => ({ StartNewWeekModal: () => null }));

const employee = { id: 'e1', full_name: 'Test Ganger' } as never;

// performSave writes havs_weeks.last_saved_at exactly once per run, so this counts save cycles.
const saveCount = () =>
  H.calls.filter((c) => c.op === 'update' && c.table === 'havs_weeks').length;

async function renderLoaded() {
  render(<HavsTimesheetForm selectedEmployee={employee} onBack={() => {}} />);
  await waitFor(() =>
    expect(screen.getAllByPlaceholderText('0').length).toBeGreaterThan(0)
  );
}

beforeEach(() => {
  H.calls = [];
  vi.stubGlobal('alert', vi.fn());
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('HavsTimesheetForm autosave', () => {
  it('schedules a debounced save on a change and fires it after ~1.5s (no button press)', async () => {
    await renderLoaded();

    // Fake only the debounce timers; the load above ran on real timers.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

    fireEvent.change(screen.getAllByPlaceholderText('0')[0], { target: { value: '5' } });
    expect(saveCount()).toBe(0); // nothing saved immediately

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });

    expect(saveCount()).toBe(1); // saved automatically after the debounce
  });

  it('coalesces rapid changes into a single save', async () => {
    await renderLoaded();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

    const inputs = screen.getAllByPlaceholderText('0');
    fireEvent.change(inputs[0], { target: { value: '5' } });
    fireEvent.change(inputs[1], { target: { value: '7' } });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });

    expect(saveCount()).toBe(1); // one write, not one per keystroke
  });

  it('flushes a pending save before submitting', async () => {
    await renderLoaded();

    // A change schedules a save; submit happens well within the debounce window.
    fireEvent.change(screen.getAllByPlaceholderText('0')[0], { target: { value: '5' } });

    fireEvent.click(screen.getByRole('button', { name: /for review/i })); // open confirm modal
    fireEvent.click(await screen.findByRole('button', { name: 'Submit' })); // confirm

    await waitFor(() => expect(H.calls.some((c) => c.op === 'rpc')).toBe(true));

    const saveIdx = H.calls.findIndex((c) => c.op === 'update' && c.table === 'havs_weeks');
    const rpcIdx = H.calls.findIndex((c) => c.op === 'rpc');
    expect(saveIdx).toBeGreaterThanOrEqual(0); // the pending edit was saved (flushed)
    expect(saveIdx).toBeLessThan(rpcIdx); // and it saved before the submit RPC
  });
});
