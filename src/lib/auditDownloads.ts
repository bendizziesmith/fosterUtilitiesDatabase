/**
 * Downloads (round 9): fetches what each PDF / CSV needs and hands it to auditPdf.ts.
 * Read-only: nothing here writes to the database.
 */
import { supabase, AuditPpeItem, KitItemOverview } from './supabase';
import { getAudit, getAuditFileUrl, listKit, loadAuditReferenceData } from './siteAuditService';
import { listAuditEdits, getCompanyName } from './fleetService';
import { listLockup } from './lockupService';
import { holderKey, holderLabel } from './siteAuditLogic';
import { lockupCsv, plantRegisterCsv, longDate } from './auditReport';
import { AuditPdfSource, HolderSheet, buildAuditPdfBlob, downloadAuditsZip, downloadCsv, downloadHolderSheetsPdf, downloadLockupPdf, downloadPlantRegisterPdf, saveBlob } from './auditPdf';
import { todayISO } from './siteAuditLogic';

export async function fetchAuditSource(id: string): Promise<AuditPdfSource> {
  const [{ audit, lines, photos }, edits, ref] = await Promise.all([getAudit(id), listAuditEdits(id).catch(() => []), loadAuditReferenceData()]);
  return {
    audit: { ...audit, notes: audit.notes ?? null },
    lines: lines as unknown as AuditPdfSource['lines'],
    photos,
    slots: ref.photoSlots,
    edits,
  };
}

export async function downloadAuditPdf(id: string, generatedBy: string, onProgress?: (done: number, total: number) => void) {
  const [src, company] = await Promise.all([fetchAuditSource(id), getCompanyName()]);
  const { blob, filename } = await buildAuditPdfBlob(src, company, generatedBy, getAuditFileUrl, onProgress);
  saveBlob(blob, filename);
}

export async function downloadAllAudits(ids: string[], range: { from: string | null; to: string | null }, generatedBy: string, onProgress?: (done: number, total: number) => void) {
  const company = await getCompanyName();
  return downloadAuditsZip(ids, fetchAuditSource, company, generatedBy, getAuditFileUrl, range, onProgress);
}

const fileDate = () => longDate(todayISO());

export async function downloadPlantRegister(kind: 'pdf' | 'csv', generatedBy: string) {
  const kit = await listKit();
  if (kind === 'csv') return downloadCsv(plantRegisterCsv(kit), `Plant register ${fileDate()}.csv`);
  return downloadPlantRegisterPdf(kit, await getCompanyName(), generatedBy);
}

export async function downloadLockup(kind: 'pdf' | 'csv', generatedBy: string) {
  const lines = await listLockup();
  if (kind === 'csv') return downloadCsv(lockupCsv(lines), `Yard Lockup stock ${fileDate()}.csv`);
  return downloadLockupPdf(lines, await getCompanyName(), generatedBy);
}

/** One section per person / spare van: their kit, then their PPE and H&S dates. */
export function holderSheets(kit: KitItemOverview[], dates: (AuditPpeItem & { holder_label?: string })[], labelFor: (key: string) => string): HolderSheet[] {
  const map = new Map<string, HolderSheet>();
  const sheet = (key: string, title: string) => {
    if (!map.has(key)) map.set(key, { title, kit: [], dates: [] });
    return map.get(key)!;
  };
  for (const k of kit) {
    const key = holderKey(k);
    if (key) sheet(key, holderLabel(k)).kit.push(k);
  }
  for (const d of dates) {
    const key = d.holder_employee_id ? `person:${d.holder_employee_id}` : d.vehicle_id ? `van:${d.vehicle_id}` : null;
    if (key) sheet(key, labelFor(key)).dates.push(d);
  }
  return [...map.values()].sort((a, b) => a.title.localeCompare(b.title));
}

export async function downloadByHolder(generatedBy: string, labelFor: (key: string) => string) {
  const [kit, ppe, company] = await Promise.all([
    listKit(),
    supabase.from('audit_ppe_items').select('*').order('item_name'),
    getCompanyName(),
  ]);
  const rows = ((ppe.error ? [] : ppe.data) as AuditPpeItem[]) ?? [];
  return downloadHolderSheetsPdf(holderSheets(kit.filter((k) => k.status === 'on_van'), rows, labelFor), company, generatedBy);
}

/** "Download" on one person's or spare van's page. */
export async function downloadOneHolder(title: string, heldKit: KitItemOverview[], dates: AuditPpeItem[], generatedBy: string) {
  return downloadHolderSheetsPdf([{ title, kit: heldKit, dates }], await getCompanyName(), generatedBy, title);
}
