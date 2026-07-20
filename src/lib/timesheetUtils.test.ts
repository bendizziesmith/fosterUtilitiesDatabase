import { describe, it, expect } from 'vitest';
import { buildTimesheetCsv } from './timesheetUtils';

const NO_PW = {
  pw_trench_verge: null,
  pw_trench_footway: null,
  pw_trench_carriageway: null,
  pw_joint_verge: null,
  pw_joint_footway: null,
  pw_joint_carriageway: null,
};

const day = (d: string) => ({
  day_of_week: d,
  start_time: '08:00',
  finish_time: '16:00',
  hours_total: 8,
});

// Split a CSV line into cells (fixtures avoid commas inside values so this is safe).
const cells = (line: string) => line.split(',');
const lastSix = (line: string) => cells(line).slice(-6);

describe('buildTimesheetCsv — price work columns', () => {
  it('appends the six price work columns to the header, after the existing ones', () => {
    const csv = buildTimesheetCsv({
      week_ending: '2026-07-26',
      ganger_name_snapshot: 'ben',
      weekly_total_hours: 8,
      job_rows: [{ job_number: '344', job_address: 'Norwich', ...NO_PW, day_entries: [day('monday')] }],
    });
    const header = csv.split('\n')[0];
    expect(header).toContain('Weekly Total Hours'); // existing last column still present
    expect(lastSix(header)).toEqual([
      'Trench Verge',
      'Trench F/W',
      'Trench C/W',
      'Joint Verge',
      'Joint F/W',
      'Joint C/W',
    ]);
  });

  it('writes a job’s price work into the six cells, blanks elsewhere', () => {
    const csv = buildTimesheetCsv({
      week_ending: '2026-07-26',
      ganger_name_snapshot: 'ben',
      weekly_total_hours: 8,
      job_rows: [
        {
          job_number: '344',
          job_address: 'Norwich',
          ...NO_PW,
          pw_trench_verge: 20,
          pw_joint_carriageway: 200,
          day_entries: [day('monday')],
        },
        { job_number: '100', job_address: 'Diss', ...NO_PW, day_entries: [day('tuesday')] },
      ],
    });
    const lines = csv.split('\n');
    const row344 = lines.find((l) => l.includes(',344,'))!;
    const row100 = lines.find((l) => l.includes(',100,'))!;
    // Trench Verge, Trench F/W, Trench C/W, Joint Verge, Joint F/W, Joint C/W
    expect(lastSix(row344)).toEqual(['20', '', '', '', '', '200']);
    expect(lastSix(row100)).toEqual(['', '', '', '', '', '']);
  });

  it('keeps a decimal trench value numeric with no unit string', () => {
    const csv = buildTimesheetCsv({
      week_ending: '2026-07-26',
      ganger_name_snapshot: 'ben',
      weekly_total_hours: 8,
      job_rows: [
        { job_number: '344', job_address: 'Norwich', ...NO_PW, pw_trench_footway: 12.5, day_entries: [day('monday')] },
      ],
    });
    const row = csv.split('\n').find((l) => l.includes(',344,'))!;
    expect(lastSix(row)).toEqual(['', '12.5', '', '', '', '']);
  });

  it('rounds a trench value to 2dp so the CSV matches the screen and PDF', () => {
    const csv = buildTimesheetCsv({
      week_ending: '2026-07-26',
      ganger_name_snapshot: 'ben',
      weekly_total_hours: 8,
      job_rows: [
        { job_number: '344', job_address: 'Norwich', ...NO_PW, pw_trench_footway: 12.567, day_entries: [day('monday')] },
      ],
    });
    const row = csv.split('\n').find((l) => l.includes(',344,'))!;
    expect(lastSix(row)).toEqual(['', '12.57', '', '', '', '']);
  });

  it('puts price work on only the first day-row of a job (so column sums count it once)', () => {
    const csv = buildTimesheetCsv({
      week_ending: '2026-07-26',
      ganger_name_snapshot: 'ben',
      weekly_total_hours: 16,
      job_rows: [
        {
          job_number: '344',
          job_address: 'Norwich',
          ...NO_PW,
          pw_trench_verge: 20,
          day_entries: [day('monday'), day('tuesday')],
        },
      ],
    });
    const rows = csv.split('\n').filter((l) => l.includes(',344,'));
    expect(rows).toHaveLength(2);
    expect(lastSix(rows[0])).toEqual(['20', '', '', '', '', '']); // first day-row carries it
    expect(lastSix(rows[1])).toEqual(['', '', '', '', '', '']); // later rows blank
  });

  it('emits one fallback row for a job that has price work but no day entries', () => {
    const csv = buildTimesheetCsv({
      week_ending: '2026-07-26',
      ganger_name_snapshot: 'ben',
      weekly_total_hours: 0,
      job_rows: [{ job_number: '344', job_address: 'Norwich', ...NO_PW, pw_joint_carriageway: 200, day_entries: [] }],
    });
    const rows = csv.split('\n').filter((l) => l.includes(',344,'));
    expect(rows).toHaveLength(1);
    const c = cells(rows[0]);
    expect(c).toHaveLength(19); // 13 existing + 6 price work columns
    expect(c.slice(8, 12)).toEqual(['', '', '', '']); // Day, Start, Finish, Hours blank
    expect(c[12]).toBe('0'); // Weekly Total Hours still lands in column 13
    expect(lastSix(rows[0])).toEqual(['', '', '', '', '', '200']);
  });

  it('emits nothing for a job with neither day entries nor price work (unchanged behaviour)', () => {
    const csv = buildTimesheetCsv({
      week_ending: '2026-07-26',
      ganger_name_snapshot: 'ben',
      weekly_total_hours: 0,
      job_rows: [{ job_number: '999', job_address: 'Empty', ...NO_PW, day_entries: [] }],
    });
    expect(csv.split('\n').some((l) => l.includes(',999,'))).toBe(false);
  });
});
