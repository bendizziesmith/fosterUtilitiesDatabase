import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { HavsTimesheetForm } from './HavsTimesheetForm';

// Shared mutable flag: false = no HAVS week exists for the week; a simulated create flips it true.
const state = vi.hoisted(() => ({ weekExists: false }));

const WEEK = '2026-07-19';

// Minimal chainable + awaitable Supabase query stub.
function query(result: unknown) {
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: () => builder,
    order: () => builder,
    maybeSingle: () => Promise.resolve(result),
    then: (resolve: (r: unknown) => unknown) => resolve(result),
  };
  return builder;
}

vi.mock('../../../lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'havs_weeks') {
        return query({
          data: state.weekExists
            ? { id: 'w1', ganger_id: 'e1', week_ending: WEEK, status: 'draft', revision_number: 0 }
            : null,
          error: null,
        });
      }
      if (table === 'havs_week_members') {
        return query({ data: [], error: null });
      }
      return query({ data: null, error: null });
    },
  },
}));

vi.mock('../../../lib/havsUtils', () => ({
  getEffectiveWeekEnding: () => Promise.resolve(WEEK),
  getViewableWeeks: () => Promise.resolve([]),
}));

vi.mock('./GangMemberSelector', () => ({
  GangMemberSelector: () => null,
}));

// Stub modal: creating a week flips the DB flag, then notifies the parent with the SAME week
// the user is already viewing — the exact scenario that triggers the stall.
vi.mock('./StartNewWeekModal', () => ({
  StartNewWeekModal: ({ onWeekCreated }: { onWeekCreated: (w: string) => void }) => (
    <button
      type="button"
      onClick={() => {
        state.weekExists = true;
        onWeekCreated(WEEK);
      }}
    >
      stub-create-week
    </button>
  ),
}));

const employee = { id: 'e1', full_name: 'Test Ganger' } as never;

describe('HavsTimesheetForm — new week loads without a remount', () => {
  beforeEach(() => {
    state.weekExists = false;
  });

  it('clears the "week not found" state after the week is created', async () => {
    render(<HavsTimesheetForm selectedEmployee={employee} onBack={() => {}} />);

    // The current week has no HAVS record yet.
    await screen.findByText('No HAVS Week Found');

    // Open the start-new-week modal and create the (same) week.
    fireEvent.click(screen.getByRole('button', { name: /Start New HAVS Week/i }));
    fireEvent.click(await screen.findByText('stub-create-week'));

    // The newly created week must load in place — the not-found state must clear.
    await waitFor(
      () => {
        expect(screen.queryByText('No HAVS Week Found')).toBeNull();
      },
      { timeout: 2000 }
    );
  });
});
