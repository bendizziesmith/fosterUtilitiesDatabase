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
  it('draws an A4 portrait PDF with the fails and expired dates in words, a photo page and page numbers', async () => {
    const doc = await renderAuditPdf(report, async () => null);
    const text = (doc as unknown as { output: () => string }).output();
    expect(doc.getNumberOfPages()).toBe(2);
    expect(Math.round(doc.internal.pageSize.getWidth())).toBe(595);
    for (const t of ['FOSTER UTILITIES', 'Site Audit', 'FAIL', 'EXPIRED', 'Van locked', 'Page 2 of 2', 'Generated']) expect(text).toContain(t);
  });
});
