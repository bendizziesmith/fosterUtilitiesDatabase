/**
 * The downloads (round 9): the audit PDF (laid out like the paper sheet, with stamped photos),
 * Kit & Plant sheets (plant register, by person / spare van, Yard Lockup, one holder), CSVs and
 * the bulk ZIP. Same look in every PDF: Helvetica, slate headings, blue table heads, fails and
 * dates marked in colour AND words, rows never split across pages, heads repeated, page numbers.
 * jsPDF / autotable / jszip are loaded on first use, like the timesheet PDFs.
 * What goes in each file is in auditReport.ts (unit-tested).
 */
import { AuditReport, auditPdfFileName, auditsZipName, buildAuditReport, longDate, lockupRows, plantRegisterRows, RegisterItem, ReportLine } from './auditReport';
import { todayISO } from './siteAuditLogic';
import { uniqueName } from './timesheetBulkExport';
import { LockupLine } from './lockupLogic';
import nsfLogoUrl from '../assets/brand/nsf-logo.png';

type Doc = import('jspdf').jsPDF;
type RGB = [number, number, number];

const SLATE: RGB = [15, 23, 42]; // slate-900
const MUTED: RGB = [71, 85, 105]; // slate-600
const LINE: RGB = [203, 213, 225]; // slate-300
const GRID: RGB = [209, 213, 219]; // light grey grid
const BLACK: RGB = [17, 17, 17];
/** NSF navy, from the NSF audit sheet header (header rule, titles, table heads) */
const NAVY: RGB = [0, 36, 92];
const MARGIN = 40;

/** The company on every PDF (logo, footer, file details): fixed, so it can never disagree with the NSF logo. */
export const PDF_COMPANY = 'NSF Utilities Limited';

// ---------------------------------------------------------------- brand (NSF Utilities Limited)

/** The NSF logo (164×78 px) as a data URL; null if it can't be loaded (the PDF then shows the name). */
async function defaultLogoLoader(): Promise<LoadedImage | null> {
  try {
    const blob = await (await fetch(nsfLogoUrl)).blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = () => reject(r.error);
      r.readAsDataURL(blob);
    });
    return dataUrl.startsWith('data:image/') ? { dataUrl, width: 164, height: 78 } : null;
  } catch {
    return null;
  }
}
let logoLoader: () => Promise<LoadedImage | null> = defaultLogoLoader;
let logoCache: Promise<LoadedImage | null> | null = null;
/** For tests (and to swap the logo later): how the logo is loaded. */
export function setBrandLogoLoader(fn: () => Promise<LoadedImage | null>) {
  logoLoader = fn;
  logoCache = null;
}
const brandLogo = () => (logoCache ??= logoLoader().catch(() => null));

async function newDoc(title: string, company: string) {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;
  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait' });
  doc.setProperties({ title, subject: title, author: company, creator: company });
  return { doc, autoTable, logo: await brandLogo() };
}

/** Logo top-left (about 38 mm wide, proportions kept), title on the right, a navy rule; returns the y to carry on from. */
function header(doc: Doc, company: string, title: string, subtitle: string | undefined, logo: LoadedImage | null): number {
  const w = doc.internal.pageSize.getWidth();
  const top = MARGIN - 10;
  const logoW = 108; // ≈ 38 mm
  const logoH = logo ? (logoW * logo.height) / logo.width : 0;
  let drawn = false;
  if (logo) {
    try {
      doc.addImage(logo.dataUrl, 'PNG', MARGIN, top, logoW, logoH);
      drawn = true;
    } catch {
      drawn = false; // a bad image never breaks the PDF: the name is used instead
    }
  }
  if (!drawn) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...NAVY);
    doc.text(company.toUpperCase(), MARGIN, top + 16);
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(...NAVY);
  doc.text(title, w - MARGIN, top + 22, { align: 'right' });
  if (subtitle) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...MUTED);
    doc.text(subtitle, w - MARGIN, top + 38, { align: 'right' });
  }
  const y = top + Math.max(drawn ? logoH : 0, 44) + 8;
  doc.setDrawColor(...NAVY);
  doc.setLineWidth(1.5);
  doc.line(MARGIN, y, w - MARGIN, y);
  doc.setLineWidth(0.5);
  return y + 18;
}

function heading(doc: Doc, text: string, y: number): number {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...SLATE);
  doc.text(text, MARGIN, y);
  return y + 6;
}

