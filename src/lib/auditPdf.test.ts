import { describe, it, expect } from 'vitest';
import { renderAuditPdf } from './auditPdf';
import { buildAuditReport } from './auditReport';

const L = (o: object) => ({ expected_qty: null, qty: null, expiry_date: null, service_date: null, plant_no_snapshot: null, comment: null, photo_path: null, label_on: null, gauge: null, result: 'Y', sort_order: 0, ...o });
const report = buildAuditReport({
  audit: { id: 'a', audit_date: '2026-11-05', ganger_name_snapshot: 'Dom Oliver', team_name_snapshot: 'Dom Oliver', vehicle_reg_snapshot: 'YE24 TNL', site_visited: 'feerg', auditor_name: 'Neil Foster', audited_by_name: 'Neil Foster', notes: null },
  lines: [
    L({ section: 'ppe', item_name: 'Ear defenders', result: 'N' }),
    L({ section: 'hs', item_name: 'First aid kit', expiry_date: '2026-10-01' }),
  ] as never[],
  photos: [{ slot_id: 's1', slot_name: 'Van & reg', path: null, caption: null, skip_reason: 'Van locked', taken_at: null, sort_order: 0 }],
  slots: [{ id: 's1', name: 'Van & reg', sort_order: 10 }],
  edits: [],
  company: 'Foster Utilities',
  generatedBy: 'Christina Pearson',
});

describe('renderAuditPdf', () => {
  it('round 13: a clean A4 record: plain dates, no warning words, no summary line, no coloured rows', async () => {
    const doc = await renderAuditPdf(report, async () => null);
    const text = (doc as unknown as { output: () => string }).output();
    expect(doc.getNumberOfPages()).toBe(2);
    expect(Math.round(doc.internal.pageSize.getWidth())).toBe(595);
    for (const t of ['Site Audit', '01 Oct 2026', 'Ear defenders', 'Van locked', 'Page 2 of 2', 'Generated']) expect(text).toContain(t);
    for (const t of ['FAIL', 'EXPIRED', 'DUE SOON', 'RESOLVED', 'to look at', 'due soon']) expect(text).not.toContain(t);
    // the old red / amber row fills (254,226,226 and 254,243,199) are gone
    expect(text).not.toMatch(/0\.996 0\.886 0\.886 rg|0\.996 0\.953 0\.78\d* rg/);
  });
});

import { setBrandLogoLoader, renderPlantRegisterPdf } from './auditPdf';

// a 1×1 PNG stands in for the NSF logo
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const text = (doc: unknown) => (doc as { output: () => string }).output();
const nsf = buildAuditReport({ ...({} as object), audit: report.photos ? { id: 'a', audit_date: '2026-11-05', ganger_name_snapshot: 'Dom Oliver', team_name_snapshot: 'Dom Oliver', vehicle_reg_snapshot: 'YE24 TNL', site_visited: 'feerg', auditor_name: 'Neil Foster', audited_by_name: 'Neil Foster', notes: null } : (null as never),
  lines: [], photos: [], slots: [], edits: [], company: 'NSF Utilities Limited', generatedBy: 'Christina Pearson' });

describe('PDF branding: NSF Utilities Limited (PDFs only)', () => {
  it('puts the logo top-left and the company name in the footer and the file details', async () => {
    setBrandLogoLoader(async () => ({ dataUrl: PNG, width: 164, height: 78 }));
    const out = text(await renderAuditPdf(nsf, async () => null));
    expect(out).toContain('/Subtype /Image');
    expect(out).toContain('NSF Utilities Limited · Generated');
    expect(out).toContain('/Author (NSF Utilities Limited)');
    expect(out).toContain('Site Audit');
  });
  it('if the logo cannot load: no broken image, the name instead', async () => {
    setBrandLogoLoader(async () => null);
    const out = text(await renderAuditPdf(nsf, async () => null));
    expect(out).not.toContain('/Subtype /Image');
    expect(out).toContain('NSF UTILITIES LIMITED');
  });
  it('the Kit & Plant sheets are branded the same way', async () => {
    setBrandLogoLoader(async () => ({ dataUrl: PNG, width: 164, height: 78 }));
    const out = text(await renderPlantRegisterPdf([], 'NSF Utilities Limited', 'Neil Foster'));
    expect(out).toContain('/Subtype /Image');
    expect(out).toContain('Plant Register');
    expect(out).toContain('/Author (NSF Utilities Limited)');
  });
});
