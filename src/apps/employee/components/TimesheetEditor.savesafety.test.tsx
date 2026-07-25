import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act, waitFor, cleanup } from '@testing-library/react';
import * as svc from '../../../lib/timesheetService';
import { TimesheetEditor } from './TimesheetEditor';

vi.mock('../../../lib/timesheetService', () => ({
  loadTimesheetForWeek: vi.fn(),
  createTimesheetWeek: vi.fn(),
  saveTimesheetHeader: vi.fn(() => Promise.resolve()),
  addJobRow: vi.fn(),
  updateJobRow: vi.fn(() => Promise.resolve()),
  deleteJobRow: vi.fn(() => Promise.resolve()),
  deleteDayEntry: vi.fn(() => Promise.resolve()),
  upsertDayEntry: vi.fn(() => Promise.resolve()),
  recalculateWeeklyTotal: vi.fn(() => Promise.resolve(0)),
  submitTimesheet: vi.fn(() => Promise.resolve()),
}));

const employee = { id: 'e1', full_name: 'ben' } as never;

const fixture = () => ({
  id: 'ts1',
  ganger_employee_id: 'e1',
  week_ending: '2026-07-26',
  status: 'draft',
  ganger_name_snapshot: 'ben',
  vehicle_id: null,
  vehicle_registration_snapshot: null,
  labourer_1_name: null,
  labourer_2_name: null,
  weekly_notes: null,
  weekly_total_hours: 0,
  submitted_at: null,
  returned_at: null,
  returned_reason: null,
  submission_count: 0,
  created_at: '',
  updated_at: '',
  job_rows: [
    {
      id: 'row1',
      timesheet_week_id: 'ts1',
      sort_order: 0,
      job_number: 'J-1',
      job_address: 'Norwich',
      default_start_time: null,
      default_finish_time: null,
      notes: null,
      pw_trench_verge: null,
      pw_trench_footway: null,
      pw_trench_carriageway: null,
      pw_joint_verge: null,
      pw_joint_footway: null,
      pw_joint_carriageway: null,
      created_at: '',
      updated_at: '',
      day_entries: [],
    },
  ],
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(svc.loadTimesheetForWeek).mockResolvedValue(fixture() as never);
  vi.mocked(svc.saveTimesheetHeader).mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

async function renderLoaded() {
  const utils = render(<TimesheetEditor employee={employee} weekEnding="2026-07-26" onBack={() => {}} />);
  await waitFor(() => expect(screen.getByPlaceholderText('e.g. J-1234')).toBeTruthy());
  return utils;
}

describe('TimesheetEditor save safety', () => {
  it('flushes a pending save when the editor unmounts (navigate away within the debounce)', async () => {
    const { unmount } = await renderLoaded();
    const saveHeader = vi.mocked(svc.saveTimesheetHeader);
    saveHeader.mockClear();

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    fireEvent.change(screen.getByPlaceholderText('e.g. J-1234'), { target: { value: 'J-99' } });
    expect(saveHeader).not.toHaveBeenCalled(); // debounce still pending

    await act(async () => {
      unmount();
      for (let i = 0; i < 6; i++) await Promise.resolve();
    });

    expect(saveHeader).toHaveBeenCalled(); // the pending edit was flushed, not dropped
  });

  it('serialises saves so a second edit cannot overlap an in-flight save', async () => {
    await renderLoaded();
    const saveHeader = vi.mocked(svc.saveTimesheetHeader);
    saveHeader.mockClear();

    // Make the first save hang so it stays in flight while we trigger a second.
    let releaseFirst!: () => void;
    saveHeader.mockImplementationOnce(
      () => new Promise<void>((resolve) => {
        releaseFirst = resolve;
      })
    );

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const input = screen.getByPlaceholderText('e.g. J-1234');
    fireEvent.change(input, { target: { value: 'J-99' } });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500); // debounced save #1 starts and blocks on saveHeader
    });
    expect(saveHeader).toHaveBeenCalledTimes(1);

    // A second edit fires a second save while #1 is still in flight.
    fireEvent.change(input, { target: { value: 'J-100' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    // #2 is queued behind the in-flight #1, so saveHeader has NOT been called again.
    expect(saveHeader).toHaveBeenCalledTimes(1);

    await act(async () => {
      releaseFirst();
      for (let i = 0; i < 6; i++) await Promise.resolve();
    });
  });

  it('does not re-save on unmount after a manual save (no stray write to a saved sheet)', async () => {
    const { unmount } = await renderLoaded();
    const saveHeader = vi.mocked(svc.saveTimesheetHeader);
    saveHeader.mockClear();

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    fireEvent.change(screen.getByPlaceholderText('e.g. J-1234'), { target: { value: 'J-99' } });

    await act(async () => {
      fireEvent.click(screen.getByText('Save Draft'));
      for (let i = 0; i < 6; i++) await Promise.resolve();
    });
    expect(saveHeader).toHaveBeenCalledTimes(1); // the manual save ran

    await act(async () => {
      unmount();
      for (let i = 0; i < 6; i++) await Promise.resolve();
    });
    // The manual save already cleared the pending debounce, so unmount must not re-save.
    expect(saveHeader).toHaveBeenCalledTimes(1);
  });
});