/** Room left on the page, else a new page. */
function ensure(doc: Doc, y: number, needed: number): number {
  if (y + needed > doc.internal.pageSize.getHeight() - MARGIN - 20) {
    doc.addPage();
    return MARGIN;
  }
  return y;
}

/** Page numbers and "NSF Utilities Limited · Generated … by …" on every page. */
function footer(doc: Doc, text: string, company: string) {
  const n = doc.getNumberOfPages();
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(`${company} · ${text}`, MARGIN, h - 22);
    doc.text(`Page ${i} of ${n}`, w - MARGIN, h - 22, { align: 'right' });
  }
}

type AutoTable = Awaited<ReturnType<typeof newDoc>>['autoTable'];

/**
 * Round 13: a clean record. Navy header row, light grey grid, black text, generous spacing,
 * no coloured rows and no bold warnings (the warnings live in the app).
 */
function table(doc: Doc, autoTable: AutoTable, y: number, head: string[], body: string[][], widths?: number[]): number {
  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN, bottom: MARGIN + 20 },
    head: [head],
    body,
    theme: 'grid',
    rowPageBreak: 'avoid',
    showHead: 'everyPage',
    styles: { font: 'helvetica', fontSize: 9, textColor: BLACK, cellPadding: 6, lineColor: GRID, lineWidth: 0.5, overflow: 'linebreak', valign: 'top' },
    headStyles: { fillColor: NAVY, textColor: 255, fontStyle: 'bold' },
    columnStyles: widths ? Object.fromEntries(widths.map((w, i) => [i, { cellWidth: w }])) : {},
  });
  return (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 18;
}

/** Audit sections share one layout (Item · Fit · Qty / Plant no · Date · Expiry · Label / Gauge · Comment): the same widths in every section. */
const AUDIT_WIDTHS = [112, 52, 62, 62, 62, 54, 111];

/** A paragraph, split across pages if long. */
function paragraph(doc: Doc, text: string, y: number): number {
  const w = doc.internal.pageSize.getWidth();
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(...SLATE);
  for (const line of doc.splitTextToSize(text, w - MARGIN * 2) as string[]) {
    y = ensure(doc, y, 14);
    doc.text(line, MARGIN, y);
    y += 13;
  }
  return y + 8;
}

// ---------------------------------------------------------------- photos

export interface LoadedImage { dataUrl: string; width: number; height: number }

/** Signed URL → data URL + size, for addImage. Null if the photo can't be fetched (deleted, offline). */
export async function loadImage(getUrl: (path: string) => Promise<string>, path: string): Promise<LoadedImage | null> {
  try {
    const blob = await (await fetch(await getUrl(path))).blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = () => reject(r.error);
      r.readAsDataURL(blob);
    });
    const size = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => reject(new Error('bad image'));
      img.src = dataUrl;
    });
    return { dataUrl, ...size };
  } catch {
    return null;
  }
}

const stampTime = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

/** Two per row, scaled to fit (never stretched), label + taken-at under each; skipped slots say why. */
async function photoPages(doc: Doc, report: AuditReport, load: (path: string) => Promise<LoadedImage | null>, onProgress?: (done: number, total: number) => void) {
  if (!report.photos.length) return;
  doc.addPage();
  const w = doc.internal.pageSize.getWidth();
  let y = heading(doc, 'Photos', MARGIN) + 10;
  const gap = 16;
  const cellW = (w - MARGIN * 2 - gap) / 2;
  const imgH = 210;
  const cellH = imgH + 36;
  let col = 0;
  for (let i = 0; i < report.photos.length; i++) {
    const p = report.photos[i];
    if (col === 0) y = ensure(doc, y, cellH);
    const x = MARGIN + col * (cellW + gap);
    doc.setDrawColor(...LINE);
    doc.rect(x, y, cellW, imgH);
    const img = p.path ? await load(p.path) : null;
    if (img) {
      const scale = Math.min(cellW / img.width, imgH / img.height);
      const dw = img.width * scale;
      const dh = img.height * scale;
      doc.addImage(img.dataUrl, 'JPEG', x + (cellW - dw) / 2, y + (imgH - dh) / 2, dw, dh);
    } else {
      doc.setFont('helvetica', p.skip ? 'bold' : 'italic');
      doc.setFontSize(9);
      doc.setTextColor(...MUTED);
      doc.text(doc.splitTextToSize(p.skip ?? 'Photo not available (deleted)', cellW - 20) as string[], x + 10, y + imgH / 2);
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...SLATE);
    doc.text(doc.splitTextToSize(p.label, cellW) as string[], x, y + imgH + 13);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(p.skip ? p.skip : p.takenAt ? `Taken ${stampTime(p.takenAt)}` : '', x, y + imgH + 25, { maxWidth: cellW });
    onProgress?.(i + 1, report.photos.length);
    col = (col + 1) % 2;
    if (col === 0) y += cellH + 8;
  }
}

