/**
 * The downloads (round 9): the audit PDF (laid out like the paper sheet, with stamped photos),
 * Kit & Plant sheets (plant register, by person / spare van, Yard Lockup, one holder), CSVs and
 * the bulk ZIP. Same look in every PDF: Helvetica, slate headings, blue table heads, fails and
 * dates marked in colour AND words, rows never split across pages, heads repeated, page numbers.
 * jsPDF / autotable / jszip are loaded on first use, like the timesheet PDFs.
 * What goes in each file is in auditReport.ts (unit-tested).
 */
import { AuditReport, RowTone, auditPdfFileName, auditsZipName, buildAuditReport, longDate, lockupRows, plantRegisterRows, RegisterItem, ReportLine } from './auditReport';
import { expiryWording, todayISO } from './siteAuditLogic';
import { uniqueName } from './timesheetBulkExport';
import { LockupLine } from './lockupLogic';

type Doc = import('jspdf').jsPDF;
type RGB = [number, number, number];

const SLATE: RGB = [15, 23, 42]; // slate-900
const MUTED: RGB = [71, 85, 105]; // slate-600
const LINE: RGB = [203, 213, 225]; // slate-300
const BLUE: RGB = [37, 99, 235]; // blue-600 (the app's primary)
const TONE: Record<Exclude<RowTone, null>, { fill: RGB; text: RGB }> = {
  fail: { fill: [254, 226, 226], text: [153, 27, 27] },
  expired: { fill: [254, 226, 226], text: [153, 27, 27] },
  due_soon: { fill: [254, 243, 199], text: [146, 64, 14] },
  look: { fill: [254, 243, 199], text: [146, 64, 14] },
};
const MARGIN = 40;

async function newDoc() {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;
  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait' });
  return { doc, autoTable };
}

/** Company name, title, subtitle and a rule; returns the y to carry on from. */
function header(doc: Doc, company: string, title: string, subtitle?: string): number {
  const w = doc.internal.pageSize.getWidth();
  let y = MARGIN;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...BLUE);
  doc.text(company.toUpperCase(), MARGIN, y);
  y += 18;
  doc.setFontSize(18);
  doc.setTextColor(...SLATE);
  doc.text(title, MARGIN, y);
  if (subtitle) {
    y += 15;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...MUTED);
    doc.text(subtitle, MARGIN, y);
  }
  y += 10;
  doc.setDrawColor(...LINE);
  doc.line(MARGIN, y, w - MARGIN, y);
  return y + 16;
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

/** Page numbers and the "Generated … by …" line on every page. */
function footer(doc: Doc, text: string) {
  const n = doc.getNumberOfPages();
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(text, MARGIN, h - 22);
    doc.text(`Page ${i} of ${n}`, w - MARGIN, h - 22, { align: 'right' });
  }
}

type AutoTable = Awaited<ReturnType<typeof newDoc>>['autoTable'];

