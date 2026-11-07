/**
 * Yard Lockup rules (pure, unit-tested in lockupLogic.test.ts). Stock lines are
 * counted items (PPE / health & safety / other); plant kit in the lockup is
 * kit_items with status 'spare'. Data access is in lockupService.ts.
 */
import { autoExpiry } from './siteAuditLogic';

export type LockupSection = 'ppe' | 'hs' | 'other';
export type LockupSort = 'sheet' | 'name' | 'quantity';

export const LOCKUP_SECTIONS: { key: LockupSection | 'kit'; title: string }[] = [
  { key: 'ppe', title: 'PPE' },
  { key: 'hs', title: 'Health & safety' },
  { key: 'kit', title: 'Kit' },
  { key: 'other', title: 'Other' },
];

export interface LockupLine {
  id: string;
  section: LockupSection;
  name: string;
  quantity: number;
  /** position on the audit sheet; custom lines come after the sheet's own */
  sheet_order: number;
  note: string | null;
  checklist_item_id: string | null;
  /** warn when the count is at or below this; blank = no warning */
  low_at?: number | null;
}

export interface LockupMovement {
  id: string;
  stock_id: string;
  checklist_item_id: string | null;
  item_name: string;
  kind: 'added' | 'adjusted' | 'issued' | 'returned';
  quantity: number;
  employee_id: string | null;
  created_at: string;
}

/** Change a count. Never below 0; whole numbers only; says why if not. */
export function applyStockDelta(quantity: number, delta: number): { ok: boolean; quantity: number; error?: string } {
  if (!Number.isInteger(delta) || delta === 0) return { ok: false, quantity, error: 'Enter a whole number.' };
  const next = quantity + delta;
  if (next < 0) return { ok: false, quantity, error: `Only ${quantity} in the Yard Lockup, so ${-delta} can’t be taken out.` };
  return { ok: true, quantity: next };
}

/** Stock-take: the typed count as a change to the current count (whole number, 0 or more). */
export function countChange(current: number, typed: string): { ok: true; delta: number } | { ok: false; error: string } {
  const n = Number(typed.trim());
  if (typed.trim() === '' || !Number.isInteger(n) || n < 0) return { ok: false, error: 'Type the count (a whole number, 0 or more).' };
  if (n === current) return { ok: false, error: 'That’s already the count.' };
  return { ok: true, delta: n - current };
}

/** "Add": how many came in, added to the current count (10 + 10 = 20). */
export function addedChange(current: number, typed: string): { ok: true; delta: number; after: number } | { ok: false; error: string } {
  const n = Number(typed.trim());
  if (typed.trim() === '' || !Number.isInteger(n) || n < 1) return { ok: false, error: 'Type how many came in (1 or more).' };
  return { ok: true, delta: n, after: current + n };
}

const SECTION_ORDER: Record<LockupSection, number> = { ppe: 0, hs: 1, other: 2 };

/** Always grouped by section in audit-sheet order; the sort applies inside each section. */
export function sortLockup<T extends LockupLine>(lines: T[], by: LockupSort): T[] {
  return [...lines].sort((a, b) => {
    const s = SECTION_ORDER[a.section] - SECTION_ORDER[b.section];
    if (s) return s;
    if (by === 'name') return a.name.localeCompare(b.name);
    if (by === 'quantity') return a.quantity - b.quantity || a.sheet_order - b.sheet_order;
    return a.sheet_order - b.sheet_order || a.name.localeCompare(b.name);
  });
}

/** What a person still holds from the lockup: issued − returned, per line. */
export function netIssued(moves: LockupMovement[], employeeId: string) {
  const byLine = new Map<string, { stock_id: string; item_name: string; checklist_item_id: string | null; quantity: number }>();
  for (const m of moves) {
    if (m.employee_id !== employeeId || (m.kind !== 'issued' && m.kind !== 'returned')) continue;
    const row = byLine.get(m.stock_id) ?? { stock_id: m.stock_id, item_name: m.item_name, checklist_item_id: m.checklist_item_id, quantity: 0 };
    row.quantity += m.kind === 'issued' ? m.quantity : -m.quantity;
    byLine.set(m.stock_id, row);
  }
  return [...byLine.values()].filter((r) => r.quantity > 0);
}

/** Issued (net of returns) to a person since their last audit, per audit-sheet item. */
export function issuedSince(moves: LockupMovement[], employeeId: string, sinceIso: string | null): Map<string, number> {
  const out = new Map<string, number>();
  for (const m of moves) {
    if (m.employee_id !== employeeId || !m.checklist_item_id) continue;
    if (m.kind !== 'issued' && m.kind !== 'returned') continue;
    if (sinceIso && m.created_at <= sinceIso) continue;
    out.set(m.checklist_item_id, (out.get(m.checklist_item_id) ?? 0) + (m.kind === 'issued' ? m.quantity : -m.quantity));
  }
  return out;
}

/** Issuing a dated PPE item (hard hats): new expiry for that person = date on hat + interval. */
export const lockupExpiryFromHat = (dateOnHat: string | null, months: number | null | undefined) => autoExpiry(dateOnHat, months);

// ---------------------------------------------------------------- low stock (round 5)

/** At or below "Low at" is low. Blank "Low at" = no warning. */
export const isLowStock = (quantity: number, lowAt: number | null | undefined): boolean =>
  lowAt !== null && lowAt !== undefined && quantity <= lowAt;

/**
 * The low items, in audit-sheet order. Used for the dashboard badge and Needs attention.
 * An item kept as several lines (dated H&S, one line per expiry) is one item: its lines are
 * added up and checked against the highest "Low at" (round 15). Returns one row per item with
 * the total as its quantity.
 */
export function lowStockLines<T extends LockupLine>(lines: T[]): T[] {
  const groups = new Map<string, T>();
  for (const l of lines) {
    const key = l.checklist_item_id ?? l.id;
    const g = groups.get(key);
    if (!g) groups.set(key, { ...l });
    else {
      g.quantity += l.quantity;
      if (l.low_at !== null && l.low_at !== undefined) g.low_at = Math.max(g.low_at ?? 0, l.low_at);
    }
  }
  return sortLockup([...groups.values()].filter((l) => isLowStock(l.quantity, l.low_at)), 'sheet');
}

export const lowStockBadgeText = (n: number): string | null => (n > 0 ? `${n} low stock` : null);
