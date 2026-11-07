/**
 * Downloads (round 9): fetches what each PDF / CSV needs and hands it to auditPdf.ts.
 * Read-only: nothing here writes to the database.
 */
import { supabase, AuditPpeItem, KitItemOverview } from './supabase';
import { getAudit, getAuditFileUrl, listKit, listLineFollowups, loadAuditReferenceData, recordDownloads } from './siteAuditService';
import { followupText } from './followupLogic';
import { listAuditEdits } from './fleetService';
import { listLockup } from './lockupService';
import { holderKey, holderLabel, whoName } from './siteAuditLogic';
import { lockupCsv, plantRegisterCsv, longDate } from './auditReport';
import { PDF_COMPANY, AuditPdfSource, HolderSheet, buildAuditPdfBlob, downloadAuditsZip, downloadCsv, downloadHolderSheetsPdf, downloadLockupPdf, downloadPlantRegisterPdf, saveBlob } from './auditPdf';
import { todayISO } from './siteAuditLogic';
import type { OwnershipFilter } from './ownershipLogic';

export async function fetchAuditSource(id: string): Promise<AuditPdfSource> {
  const [{ audit, lines, photos }, edits, ref, followups] = await Promise.all([
    getAudit(id), listAuditEdits(id).catch(() => []), loadAuditReferenceData(), listLineFollowups(id).catch(() => []),
  ]);
  const since = new Map<string, { text: string; resolved: boolean | null }>();
  for (const f of followups) {
    const t = followupText(f, todayISO());
    if (t && f.line_id) since.set(f.line_id, t);
  }
  return {
    audit: { ...audit, notes: audit.notes ?? null },
    lines: lines as unknown as AuditPdfSource['lines'],
    photos,
    slots: ref.photoSlots,
    edits,
    since,
  };
}

/** "Who's doing this?" (the last name used on this device), for "Generated … by …" and the Downloaded tick. */
export type DownloadActor = { id: string; name: string } | null;

/** Whether the "Downloaded" record was saved, and why not if it wasn't (shown to the person, never swallowed). */
export interface RecordResult { recorded: boolean; recordError: string | null }

/** Saves the Downloaded record; a failure is returned, it doesn't stop the download. */
async function record(ids: string[], actor: DownloadActor, kind: 'single' | 'zip'): Promise<RecordResult> {
  try {
    await recordDownloads(ids, actor, kind, import.meta.env.DEV);
    return { recorded: true, recordError: null };
  } catch (e) {
    return { recorded: false, recordError: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * The record is saved BEFORE the file is handed over: on iPhone, handing over a PDF switches the tab to
 * the PDF viewer and the page stops, so anything after it may never reach the database (7 Nov 2026 bug).
 */
export async function downloadAuditPdf(id: string, actor: DownloadActor, onProgress?: (done: number, total: number) => void): Promise<RecordResult> {
  const src = await fetchAuditSource(id);
  const { blob, filename } = await buildAuditPdfBlob(src, PDF_COMPANY, whoName(actor?.name), getAuditFileUrl, onProgress);
  const r = await record([id], actor, 'single');
  saveBlob(blob, filename);
  return r;
}

export async function downloadAllAudits(ids: string[], range: { from: string | null; to: string | null }, actor: DownloadActor, onProgress?: (done: number, total: number) => void) {
  let rec: RecordResult = { recorded: true, recordError: null };
  const r = await downloadAuditsZip(ids, fetchAuditSource, PDF_COMPANY, whoName(actor?.name), getAuditFileUrl, range, onProgress,
    async (doneIds) => { rec = await record(doneIds, actor, 'zip'); });
  return { ...r, ...rec };
}

const fileDate = () => longDate(todayISO());

export async function downloadPlantRegister(kind: 'pdf' | 'csv', generatedBy: string, filter: OwnershipFilter = 'all') {
  const kit = await listKit();
  if (kind === 'csv') return downloadCsv(plantRegisterCsv(kit), `Plant register ${fileDate()}.csv`);
  return downloadPlantRegisterPdf(kit, PDF_COMPANY, generatedBy, filter);
}

export async function downloadLockup(kind: 'pdf' | 'csv', generatedBy: string) {
  const lines = await listLockup();
  if (kind === 'csv') return downloadCsv(lockupCsv(lines), `Yard Lockup stock ${fileDate()}.csv`);
  return downloadLockupPdf(lines, PDF_COMPANY, generatedBy);
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
  const [kit, ppe] = await Promise.all([
    listKit(),
    supabase.from('audit_ppe_items').select('*').order('item_name'),
  ]);
  const rows = ((ppe.error ? [] : ppe.data) as AuditPpeItem[]) ?? [];
  return downloadHolderSheetsPdf(holderSheets(kit.filter((k) => k.status === 'on_van'), rows, labelFor), PDF_COMPANY, generatedBy);
}

/** "Download" on one person's or spare van's page. */
export async function downloadOneHolder(title: string, heldKit: KitItemOverview[], dates: AuditPpeItem[], generatedBy: string) {
  return downloadHolderSheetsPdf([{ title, kit: heldKit, dates }], PDF_COMPANY, generatedBy, title);
}