// ---------------------------------------------------------------- the audit PDF

export async function renderAuditPdf(report: AuditReport, load: (path: string) => Promise<LoadedImage | null>, onProgress?: (done: number, total: number) => void): Promise<Doc> {
  const { doc, autoTable, logo } = await newDoc(report.title, report.company);
  let y = header(doc, report.company, report.title, report.header.find(([k]) => k === 'Date')?.[1], logo);
  const w = doc.internal.pageSize.getWidth();
  // header like the paper sheet: two columns of label / value
  doc.setFontSize(9.5);
  report.header.forEach(([k, v], i) => {
    const x = MARGIN + (i % 2) * ((w - MARGIN * 2) / 2);
    if (i % 2 === 0 && i > 0) y += 15;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...MUTED);
    doc.text(`${k}:`, x, y);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...SLATE);
    doc.text(v || '—', x + 62, y);
  });
  y += 26;

  for (const sec of report.sections) {
    y = ensure(doc, y, 60);
    y = heading(doc, sec.title, y);
    y = table(doc, autoTable, y, sec.columns, sec.rows.map((r) => r.cells), AUDIT_WIDTHS);
  }

  y = ensure(doc, y, 50);
  y = heading(doc, 'Additional kit required / notes for Neil & Sam', y) + 10;
  y = paragraph(doc, report.notes ?? 'None.', y);
  if (report.edits.length) {
    y = ensure(doc, y, 40);
    y = heading(doc, 'Edits', y) + 10;
    for (const e of report.edits) y = paragraph(doc, e, y);
  }
  await photoPages(doc, report, load, onProgress);
  footer(doc, report.footer, report.company);
  return doc;
}

const blobOf = (doc: Doc) => (doc as unknown as { output: (t: 'blob') => Blob }).output('blob');

export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Everything an audit PDF needs, fetched by the caller (services) so this file stays free of the database. */
export interface AuditPdfSource {
  audit: Parameters<typeof buildAuditReport>[0]['audit'] & { vehicle_reg_snapshot: string | null };
  lines: ReportLine[];
  photos: Parameters<typeof buildAuditReport>[0]['photos'];
  slots: Parameters<typeof buildAuditReport>[0]['slots'];
  edits: Parameters<typeof buildAuditReport>[0]['edits'];
  /** what has happened since, per line id */
  since?: Parameters<typeof buildAuditReport>[0]['since'];
}

export async function buildAuditPdfBlob(src: AuditPdfSource, company: string, generatedBy: string, getUrl: (p: string) => Promise<string>,
  onProgress?: (done: number, total: number) => void): Promise<{ blob: Blob; filename: string }> {
  const report = buildAuditReport({ ...src, company, generatedBy });
  const doc = await renderAuditPdf(report, (p) => loadImage(getUrl, p), onProgress);
  const filename = auditPdfFileName({ ganger_name_snapshot: src.audit.ganger_name_snapshot, team_name_snapshot: src.audit.team_name_snapshot, vehicle_reg: src.audit.vehicle_reg_snapshot, audit_date: src.audit.audit_date });
  return { blob: blobOf(doc), filename };
}

/** "Download all" on Audit records: one ZIP of audit PDFs for the current filter. */
export async function downloadAuditsZip(ids: string[], fetchSource: (id: string) => Promise<AuditPdfSource>, company: string, generatedBy: string,
  getUrl: (p: string) => Promise<string>, range: { from: string | null; to: string | null }, onProgress?: (done: number, total: number) => void) {
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();
  const used = new Set<string>();
  const failed: string[] = [];
  for (let i = 0; i < ids.length; i++) {
    try {
      const { blob, filename } = await buildAuditPdfBlob(await fetchSource(ids[i]), company, generatedBy, getUrl);
      zip.file(uniqueName(filename, used), blob);
    } catch (e) {
      failed.push(e instanceof Error ? e.message : String(e));
    }
    onProgress?.(i + 1, ids.length);
  }
  if (used.size) saveBlob(await zip.generateAsync({ type: 'blob' }), auditsZipName(range.from, range.to));
  return { done: used.size, failed };
}

