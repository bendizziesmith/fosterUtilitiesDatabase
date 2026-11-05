import { describe, it, expect } from 'vitest';
import { buildAuditReport, auditPdfFileName, plantRegisterCsv, lockupCsv, auditsZipName } from './auditReport';

const audit = {
  id: 'a1', audit_date: '2026-11-05', ganger_name_snapshot: 'Dom Oliver', team_name_snapshot: 'Dom Oliver', vehicle_reg_snapshot: 'YE24 TNL',
  site_visited: 'feerg', auditor_name: 'Neil Foster', audited_by_name: 'Neil Foster', notes: 'Needs new gloves',
} as never;
const L = (o: object) => ({ id: Math.random().toString(), checklist_item_id: null, kit_type_id: null, expected_qty: null, qty: null, expiry_date: null, service_date: null, plant_no_snapshot: null, date_tag: null, comment: null, photo_path: null, kit_item_id: null, sort_order: 0, label_on: null, gauge: null, result: 'Y', ...o });
const lines = [
  L({ section: 'ppe', item_name: 'Hard hats', qty: '2', service_date: '2026-10-26', expiry_date: '2029-10-26' }),
  L({ section: 'ppe', item_name: 'Ear defenders', result: 'N', comment: 'missing', photo_path: 'lines/ear.jpg' }),
  L({ section: 'hs', item_name: 'Fire ext 2KG dry powder', expiry_date: '2026-10-01', gauge: 'amber' }),
  L({ section: 'kit', item_name: 'CAT', plant_no_snapshot: 'C-1', service_date: '2025-11-20', expiry_date: '2026-11-20' }),
  L({ section: 'other', item_name: 'Water containers', qty: '1', label_on: 'N' }),
] as never[];
const slots = [{ id: 's1', name: 'Van & reg', sort_order: 10, required: true }, { id: 's2', name: 'Van open', sort_order: 20, required: true }, { id: 's3', name: 'CAT', sort_order: 30, required: true }] as never[];
const photos = [
  { slot_id: null, slot_name: null, path: 'photos/extra.jpg', caption: 'Broken step', skip_reason: null, taken_at: '2026-11-05T14:40:00Z', sort_order: 1 },
  { slot_id: 's2', slot_name: 'Van open', path: null, caption: null, skip_reason: 'Van locked', taken_at: null, sort_order: 0 },
  { slot_id: 's1', slot_name: 'Van & reg', path: 'photos/van.jpg', caption: null, skip_reason: null, taken_at: '2026-11-05T14:32:00Z', sort_order: 0 },
] as never[];
const report = buildAuditReport({ audit, lines, photos, slots, edits: [{ actor_name: 'Sam Longcroft', created_at: '2026-11-05T16:00:00Z', summary: ['Hard hats qty: 1 → 2'] }] as never[],
  company: 'Foster Utilities', generatedBy: 'Christina Pearson', now: new Date('2026-11-05T17:00:00Z') });

describe('audit PDF content', () => {
  it('header like the paper sheet', () => {
    expect(report.company).toBe('Foster Utilities');
    expect(report.title).toBe('Site Audit');
    expect(report.header).toEqual(expect.arrayContaining([['Audited by', 'Neil Foster'], ['Date', '05 Nov 2026'], ['Van reg', 'YE24 TNL'], ['Team', 'Dom Oliver'], ['Site', 'feerg']]));
  });
  it('fails are marked in words, not only colour', () => {
    const ear = report.sections.find((s) => s.key === 'ppe')!.rows.find((r) => r.cells[0] === 'Ear defenders')!;
    expect(ear.tone).toBe('fail');
    expect(ear.cells).toContain('N · FAIL');
    const water = report.sections.find((s) => s.key === 'other')!.rows[0];
    expect(water.tone).toBe('fail');
    expect(water.cells).toContain('No · FAIL');
  });
  it('expired / due-soon dates and the amber gauge are worded', () => {
    const fire = report.sections.find((s) => s.key === 'hs')!.rows[0];
    expect(fire.tone).toBe('expired');
    expect(fire.cells.join(' ')).toMatch(/01 Oct 2026 · EXPIRED/);
    expect(fire.cells).toContain('Amber · LOOK AT');
    const cat = report.sections.find((s) => s.key === 'kit')!.rows[0];
    expect(cat.tone).toBe('due_soon');
    expect(cat.cells.join(' ')).toMatch(/20 Nov 2026 · DUE SOON/);
  });
  it('summary counts', () => {
    expect(report.summary).toEqual({ fails: 2, expired: 1, dueSoon: 1, toLookAt: 1 });
  });
  it('photos: every suggested slot in order ("Not taken" when missing; an old reason still shows), then additional, then photos on N answers', () => {
    expect(report.photos.map((p) => [p.label, p.path, p.skip])).toEqual([
      ['Van & reg', 'photos/van.jpg', null],
      ['Van open', null, 'Can’t take photo: Van locked'],
      ['CAT', null, 'Not taken'],
      ['Broken step', 'photos/extra.jpg', null],
      ['Ear defenders (N)', 'lines/ear.jpg', null],
    ]);
  });
  it('notes, edit log and footer', () => {
    expect(report.notes).toBe('Needs new gloves');
    expect(report.edits[0]).toMatch(/Sam Longcroft/);
    expect(report.footer).toMatch(/^Generated 05 Nov 2026 .* by Christina Pearson$/);
  });
});

