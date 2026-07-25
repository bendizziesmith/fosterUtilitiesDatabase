import { describe, it, expect, vi } from 'vitest';
import JSZip from 'jszip';
import {
  sanitizeName,
  gangerNameOf,
  pdfFilename,
  zipFilename,
  uniqueName,
  collectTimesheetPdfs,
  downloadTimesheetsZip,
} from './timesheetBulkExport';

describe('sanitizeName', () => {
  it('replaces non-alphanumeric characters with underscores', () => {
    expect(sanitizeName('Ben Carter')).toBe('Ben_Carter');
    expect(sanitizeName("O'Neil-Jones")).toBe('O_Neil_Jones');
  });
  it('falls back to Unknown for an empty name', () => {
    expect(sanitizeName('')).toBe('Unknown');
  });
});

describe('gangerNameOf', () => {
  it('prefers the joined ganger full name', () => {
    expect(gangerNameOf({ week_ending: 'x', ganger: { full_name: 'Ben Carter' } })).toBe('Ben Carter');
  });
  it('falls back to the snapshot then Unknown', () => {
    expect(gangerNameOf({ week_ending: 'x', ganger_name_snapshot: 'ben' })).toBe('ben');
    expect(gangerNameOf({ week_ending: 'x' })).toBe('Unknown');
  });
});

describe('pdfFilename / zipFilename', () => {
  it('builds a per-ganger PDF filename with the sanitised name and week', () => {
    expect(pdfFilename('Ben Carter', '2026-07-26')).toBe('Timesheet_Ben_Carter_WE_2026-07-26.pdf');
  });
  it('builds the ZIP filename for the week', () => {
    expect(zipFilename('2026-07-26')).toBe('Timesheets_WE_2026-07-26.zip');
  });
});

describe('uniqueName', () => {
  it('returns the base name when it is free, and reserves it', () => {
    const used = new Set<string>();
    expect(uniqueName('Timesheet_Ben_WE_2026-07-26.pdf', used)).toBe('Timesheet_Ben_WE_2026-07-26.pdf');
    expect(used.has('Timesheet_Ben_WE_2026-07-26.pdf')).toBe(true);
  });
  it('appends _2, _3 … before the extension on collisions', () => {
    const used = new Set<string>();
    const base = 'Timesheet_Ben_WE_2026-07-26.pdf';
    expect(uniqueName(base, used)).toBe('Timesheet_Ben_WE_2026-07-26.pdf');
    expect(uniqueName(base, used)).toBe('Timesheet_Ben_WE_2026-07-26_2.pdf');
    expect(uniqueName(base, used)).toBe('Timesheet_Ben_WE_2026-07-26_3.pdf');
  });
});

describe('collectTimesheetPdfs', () => {
  const ts = (name: string) => ({ week_ending: '2026-07-26', ganger: { full_name: name } });

  it('requests exactly one PDF per timesheet, with unique names', async () => {
    const buildBlob = vi.fn(async () => new Blob(['pdf']));
    const timesheets = [ts('Ben Carter'), ts('Sam Okafor'), ts('Ben Carter')];

    const { files, summary } = await collectTimesheetPdfs(timesheets, buildBlob);

    expect(buildBlob).toHaveBeenCalledTimes(3); // one per timesheet
    expect(files.map((f) => f.filename)).toEqual([
      'Timesheet_Ben_Carter_WE_2026-07-26.pdf',
      'Timesheet_Sam_Okafor_WE_2026-07-26.pdf',
      'Timesheet_Ben_Carter_WE_2026-07-26_2.pdf', // duplicate name de-duped
    ]);
    expect(summary).toEqual({ total: 3, succeeded: 3, failed: [] });
  });

  it('skips a timesheet whose PDF fails and records it, keeping the rest', async () => {
    const buildBlob = vi.fn(async (t: { ganger?: { full_name?: string } }) => {
      if (t.ganger?.full_name === 'Sam Okafor') throw new Error('boom');
      return new Blob(['pdf']);
    });
    const timesheets = [ts('Ben Carter'), ts('Sam Okafor'), ts('Joe Whitfield')];

    const { files, summary } = await collectTimesheetPdfs(timesheets, buildBlob);

    expect(files.map((f) => f.filename)).toEqual([
      'Timesheet_Ben_Carter_WE_2026-07-26.pdf',
      'Timesheet_Joe_Whitfield_WE_2026-07-26.pdf',
    ]);
    expect(summary.total).toBe(3);
    expect(summary.succeeded).toBe(2);
    expect(summary.failed).toEqual([
      { filename: 'Timesheet_Sam_Okafor_WE_2026-07-26.pdf', error: 'boom' },
    ]);
  });

  it('reports progress for each timesheet', async () => {
    const buildBlob = vi.fn(async () => new Blob(['pdf']));
    const seen: Array<[number, number]> = [];
    await collectTimesheetPdfs([ts('A'), ts('B')], buildBlob, (done, total) => seen.push([done, total]));
    expect(seen).toEqual([[1, 2], [2, 2]]);
  });
});

describe('downloadTimesheetsZip (real jszip)', () => {
  const ts = (name: string) => ({
    week_ending: '2026-07-26',
    weekly_total_hours: 0,
    ganger: { full_name: name },
  });

  it('bundles one correctly-named PDF per ganger into a single ZIP', async () => {
    const timesheets = [ts('Ben Carter'), ts('Sam Okafor'), ts('Ben Carter')];
    let savedName = '';
    let savedBlob: Blob | null = null;

    const summary = await downloadTimesheetsZip(timesheets, '2026-07-26', {
      buildBlob: async () => new Blob(['%PDF-1.4 fake']),
      save: (blob, name) => {
        savedBlob = blob;
        savedName = name;
      },
    });

    expect(savedName).toBe('Timesheets_WE_2026-07-26.zip');
    expect(summary).toEqual({ total: 3, succeeded: 3, failed: [] });

    const reloaded = await JSZip.loadAsync(savedBlob!);
    expect(Object.keys(reloaded.files).sort()).toEqual([
      'Timesheet_Ben_Carter_WE_2026-07-26.pdf',
      'Timesheet_Ben_Carter_WE_2026-07-26_2.pdf',
      'Timesheet_Sam_Okafor_WE_2026-07-26.pdf',
    ]);
  });

  it('does not save a ZIP when there is nothing to download', async () => {
    let saveCalled = false;
    const summary = await downloadTimesheetsZip([], '2026-07-26', {
      buildBlob: async () => new Blob(['pdf']),
      save: () => {
        saveCalled = true;
      },
    });
    expect(saveCalled).toBe(false);
    expect(summary).toEqual({ total: 0, succeeded: 0, failed: [] });
  });
});
