import { describe, it, expect, vi } from 'vitest';
import { buildTimesheetCsv, buildTimesheetFileBase, downloadTimesheetCSV } from './timesheetUtils';

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
// Price work sits in columns 14-19 (0-based 13-18); Notes is appended after it.
const priceWork = (line: string) => cells(line).slice(13, 19);
const notesCell = (line: string) => cells(line)[19];

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
    expect(priceWork(header)).toEqual([
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
    expect(priceWork(row344)).toEqual(['20', '', '', '', '', '200']);
    expect(priceWork(row100)).toEqual(['', '', '', '', '', '']);
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
    expect(priceWork(row)).toEqual(['', '12.5', '', '', '', '']);
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
    expect(priceWork(row)).toEqual(['', '12.57', '', '', '', '']);
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
    expect(priceWork(rows[0])).toEqual(['20', '', '', '', '', '']); // first day-row carries it
    expect(priceWork(rows[1])).toEqual(['', '', '', '', '', '']); // later rows blank
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
    expect(c).toHaveLength(20); // 13 existing + 6 price work + Notes
    expect(c.slice(8, 12)).toEqual(['', '', '', '']); // Day, Start, Finish, Hours blank
    expect(c[12]).toBe('0'); // Weekly Total Hours still lands in column 13
    expect(priceWork(rows[0])).toEqual(['', '', '', '', '', '200']);
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

describe('buildTimesheetCsv — notes column', () => {
  it('appends Notes as the final column, after price work', () => {
    const csv = buildTimesheetCsv({
      week_ending: '2026-07-26',
      ganger_name_snapshot: 'ben',
      weekly_total_hours: 8,
      job_rows: [{ job_number: '344', job_address: 'Norwich', ...NO_PW, day_entries: [day('monday')] }],
    });
    const header = csv.split('\n')[0];
    expect(cells(header)).toHaveLength(20);
    expect(notesCell(header)).toBe('Notes');
  });

  it("carries a job's note on every day row of that job", () => {
    const csv = buildTimesheetCsv({
      week_ending: '2026-07-26',
      ganger_name_snapshot: 'ben',
      weekly_total_hours: 16,
      job_rows: [
        {
          job_number: '344',
          job_address: 'Norwich',
          ...NO_PW,
          notes: 'Gate locked - call site manager',
          day_entries: [day('monday'), day('tuesday')],
        },
      ],
    });
    const rows = csv.split('\n').filter((l) => l.includes(',344,'));
    expect(rows).toHaveLength(2);
    expect(notesCell(rows[0])).toBe('Gate locked - call site manager');
    expect(notesCell(rows[1])).toBe('Gate locked - call site manager');
  });

  it('leaves the notes cell blank for a job with no note', () => {
    const csv = buildTimesheetCsv({
      week_ending: '2026-07-26',
      ganger_name_snapshot: 'ben',
      weekly_total_hours: 8,
      job_rows: [{ job_number: '100', job_address: 'Diss', ...NO_PW, day_entries: [day('tuesday')] }],
    });
    const row = csv.split('\n').find((l) => l.includes(',100,'))!;
    expect(notesCell(row)).toBe('');
  });

  it('emits a row for a job that has only a note (no hours, no price work)', () => {
    const csv = buildTimesheetCsv({
      week_ending: '2026-07-26',
      ganger_name_snapshot: 'ben',
      weekly_total_hours: 0,
      job_rows: [
        {
          job_number: '344',
          job_address: 'Norwich',
          ...NO_PW,
          notes: 'Turned away - no permit',
          day_entries: [],
        },
      ],
    });
    const rows = csv.split('\n').filter((l) => l.includes(',344,'));
    expect(rows).toHaveLength(1);
    expect(notesCell(rows[0])).toBe('Turned away - no permit');
  });

  it('quotes a note containing commas, quotes and newlines so the row still parses', () => {
    const csv = buildTimesheetCsv({
      week_ending: '2026-07-26',
      ganger_name_snapshot: 'ben',
      weekly_total_hours: 8,
      job_rows: [
        {
          job_number: '344',
          job_address: 'Norwich',
          ...NO_PW,
          notes: 'Access via "rear" gate, waited 2h\nextra duct pulled',
          day_entries: [day('monday')],
        },
      ],
    });
    expect(csv).toContain('"Access via ""rear"" gate, waited 2h\nextra duct pulled"');
  });

  it('neutralises a note that starts with a spreadsheet formula character', () => {
    const build = (note: string) =>
      buildTimesheetCsv({
        week_ending: '2026-07-26',
        ganger_name_snapshot: 'ben',
        weekly_total_hours: 8,
        job_rows: [{ job_number: '344', job_address: 'Norwich', ...NO_PW, notes: note, day_entries: [day('monday')] }],
      });
    const noteOf = (csv: string) => notesCell(csv.split('\n').find((l) => l.includes(',344,'))!);
    expect(noteOf(build('=SUM(A1:A9)'))).toBe("'=SUM(A1:A9)");
    expect(noteOf(build('+44 7700 900000'))).toBe("'+44 7700 900000");
    expect(noteOf(build('-2h waiting on materials'))).toBe("'-2h waiting on materials");
    expect(noteOf(build('@ site by 8am'))).toBe("'@ site by 8am");
  });

  it('prefixes AND quotes a formula note that also contains a comma', () => {
    const csv = buildTimesheetCsv({
      week_ending: '2026-07-26',
      ganger_name_snapshot: 'ben',
      weekly_total_hours: 8,
      job_rows: [{ job_number: '344', job_address: 'Norwich', ...NO_PW, notes: '=1+1, then left', day_entries: [day('monday')] }],
    });
    expect(csv).toContain('"\'=1+1, then left"');
  });

  it('leaves a normal note untouched (no stray prefix)', () => {
    const csv = buildTimesheetCsv({
      week_ending: '2026-07-26',
      ganger_name_snapshot: 'ben',
      weekly_total_hours: 8,
      job_rows: [{ job_number: '344', job_address: 'Norwich', ...NO_PW, notes: 'Gate locked', day_entries: [day('monday')] }],
    });
    expect(notesCell(csv.split('\n').find((l) => l.includes(',344,'))!)).toBe('Gate locked');
  });

  it('carries the note on the price-work fallback row too', () => {
    const csv = buildTimesheetCsv({
      week_ending: '2026-07-26',
      ganger_name_snapshot: 'ben',
      weekly_total_hours: 0,
      job_rows: [
        {
          job_number: '344',
          job_address: 'Norwich',
          ...NO_PW,
          pw_joint_carriageway: 200,
          notes: 'Priced work only',
          day_entries: [],
        },
      ],
    });
    const row = csv.split('\n').find((l) => l.includes(',344,'))!;
    expect(notesCell(row)).toBe('Priced work only');
  });
});

describe('buildTimesheetFileBase', () => {
  it('builds the shared stem: "<Name> WE <DD Mon YYYY>" (no "Timesheet" word)', () => {
    expect(buildTimesheetFileBase('Ben Carter', '2026-07-26')).toBe('Ben Carter WE 26 Jul 2026');
  });
  it('sanitises filesystem-illegal characters while keeping spaces', () => {
    expect(buildTimesheetFileBase('Ben/Sam', '2026-07-26')).toBe('Ben Sam WE 26 Jul 2026');
  });
});

describe('downloadTimesheetCSV — filename', () => {
  it('names the single CSV "<Name> WE <DD Mon YYYY>.csv" (no "Timesheet" word)', () => {
    const origCreate = URL.createObjectURL;
    const origRevoke = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn(() => 'blob:fake');
    URL.revokeObjectURL = vi.fn();

    let captured = '';
    const clickSpy = vi
      .spyOn(HTMLElement.prototype, 'click')
      .mockImplementation(function (this: HTMLElement) {
        captured = (this as HTMLAnchorElement).download;
      });

    try {
      downloadTimesheetCSV({
        week_ending: '2026-07-26',
        ganger: { full_name: 'Ben Carter' },
        weekly_total_hours: 0,
        job_rows: [],
      });
      expect(captured).toBe('Ben Carter WE 26 Jul 2026.csv');
    } finally {
      clickSpy.mockRestore();
      URL.createObjectURL = origCreate;
      URL.revokeObjectURL = origRevoke;
    }
  });
});