describe('file names', () => {
  it('"<Gang or van> <reg> <DD Mon YYYY>.pdf"', () => {
    expect(auditPdfFileName({ ganger_name_snapshot: 'Dom Oliver', team_name_snapshot: 'x', vehicle_reg: 'YE24 TNL', audit_date: '2026-11-05' })).toBe('Dom Oliver YE24 TNL 05 Nov 2026.pdf');
    expect(auditPdfFileName({ ganger_name_snapshot: null, team_name_snapshot: '', vehicle_reg: 'WV72 OZL', audit_date: '2026-11-05' })).toBe('Spare van WV72 OZL 05 Nov 2026.pdf');
    expect(auditPdfFileName({ ganger_name_snapshot: 'A/B', team_name_snapshot: '', vehicle_reg: null, audit_date: '2026-11-05' })).toBe('A B 05 Nov 2026.pdf');
  });
  it('zip name for the current filter', () => {
    expect(auditsZipName('2026-11-01', '2026-11-30')).toBe('Site audits 01 Nov 2026 to 30 Nov 2026.zip');
    expect(auditsZipName(null, null)).toBe('Site audits.zip');
  });
});

describe('CSV columns', () => {
  it('plant register: one row per item, grouped by type, expiry status in words', () => {
    const csv = plantRegisterCsv([
      { kit_type_id: 't2', type_name: 'Genny', type_sort: 20, plant_no: 'G-1', status: 'spare', holder_kind: 'none', service_date: null, expiry_date: '2026-10-01', holder_name: null, holder_reg: null, vehicle_reg: null, service_company: null },
      { kit_type_id: 't1', type_name: 'CAT', type_sort: 10, plant_no: 'C-1, "big"', status: 'on_van', holder_kind: 'person', holder_name: 'Dom Oliver', holder_reg: 'YE24 TNL', service_date: '2026-01-01', expiry_date: '2027-01-01', vehicle_reg: 'YE24 TNL', service_company: null },
    ] as never[], '2026-11-05').split('\n');
    expect(csv[0]).toBe('Kit type,Plant no,Where,Service date,Expiry,Status,Expiry status');
    expect(csv[1]).toBe('CAT,"C-1, ""big""",Dom Oliver · YE24 TNL,01/01/2026,01/01/2027,On van,OK until Jan 2027');
    expect(csv[2]).toBe('Genny,G-1,Yard Lockup,,01/10/2026,Yard Lockup,Expired 5 weeks ago');
  });
  it('Yard Lockup stock: counts and low-stock flags', () => {
    const csv = lockupCsv([
      { section: 'ppe', name: 'Hi vis', quantity: 2, low_at: 5, sheet_order: 1 },
      { section: 'other', name: 'Bin bags', quantity: 10, low_at: null, sheet_order: 1 },
    ] as never[]).split('\n');
    expect(csv[0]).toBe('Section,Item,Count,Low at,Low stock');
    expect(csv[1]).toBe('PPE,Hi vis,2,5,LOW');
    expect(csv[2]).toBe('Other,Bin bags,10,,');
  });
});