function table(doc: Doc, autoTable: AutoTable, y: number, head: string[], body: string[][], tones: RowTone[] = []): number {
  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN, bottom: MARGIN + 20 },
    head: [head],
    body,
    theme: 'grid',
    rowPageBreak: 'avoid',
    showHead: 'everyPage',
    styles: { font: 'helvetica', fontSize: 8.5, textColor: SLATE, cellPadding: 4, lineColor: LINE, lineWidth: 0.5, overflow: 'linebreak' },
    headStyles: { fillColor: BLUE, textColor: 255, fontStyle: 'bold' },
    didParseCell: (d) => {
      if (d.section !== 'body') return;
      const t = tones[d.row.index];
      if (!t) return;
      d.cell.styles.fillColor = TONE[t].fill;
      d.cell.styles.textColor = TONE[t].text;
      if (d.column.index === 0 || /FAIL|EXPIRED|DUE SOON|LOOK AT|LOW|Expired|Expires/.test(String(d.cell.raw))) d.cell.styles.fontStyle = 'bold';
    },
  });
  return (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 16;
}

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
      doc.setTextColor(...(p.skip ? TONE.look.text : MUTED));
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
  const { doc, autoTable } = await newDoc();
  let y = header(doc, report.company, report.title, report.header.find(([k]) => k === 'Date')?.[1]);
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
  y += 22;
  const s = report.summary;
  const parts = [`${s.fails} fail${s.fails === 1 ? '' : 's'}`, `${s.expired} expired`, `${s.dueSoon} due soon`, `${s.toLookAt} to look at`];
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...(s.fails || s.expired ? TONE.fail.text : s.dueSoon || s.toLookAt ? TONE.look.text : [21, 128, 61] as RGB));
  doc.text(parts.join('  ·  '), MARGIN, y);
  y += 18;

  for (const sec of report.sections) {
    y = ensure(doc, y, 60);
    y = heading(doc, sec.title, y);
    y = table(doc, autoTable, y, sec.columns, sec.rows.map((r) => r.cells), sec.rows.map((r) => r.tone));
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
  footer(doc, report.footer);
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

const toneOfExpiry = (expiry: string | null | undefined, today: string): RowTone => {
  const t = expiryWording(expiry, today).tone;
  return t === 'expired' ? 'expired' : t === 'due_soon' ? 'due_soon' : null;
};
const today = () => todayISO();
const genLine = (by: string) => `Generated ${longDate(today())} ${new Date().toTimeString().slice(0, 5)} by ${by}`;
const fileDate = () => longDate(today());

export async function downloadPlantRegisterPdf<T extends RegisterItem>(kit: T[], company: string, by: string) {
  const { doc, autoTable } = await newDoc();
  const rows = plantRegisterRows(kit);
  let y = header(doc, company, 'Plant register', `${rows.length} items · ${longDate(today())}`);
  const types = [...new Set(rows.map((r) => r.type))];
  for (const t of types) {
    const tr = rows.filter((r) => r.type === t);
    y = ensure(doc, y, 60);
    y = heading(doc, `${t} (${tr.length})`, y);
    y = table(doc, autoTable, y, ['Plant no', 'Who / where', 'Service', 'Expiry', 'Status', 'Expiry status'],
      tr.map((r) => [r.plantNo || '—', r.where, r.service, r.expiry, r.status, r.expiryText]),
      tr.map((r) => (r.tone === 'expired' ? 'expired' : r.tone === 'due_soon' ? 'due_soon' : null)));
  }
  footer(doc, genLine(by));
  saveBlob(blobOf(doc), `Plant register ${fileDate()}.pdf`);
}

export interface HolderSheet {
  title: string;
  kit: (RegisterItem & { status: string })[];
  dates: { item_name: string; expiry_date: string | null }[];
}

function holderSection(doc: Doc, autoTable: AutoTable, y: number, h: HolderSheet): number {
  const t = today();
  y = ensure(doc, y, 80);
  y = heading(doc, h.title, y);
  y = table(doc, autoTable, y, ['Kit', 'Plant no', 'Service', 'Expiry', 'Expiry status'],
    h.kit.length ? h.kit.map((k) => [k.type_name, k.plant_no ?? '—', longDate(k.service_date), longDate(k.expiry_date), k.expiry_date ? expiryWording(k.expiry_date, t).text : '']) : [['No kit recorded', '', '', '', '']],
    h.kit.map((k) => toneOfExpiry(k.expiry_date, t)));
  if (h.dates.length) {
    y = table(doc, autoTable, y, ['PPE and H&S', 'Expiry', 'Expiry status'],
      h.dates.map((d) => [d.item_name, longDate(d.expiry_date), d.expiry_date ? expiryWording(d.expiry_date, t).text : 'No expiry date']),
      h.dates.map((d) => toneOfExpiry(d.expiry_date, t)));
  }
  return y;
}

/** By person / spare van: one section per holder; or a single person / van ("Download" on their page). */
export async function downloadHolderSheetsPdf(holders: HolderSheet[], company: string, by: string, single?: string) {
  const { doc, autoTable } = await newDoc();
  let y = header(doc, company, single ? `Kit & Plant: ${single}` : 'Kit & Plant by person / spare van', longDate(today()));
  for (const h of holders) y = holderSection(doc, autoTable, y, h);
  footer(doc, genLine(by));
  saveBlob(blobOf(doc), single ? `${single.replace(/[/\\:*?"<>|]/g, ' ')} kit ${fileDate()}.pdf` : `Kit by person and spare van ${fileDate()}.pdf`);
}

export async function downloadLockupPdf<T extends LockupLine>(lines: T[], company: string, by: string) {
  const { doc, autoTable } = await newDoc();
  const rows = lockupRows(lines);
  let y = header(doc, company, 'Yard Lockup stock', `${rows.filter((r) => r.low).length} low · ${longDate(today())}`);
  for (const sec of [...new Set(rows.map((r) => r.section))]) {
    const sr = rows.filter((r) => r.section === sec);
    y = ensure(doc, y, 60);
    y = heading(doc, sec, y);
    y = table(doc, autoTable, y, ['Item', 'Count', 'Low at', 'Low stock'],
      sr.map((r) => [r.name, String(r.quantity), r.lowAt === null ? '' : String(r.lowAt), r.low ? 'LOW' : '']),
      sr.map((r) => (r.low ? 'due_soon' : null)));
  }
  footer(doc, genLine(by));
  saveBlob(blobOf(doc), `Yard Lockup stock ${fileDate()}.pdf`);
}

export function downloadCsv(csv: string, filename: string) {
  // BOM so Excel opens the £ / · characters correctly
  saveBlob(new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' }), filename);
}