// ---------------------------------------------------------------- Kit & Plant sheets

const today = () => todayISO();
const genLine = (by: string) => `Generated ${longDate(today())} ${new Date().toTimeString().slice(0, 5)} by ${by}`;
const fileDate = () => longDate(today());

export async function renderPlantRegisterPdf<T extends RegisterItem>(kit: T[], company: string, by: string): Promise<Doc> {
  const { doc, autoTable, logo } = await newDoc('Plant Register', company);
  const rows = plantRegisterRows(kit);
  let y = header(doc, company, 'Plant Register', `${rows.length} items · ${longDate(today())}`, logo);
  const types = [...new Set(rows.map((r) => r.type))];
  for (const t of types) {
    const tr = rows.filter((r) => r.type === t);
    y = ensure(doc, y, 60);
    y = heading(doc, `${t} (${tr.length})`, y);
    y = table(doc, autoTable, y, ['Plant no', 'Who / where', 'Service', 'Expiry', 'Status'],
      tr.map((r) => [r.plantNo || '—', r.where, longDate(r.serviceDate), longDate(r.expiryDate), r.status]),
      [80, 175, 85, 85, 90]);
  }
  footer(doc, genLine(by), company);
  return doc;
}

export async function downloadPlantRegisterPdf<T extends RegisterItem>(kit: T[], company: string, by: string) {
  saveBlob(blobOf(await renderPlantRegisterPdf(kit, company, by)), `Plant register ${fileDate()}.pdf`);
}

export interface HolderSheet {
  title: string;
  kit: (RegisterItem & { status: string })[];
  dates: { item_name: string; expiry_date: string | null }[];
}

function holderSection(doc: Doc, autoTable: AutoTable, y: number, h: HolderSheet): number {
  y = ensure(doc, y, 80);
  y = heading(doc, h.title, y);
  y = table(doc, autoTable, y, ['Kit', 'Plant no', 'Service', 'Expiry'],
    h.kit.length ? h.kit.map((k) => [k.type_name, k.plant_no ?? '—', longDate(k.service_date), longDate(k.expiry_date)]) : [['No kit recorded', '', '', '']],
    [175, 120, 110, 110]);
  if (h.dates.length) {
    y = table(doc, autoTable, y, ['PPE and H&S', 'Expiry'], h.dates.map((d) => [d.item_name, longDate(d.expiry_date)]), [295, 220]);
  }
  return y;
}

/** By person / spare van: one section per holder; or a single person / van ("Download" on their page). */
export async function downloadHolderSheetsPdf(holders: HolderSheet[], company: string, by: string, single?: string) {
  const title = single ? `Kit & Plant: ${single}` : 'Kit & Plant by Person / Spare Van';
  const { doc, autoTable, logo } = await newDoc(title, company);
  let y = header(doc, company, title, longDate(today()), logo);
  for (const h of holders) y = holderSection(doc, autoTable, y, h);
  footer(doc, genLine(by), company);
  saveBlob(blobOf(doc), single ? `${single.replace(/[/\\:*?"<>|]/g, ' ')} kit ${fileDate()}.pdf` : `Kit by person and spare van ${fileDate()}.pdf`);
}

export async function downloadLockupPdf<T extends LockupLine>(lines: T[], company: string, by: string) {
  const { doc, autoTable, logo } = await newDoc('Yard Lockup Stock', company);
  const rows = lockupRows(lines);
  let y = header(doc, company, 'Yard Lockup Stock', longDate(today()), logo);
  for (const sec of [...new Set(rows.map((r) => r.section))]) {
    const sr = rows.filter((r) => r.section === sec);
    y = ensure(doc, y, 60);
    y = heading(doc, sec, y);
    y = table(doc, autoTable, y, ['Item', 'Count', 'Low at'],
      sr.map((r) => [r.name, String(r.quantity), r.lowAt === null ? '' : String(r.lowAt)]),
      [315, 100, 100]);
  }
  footer(doc, genLine(by), company);
  saveBlob(blobOf(doc), `Yard Lockup stock ${fileDate()}.pdf`);
}

export function downloadCsv(csv: string, filename: string) {
  // BOM so Excel opens the £ / · characters correctly
  saveBlob(new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' }), filename);
}

