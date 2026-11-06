/**
 * Dated H&S items (round 15): Fire ext 2KG dry powder, First aid kit, Eye wash, Burns kit.
 * The fire extinguisher is "tested" (Date tested + expiry 12 months on, changeable);
 * the other three carry just an expiry typed from the label. No other item gets dates.
 * Pure rules, tested in hsDatesLogic.test.ts. Used by the Update sheet and the Yard Lockup.
 */
import { autoExpiry, getExpiryStatus, ServiceExpiryState } from './siteAuditLogic';

export type HsDateKind = 'tested' | 'expiry';

/** The 4 = H&S lines with an expiry; the one with a service interval (fire extinguisher) is tested. */
export function hsDateKind(
  item: { section: string; name?: string; has_expiry?: boolean | null; service_interval_months?: number | null } | null | undefined
): HsDateKind | null {
  if (!item || item.section !== 'hs' || !item.has_expiry) return null;
  return item.service_interval_months ? 'tested' : 'expiry';
}

export type HsWhat = 'tested' | 'replaced';

export function hsUpdateOptions(kind: HsDateKind): { value: HsWhat; label: string; hint: string }[] {
  const replaced = { value: 'replaced' as const, label: 'Replaced with new', hint: kind === 'tested' ? 'New extinguisher: its date tested and expiry' : 'New one issued: type the expiry from the label' };
  return kind === 'tested'
    ? [{ value: 'tested', label: 'Tested', hint: 'Same extinguisher, new test date' }, replaced]
    : [replaced];
}

export const FIRE_EXT_MONTHS = 12;

export function hsUpdateFields(kind: HsDateKind): { testedLabel: string | null; expiryLabel: string; months: number | null } {
  return kind === 'tested'
    ? { testedLabel: 'Date tested', expiryLabel: 'Expiry', months: FIRE_EXT_MONTHS }
    : { testedLabel: null, expiryLabel: 'New expiry date', months: null };
}

export function hsUpdateInput(
  kind: HsDateKind,
  what: HsWhat,
  d: { testedDate: string | null; expiry: string | null }
): { ok: true; action: HsWhat; testedDate: string | null; expiryDate: string } | { ok: false; error: string } {
  if (what === 'tested' && kind !== 'tested') return { ok: false, error: 'Only the fire extinguisher can be tested.' };
  if (kind === 'tested' && !d.testedDate) return { ok: false, error: 'Enter the date tested.' };
  if (!d.expiry) return { ok: false, error: kind === 'tested' ? 'Enter the expiry date.' : 'Enter the new expiry date.' };
  return { ok: true, action: what, testedDate: kind === 'tested' ? d.testedDate : null, expiryDate: d.expiry };
}

/** Starting dates: fire extinguisher tested today (expiry filled 12 months on); the others blank. */
export function hsStartDates(kind: HsDateKind | null, today: string): ServiceExpiryState {
  if (kind !== 'tested') return { serviceDate: null, expiry: null, expiryManual: false };
  return { serviceDate: today, expiry: autoExpiry(today, FIRE_EXT_MONTHS), expiryManual: false };
}

/** Add to lockup / Return to lockup: the dates the 4 must have. */
export function lockupDatesError(kind: HsDateKind | null, testedDate: string | null, expiry: string | null): string | null {
  if (!kind) return null;
  if (kind === 'tested' && !testedDate) return 'Enter the date tested.';
  if (!expiry) return 'Enter the expiry date.';
  return null;
}

// ---------------------------------------------------------------- lockup lines with dates

export interface DatedLine {
  id: string;
  section: 'ppe' | 'hs' | 'other';
  name: string;
  quantity: number;
  sheet_order: number;
  note: string | null;
  checklist_item_id: string | null;
  low_at?: number | null;
  tested_date: string | null;
  expiry_date: string | null;
  date_kind: HsDateKind | null;
  is_test: boolean;
}

/** One item in the lockup: the audit-sheet line, or a custom line on its own. */
export const lockupGroupKey = (l: { id: string; checklist_item_id: string | null }) => l.checklist_item_id ?? l.id;

