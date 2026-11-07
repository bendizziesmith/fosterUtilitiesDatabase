import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * 7 Nov 2026 bug: on iPhone, handing the PDF over switches the tab to the PDF viewer and the page
 * stops, so a download record saved AFTER that never reached the database. The record is now saved
 * first, then the file is handed over; a failed record is reported, not swallowed.
 */
const H = vi.hoisted(() => ({ order: [] as string[], recordFails: false }));

vi.mock('./siteAuditService', () => ({
  getAudit: async () => ({ audit: { id: 'a1', notes: null }, lines: [], photos: [] }),
  getAuditFileUrl: async () => '',
  listKit: async () => [],
  listLineFollowups: async () => [],
  loadAuditReferenceData: async () => ({ photoSlots: [] }),
  recordDownloads: async (ids: string[], _actor: unknown, kind: string) => {
    H.order.push(`record:${kind}:${ids.join(',')}`);
    if (H.recordFails) throw new Error('permission denied');
  },
}));
vi.mock('./fleetService', () => ({ listAuditEdits: async () => [] }));
vi.mock('./lockupService', () => ({ listLockup: async () => [] }));
vi.mock('./auditPdf', () => ({
  PDF_COMPANY: 'NSF Utilities Limited',
  buildAuditPdfBlob: async () => ({ blob: new Blob(['pdf']), filename: 'a.pdf' }),
  saveBlob: () => H.order.push('save'),
  downloadAuditsZip: async (ids: string[], _f: unknown, _c: unknown, _g: unknown, _u: unknown, _r: unknown, _p: unknown,
    beforeSave?: (done: string[]) => Promise<void>) => {
    await beforeSave?.(ids);
    H.order.push('save-zip');
    return { done: ids.length, failed: [], doneIds: ids };
  },
  downloadCsv: () => undefined, downloadHolderSheetsPdf: async () => undefined, downloadLockupPdf: async () => undefined,
  downloadPlantRegisterPdf: async () => undefined,
}));

const dl = await import('./auditDownloads');

describe('downloads are recorded before the file is handed over (iPhone)', () => {
  beforeEach(() => { H.order = []; H.recordFails = false; });

  it('one audit PDF: the Downloaded record is saved first, then the PDF', async () => {
    const r = await dl.downloadAuditPdf('a1', { id: 'n1', name: 'Neil Foster' });
    expect(H.order).toEqual(['record:single:a1', 'save']);
    expect(r).toEqual({ recorded: true, recordError: null });
  });

  it('Download all as ZIP: every audit in it is recorded first, then the ZIP', async () => {
    const r = await dl.downloadAllAudits(['a1', 'a2'], { from: null, to: null }, { id: 'n1', name: 'Neil Foster' });
    expect(H.order).toEqual(['record:zip:a1,a2', 'save-zip']);
    expect(r.recorded).toBe(true);
  });

  it('if the record cannot be saved, the PDF still downloads and the reason is passed back (not swallowed)', async () => {
    H.recordFails = true;
    const r = await dl.downloadAuditPdf('a1', null);
    expect(H.order).toEqual(['record:single:a1', 'save']);
    expect(r).toEqual({ recorded: false, recordError: 'permission denied' });
  });
});
