/**
 * What goes in the downloads (round 9): the audit PDF content, file names and CSVs.
 * Pure, unit-tested in auditReport.test.ts; drawing the PDFs is in auditPdf.ts.
 */
import { expiryWording, getExpiryStatus, holderLabel, summariseAuditLines, todayISO, HolderLike, DraftLine } from './siteAuditLogic';
import { sanitizeName } from './timesheetUtils';
import { isLowStock, sortLockup, LockupLine } from './lockupLogic';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n: number) => String(n).padStart(2, '0');

/** "05 Nov 2026" */
export function longDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return `${pad(d)} ${MONTHS[m - 1]} ${y}`;
}
/** "05/11/2026" (CSV) */
const shortDate = (iso: string | null | undefined) => {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return `${pad(d)}/${pad(m)}/${y}`;
};
const dateTime = (d: Date) => `${pad(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;

// ---------------------------------------------------------------- audit PDF content

export type RowTone = 'fail' | 'expired' | 'due_soon' | 'look' | null;

export interface ReportLine {
  section: 'ppe' | 'hs' | 'kit' | 'other';
  item_name: string;
  expected_qty: string | null;
  result: 'Y' | 'N' | 'not_carried' | null;
  qty: string | null;
  service_date: string | null;
  expiry_date: string | null;
  plant_no_snapshot: string | null;
  comment: string | null;
  photo_path: string | null;
  photo_taken_at?: string | null;
  label_on?: 'Y' | 'N' | null;
  gauge?: 'green' | 'amber' | 'red' | null;
  sort_order: number;
}

export interface ReportAudit {
  id: string;
  audit_date: string;
  ganger_name_snapshot: string | null;
  team_name_snapshot: string;
  vehicle_reg_snapshot: string | null;
  site_visited: string | null;
  auditor_name: string | null;
  audited_by_name: string;
  notes: string | null;
}

export interface ReportPhotoRow {
  slot_id: string | null;
  slot_name: string | null;
  path: string | null;
  caption: string | null;
  skip_reason: string | null;
  taken_at: string | null;
  sort_order: number;
}

export interface ReportPhoto {
  label: string;
  path: string | null;
  skip: string | null;
  takenAt: string | null;
}

const SECTIONS: { key: ReportLine['section']; title: string; columns: string[] }[] = [
  { key: 'ppe', title: 'PPE', columns: ['Item', 'Fit for purpose', 'Qty', 'Date', 'Expiry', 'Comment'] },
  { key: 'hs', title: 'Health & safety', columns: ['Item', 'Fit for purpose', 'Qty', 'Expiry', 'Pressure gauge', 'Comment'] },
  { key: 'kit', title: 'Kit', columns: ['Item', 'Fit for purpose', 'Plant no', 'Service', 'Expiry', 'Comment'] },
  { key: 'other', title: 'Other', columns: ['Item', 'Fit for purpose', 'Qty', 'Label on', 'Comment'] },
];

const fitText = (r: ReportLine['result']) => (r === 'Y' ? 'Y' : r === 'N' ? 'N · FAIL' : r === 'not_carried' ? 'Not carried' : '—');
const labelText = (v: ReportLine['label_on']) => (v === 'Y' ? 'Yes' : v === 'N' ? 'No · FAIL' : '');
const gaugeText = (v: ReportLine['gauge']) => (v === 'green' ? 'Green' : v === 'amber' ? 'Amber · LOOK AT' : v === 'red' ? 'Red · FAIL' : '');
function expiryText(l: ReportLine, auditDate: string) {
  if (!l.expiry_date) return '';
  if (l.result === 'not_carried') return longDate(l.expiry_date);
  const { status } = getExpiryStatus(l.expiry_date, auditDate);
  return `${longDate(l.expiry_date)}${status === 'expired' ? ' · EXPIRED' : status === 'due_soon' ? ' · DUE SOON' : ''}`;
}
function toneOf(l: ReportLine, auditDate: string): RowTone {
  if (l.result === 'N' || l.label_on === 'N' || l.gauge === 'red') return 'fail';
  if (l.result !== 'not_carried' && l.section !== 'other') {
    const { status } = getExpiryStatus(l.expiry_date, auditDate);
    if (status === 'expired') return 'expired';
    if (status === 'due_soon') return 'due_soon';
  }
  return l.gauge === 'amber' ? 'look' : null;
}

export function buildAuditReport(input: {
  audit: ReportAudit;
  lines: ReportLine[];
  photos: ReportPhotoRow[];
  slots: { id: string; name: string; sort_order: number }[];
  edits: { actor_name: string | null; created_at: string; summary: string[] }[];
  company: string;
  generatedBy: string;
  now?: Date;
}) {
  const { audit, company } = input;
  const date = audit.audit_date;
  const lines = [...input.lines].sort((a, b) => a.sort_order - b.sort_order);
  const sections = SECTIONS.map((s) => ({
    key: s.key,
    title: s.title,
    columns: s.columns,
    rows: lines.filter((l) => l.section === s.key).map((l) => {
      const name = l.item_name + (l.expected_qty ? ` (${l.expected_qty})` : '');
      const comment = l.comment ?? '';
      const cells =
        s.key === 'ppe' ? [l.item_name, fitText(l.result), l.qty ?? '', longDate(l.service_date), expiryText(l, date), comment]
          : s.key === 'hs' ? [l.item_name, fitText(l.result), l.qty ?? '', expiryText(l, date), gaugeText(l.gauge), comment]
            : s.key === 'kit' ? [l.item_name, fitText(l.result), l.plant_no_snapshot ?? '', longDate(l.service_date), expiryText(l, date), comment]
              : [l.item_name, fitText(l.result), l.qty ?? '', labelText(l.label_on), comment];
      return { cells, tone: toneOf(l, date), fullName: name };
    }),
  })).filter((s) => s.rows.length > 0);

  const s = summariseAuditLines(lines as unknown as DraftLine[], date);

  // photos: every suggested slot in order ("Not taken" when it has none), then additional, then photos on N answers
  const slotIds = new Set(input.slots.map((x) => x.id));
  const slotPhotos: ReportPhoto[] = [...input.slots].sort((a, b) => a.sort_order - b.sort_order).flatMap((slot): ReportPhoto[] => {
    const mine = input.photos.filter((p) => p.slot_id === slot.id).sort((a, b) => a.sort_order - b.sort_order);
    const taken = mine.filter((p) => p.path);
    if (taken.length) return taken.map((p) => ({ label: slot.name, path: p.path, skip: null, takenAt: p.taken_at }));
    const old = mine.find((p) => p.skip_reason?.trim());
    return [{ label: slot.name, path: null, skip: old ? `Can’t take photo: ${old.skip_reason?.trim()}` : 'Not taken', takenAt: null }];
  });
  // a photo in a slot that has since been retired from the list
  const retired = input.photos.filter((p) => p.slot_id && !slotIds.has(p.slot_id) && p.path)
    .map((p) => ({ label: p.slot_name ?? 'Photo', path: p.path, skip: null, takenAt: p.taken_at }));
  const extra = input.photos.filter((p) => !p.slot_id && p.path).sort((a, b) => a.sort_order - b.sort_order);
  const photos: ReportPhoto[] = [
    ...slotPhotos,
    ...retired,
    ...extra.map((p) => ({ label: p.caption?.trim() || 'Additional photo', path: p.path, skip: null, takenAt: p.taken_at })),
    ...lines.filter((l) => l.photo_path).map((l) => ({ label: `${l.item_name} (N)`, path: l.photo_path, skip: null, takenAt: l.photo_taken_at ?? null })),
  ];

  const now = input.now ?? new Date();
  return {
    company,
    title: 'Site Audit',
    header: [
      ['Audited by', audit.auditor_name ?? audit.audited_by_name],
      ['Date', longDate(date)],
      ['Van reg', audit.vehicle_reg_snapshot ?? 'No van'],
      ['Team', audit.team_name_snapshot || audit.ganger_name_snapshot || 'Spare van'],
      ['Site', audit.site_visited ?? ''],
    ] as [string, string][],
    summary: { fails: s.fails, expired: s.expired, dueSoon: s.dueSoon, toLookAt: s.toLookAt },
    sections,
    notes: audit.notes?.trim() || null,
    edits: input.edits.map((e) => `Edited by ${e.actor_name || 'Office login'} on ${dateTime(new Date(e.created_at))}: ${e.summary.join('; ')}`),
    photos,
    footer: `Generated ${dateTime(now)} by ${input.generatedBy}`,
  };
}

export type AuditReport = ReturnType<typeof buildAuditReport>;

// ---------------------------------------------------------------- file names

/** "<Gang or van> <reg> <DD Mon YYYY>.pdf", e.g. "Dom Oliver YE24 TNL 05 Nov 2026.pdf" */
export function auditPdfFileName(a: { ganger_name_snapshot: string | null; team_name_snapshot: string | null; vehicle_reg: string | null; audit_date: string }): string {
  const who = a.ganger_name_snapshot?.trim() || a.team_name_snapshot?.trim() || 'Spare van';
  return `${sanitizeName([who, a.vehicle_reg?.trim(), longDate(a.audit_date)].filter(Boolean).join(' '))}.pdf`;
}

export function auditsZipName(from: string | null, to: string | null): string {
  if (from && to) return `Site audits ${longDate(from)} to ${longDate(to)}.zip`;
  if (from) return `Site audits from ${longDate(from)}.zip`;
  if (to) return `Site audits to ${longDate(to)}.zip`;
  return 'Site audits.zip';
}

// ---------------------------------------------------------------- CSV

const cell = (v: string | number | null | undefined) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const toCsv = (rows: (string | number | null | undefined)[][]) => rows.map((r) => r.map(cell).join(',')).join('\n');

export const KIT_STATUS_TEXT: Record<string, string> = { on_van: 'On van', spare: 'Yard Lockup', away_for_service: 'Away for service', removed: 'Scrapped' };

export type RegisterItem = HolderLike & {
  kit_type_id: string; type_name: string; type_sort: number; plant_no: string | null;
  service_date: string | null; expiry_date: string | null;
};

/** Plant register rows: every item (not scrapped), grouped by kit type, then plant no. */
export function plantRegisterRows<T extends RegisterItem>(kit: T[], today: string = todayISO()) {
  return kit
    .filter((k) => k.status !== 'removed')
    .sort((a, b) => a.type_sort - b.type_sort || a.type_name.localeCompare(b.type_name) || (a.plant_no ?? '').localeCompare(b.plant_no ?? ''))
    .map((k) => {
      const w = expiryWording(k.expiry_date, today);
      return {
        type: k.type_name,
        plantNo: k.plant_no ?? '',
        where: holderLabel(k),
        service: shortDate(k.service_date),
        expiry: shortDate(k.expiry_date),
        status: KIT_STATUS_TEXT[k.status] ?? k.status,
        expiryText: k.expiry_date ? w.text : '',
        tone: w.tone,
      };
    });
}

export function plantRegisterCsv<T extends RegisterItem>(kit: T[], today: string = todayISO()): string {
  return toCsv([
    ['Kit type', 'Plant no', 'Where', 'Service date', 'Expiry', 'Status', 'Expiry status'],
    ...plantRegisterRows(kit, today).map((r) => [r.type, r.plantNo, r.where, r.service, r.expiry, r.status, r.expiryText]),
  ]);
}

const LOCKUP_SECTION: Record<string, string> = { ppe: 'PPE', hs: 'Health & safety', other: 'Other' };

export function lockupRows<T extends LockupLine>(lines: T[]) {
  return sortLockup(lines, 'sheet').map((l) => ({
    section: LOCKUP_SECTION[l.section] ?? l.section,
    name: l.name,
    quantity: l.quantity,
    lowAt: l.low_at ?? null,
    low: isLowStock(l.quantity, l.low_at),
  }));
}

export function lockupCsv<T extends LockupLine>(lines: T[]): string {
  return toCsv([
    ['Section', 'Item', 'Count', 'Low at', 'Low stock'],
    ...lockupRows(lines).map((r) => [r.section, r.name, r.quantity, r.lowAt, r.low ? 'LOW' : '']),
  ]);
}