const byExpiry = (a: { expiry_date: string | null }, b: { expiry_date: string | null }) =>
  (a.expiry_date ?? '9999').localeCompare(b.expiry_date ?? '9999');

export interface LockupGroup<T extends DatedLine> {
  key: string;
  name: string;
  section: T['section'];
  sheet_order: number;
  dateKind: HsDateKind | null;
  /** oldest expiry first */
  lines: T[];
  total: number;
  low_at: number | null;
}

export function groupLockupLines<T extends DatedLine>(lines: T[]): LockupGroup<T>[] {
  const map = new Map<string, LockupGroup<T>>();
  for (const l of lines) {
    const key = lockupGroupKey(l);
    const g = map.get(key) ?? { key, name: l.name, section: l.section, sheet_order: l.sheet_order, dateKind: l.date_kind, lines: [] as T[], total: 0, low_at: null };
    g.lines.push(l);
    g.total += l.quantity;
    if (l.low_at !== null && l.low_at !== undefined) g.low_at = Math.max(g.low_at ?? 0, l.low_at);
    map.set(key, g);
  }
  for (const g of map.values()) g.lines.sort(byExpiry);
  return [...map.values()];
}

/** Adding with the same expiry adds to that line; null = a new line. */
export function lineForExpiry<T extends DatedLine>(lines: T[], checklistItemId: string, expiry: string | null): T | null {
  return lines.find((l) => l.checklist_item_id === checklistItemId && (l.expiry_date ?? null) === (expiry ?? null)) ?? null;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthYear = (iso: string) => {
  const [y, m] = iso.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
};
const dayMonthYear = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return `${String(d).padStart(2, '0')} ${MONTHS[m - 1]} ${y}`;
};

/** "Eye wash · 6 · expires Mar 2028" (fire extinguisher: "… · tested 06 Nov 2026 · expires Nov 2027") */
export function lockupLineLabel(l: Pick<DatedLine, 'name' | 'quantity' | 'tested_date' | 'expiry_date' | 'date_kind'>): string {
  return [
    l.name,
    String(l.quantity),
    l.date_kind === 'tested' && l.tested_date ? `tested ${dayMonthYear(l.tested_date)}` : null,
    l.expiry_date ? `expires ${monthYear(l.expiry_date)}` : l.date_kind ? 'no dates' : null,
  ].filter(Boolean).join(' · ');
}

/** "Issue to": the lines with stock, oldest expiry first (the first is pre-selected). */
export function issueLineOptions<T extends DatedLine>(lines: T[]): T[] {
  return lines.filter((l) => l.quantity > 0).sort(byExpiry);
}

/** What "Issue to" copies onto the person's record (their reminder updates). */
export function issueCopiesDates(l: Pick<DatedLine, 'date_kind' | 'tested_date' | 'expiry_date'>): { expiryDate: string | null; testedDate: string | null } | null {
  if (!l.date_kind) return null;
  return { expiryDate: l.expiry_date, testedDate: l.date_kind === 'tested' ? l.tested_date : null };
}

export interface LockupAttentionRow {
  source: 'lockup';
  item_id: string;
  item_name: string;
  quantity: number;
  expiry_date: string;
  days_left: number;
  expiry_status: 'expired' | 'due_soon';
  is_test: boolean;
}

/** Lockup lines (with stock) that are expired or due within 30 days, most overdue first. */
export function lockupAttentionRows(lines: DatedLine[], today: string): LockupAttentionRow[] {
  const out: LockupAttentionRow[] = [];
  for (const l of lines) {
    if (!l.date_kind || !l.expiry_date || l.quantity < 1) continue;
    const { status, daysLeft } = getExpiryStatus(l.expiry_date, today);
    if ((status === 'expired' || status === 'due_soon') && daysLeft !== null) {
      out.push({ source: 'lockup', item_id: l.id, item_name: l.name, quantity: l.quantity, expiry_date: l.expiry_date, days_left: daysLeft, expiry_status: status, is_test: l.is_test });
    }
  }
  return out.sort((a, b) => a.days_left - b.days_left);
}
