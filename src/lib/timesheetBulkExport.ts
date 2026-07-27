import { buildTimesheetPdfBlob, type PdfTimesheet } from './timesheetPdf';
import { formatWeekEnding } from './timesheetUtils';

/**
 * Minimal shape of a timesheet needed to name and build its bulk PDF. The real
 * timesheet objects (from loadTimesheetsForWeek) carry far more, but naming only
 * depends on the week ending and the ganger's name, so we accept anything wider.
 */
export interface BulkTimesheet {
  week_ending: string;
  ganger?: { full_name?: string | null } | null;
  ganger_name_snapshot?: string | null;
}

export interface BulkSummary {
  total: number;
  succeeded: number;
  failed: Array<{ filename: string; error: string }>;
}

export interface BulkResult {
  files: Array<{ filename: string; blob: Blob }>;
  summary: BulkSummary;
}

/**
 * Make a ganger's name safe for a filename while keeping it readable. Replace the
 * filesystem-illegal characters (/ \ : * ? " < > |) with a space, collapse runs of
 * whitespace, and trim. Spaces, apostrophes, and hyphens stay. Empty (or
 * all-illegal) -> "Unknown".
 */
export function sanitizeName(name: string): string {
  const cleaned = (name || '')
    .replace(/[/\\:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || 'Unknown';
}

/** The ganger name we print/name-by: joined employee, else the snapshot, else Unknown. */
export function gangerNameOf(ts: BulkTimesheet): string {
  return ts.ganger?.full_name || ts.ganger_name_snapshot || 'Unknown';
}

/** e.g. "Ben Carter WE 26 Jul 2026.pdf" (day-month-year, matching the rest of the app). */
export function pdfFilename(gangerName: string, weekEnding: string): string {
  return `${sanitizeName(gangerName)} WE ${formatWeekEnding(weekEnding)}.pdf`;
}

/** e.g. "All Gangers WE 26 Jul 2026.zip" */
export function zipFilename(weekEnding: string): string {
  return `All Gangers WE ${formatWeekEnding(weekEnding)}.zip`;
}

/**
 * Return a filename not already in `used`, appending _2, _3 … before the .pdf
 * extension on collisions, and reserve the chosen name in `used`.
 */
export function uniqueName(base: string, used: Set<string>): string {
  const dot = base.lastIndexOf('.');
  const stem = dot === -1 ? base : base.slice(0, dot);
  const ext = dot === -1 ? '' : base.slice(dot);

  let candidate = base;
  let n = 2;
  while (used.has(candidate)) {
    candidate = `${stem}_${n}${ext}`;
    n += 1;
  }
  used.add(candidate);
  return candidate;
}

/**
 * Build one PDF blob per timesheet, sequentially, giving each a unique filename.
 * A timesheet whose PDF fails is skipped and recorded in `summary.failed` rather
 * than aborting the whole batch. `buildBlob` is injected for testability.
 */
export async function collectTimesheetPdfs<T extends BulkTimesheet>(
  timesheets: T[],
  buildBlob: (ts: T) => Promise<Blob>,
  onProgress?: (done: number, total: number) => void
): Promise<BulkResult> {
  const used = new Set<string>();
  const files: Array<{ filename: string; blob: Blob }> = [];
  const failed: Array<{ filename: string; error: string }> = [];
  const total = timesheets.length;

  for (let i = 0; i < timesheets.length; i += 1) {
    const ts = timesheets[i];
    const filename = uniqueName(pdfFilename(gangerNameOf(ts), ts.week_ending), used);
    try {
      const blob = await buildBlob(ts);
      files.push({ filename, blob });
    } catch (err) {
      failed.push({ filename, error: err instanceof Error ? err.message : String(err) });
    }
    onProgress?.(i + 1, total);
  }

  return {
    files,
    summary: { total, succeeded: files.length, failed },
  };
}

/** Trigger a browser download of a blob under the given filename. */
function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export interface DownloadZipOptions {
  buildBlob?: (ts: PdfTimesheet) => Promise<Blob>;
  onProgress?: (done: number, total: number) => void;
  loadZip?: () => Promise<new () => JSZipLike>;
  save?: (blob: Blob, filename: string) => void;
}

/** Minimal jszip surface we depend on, so tests can inject a fake. */
interface JSZipLike {
  file(name: string, data: Blob): void;
  generateAsync(options: { type: 'blob' }): Promise<Blob>;
}

/**
 * Build one PDF per timesheet, bundle them into a single ZIP, and download it.
 * jszip is lazy-loaded on call so it never lands in the initial bundle. Returns
 * the summary so the caller can surface any skipped timesheets.
 */
export async function downloadTimesheetsZip(
  timesheets: PdfTimesheet[],
  weekEnding: string,
  opts: DownloadZipOptions = {}
): Promise<BulkSummary> {
  const {
    buildBlob = buildTimesheetPdfBlob,
    onProgress,
    loadZip = async () => (await import('jszip')).default as unknown as new () => JSZipLike,
    save = saveBlob,
  } = opts;

  const { files, summary } = await collectTimesheetPdfs(timesheets, buildBlob, onProgress);

  if (files.length > 0) {
    const JSZip = await loadZip();
    const zip = new JSZip();
    for (const { filename, blob } of files) {
      zip.file(filename, blob);
    }
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    save(zipBlob, zipFilename(weekEnding));
  }

  return summary;
}
