import { describe, it, expect } from 'vitest';
import { buildPdfModel, buildTimesheetPdfBlob } from './timesheetPdf';

const NO_PW = {
  pw_trench_verge: null,
  pw_trench_footway: null,
  pw_trench_carriageway: null,
  pw_joint_verge: null,
  pw_joint_footway: null,
  pw_joint_carriageway: null,
};

const baseTs = {
  week_ending: '2026-07-26',
  status: 'submitted' as const,
  ganger_name_snapshot: 'ben',
  vehicle_registration_snapshot: 'AB12 CDE',
  labourer_1_name: 'Sam',
  labourer_2_name: null,
  weekly_total_hours: 8,
  job_rows: [
    {
      job_number: '344',
      job_address: 'Norwich',
      ...NO_PW,
      pw_trench_verge: 20,
      pw_joint_carriageway: 200,
      day_entries: [
        { day_of_week: 'monday', start_time: '08:00', finish_time: '16:00', hours_total: 8 },
      ],
    },
    {
      job_number: '100',
      job_address: 'Diss',
      ...NO_PW,
      day_entries: [
        { day_of_week: 'tuesday', start_time: '08:00', finish_time: '16:00', hours_total: 8 },
      ],
    },
  ],
};

describe('buildPdfModel', () => {
  it('shapes the header from the timesheet', () => {
    const m = buildPdfModel(baseTs);
    expect(m.gangerName).toBe('ben');
    expect(m.vehicle).toBe('AB12 CDE');
    expect(m.labourers).toBe('Sam');
    expect(m.jobs).toHaveLength(2);
  });

  it('populates price work only for a job that has it, with correct totals', () => {
    const m = buildPdfModel(baseTs);
    const job344 = m.jobs.find((j) => j.jobNumber === '344')!;
    const job100 = m.jobs.find((j) => j.jobNumber === '100')!;

    expect(job344.priceWork).not.toBeNull();
    expect(job344.priceWork!.trench.verge).toBe(20);
    expect(job344.priceWork!.trench.footway).toBeNull();
    expect(job344.priceWork!.trench.total).toBe(20);
    expect(job344.priceWork!.joint.carriageway).toBe(200);
    expect(job344.priceWork!.joint.total).toBe(200);

    expect(job100.priceWork).toBeNull();
  });

  it('includes the day rows for a job', () => {
    const m = buildPdfModel(baseTs);
    const job344 = m.jobs.find((j) => j.jobNumber === '344')!;
    expect(job344.dayRows).toEqual([
      { day: 'Mon', start: '08:00', finish: '16:00', hours: '8' },
    ]);
  });

  it('carries a job note into the model, and null when there is none', () => {
    const m = buildPdfModel({
      ...baseTs,
      job_rows: [
        { ...baseTs.job_rows[0], notes: 'Gate locked - call site manager' },
        baseTs.job_rows[1],
      ],
    });
    expect(m.jobs.find((j) => j.jobNumber === '344')!.notes).toBe(
      'Gate locked - call site manager'
    );
    expect(m.jobs.find((j) => j.jobNumber === '100')!.notes).toBeNull();
  });

  it('rolls up the weekly price work across jobs', () => {
    const m = buildPdfModel(baseTs);
    expect(m.weeklyPriceWork).toEqual({ trench: 20, joint: 200 });
  });

  it('has no weekly price work rollup when no job has any', () => {
    const m = buildPdfModel({
      ...baseTs,
      job_rows: [{ job_number: '100', job_address: 'Diss', ...NO_PW, day_entries: [] }],
    });
    expect(m.weeklyPriceWork).toBeNull();
  });
});

describe('buildTimesheetPdfBlob', () => {
  it('renders the timesheet to a non-empty PDF blob (the bulk-export bridge)', async () => {
    const blob = await buildTimesheetPdfBlob(baseTs);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('application/pdf');
    // A rendered A4 timesheet is well over a few hundred bytes; a zero/tiny blob
    // would mean the render or the output('blob') bridge silently produced nothing.
    expect(blob.size).toBeGreaterThan(500);
  });
});
