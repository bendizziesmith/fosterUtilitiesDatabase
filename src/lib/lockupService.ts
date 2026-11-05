import { supabase } from './supabase';
import { applyStockDelta, LockupMovement, LockupSection } from './lockupLogic';

/**
 * Data access for the Yard Lockup (kit_lockup_* tables; admin-only RLS).
 * Changes go through Postgres functions so the count never goes below 0 and
 * every change is logged with the "Who's doing this?" name.
 */

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

export interface LockupRow {
  id: string;
  section: LockupSection;
  checklist_item_id: string | null;
  name: string;
  expected_qty: string | null;
  service_interval_months: number | null;
  date_label: string | null;
  quantity: number;
  note: string | null;
  is_test: boolean;
  sheet_order: number;
  updated_at: string;
  /** "Low at": warn when the count is at or below this; null = no warning */
  low_at: number | null;
}

export interface LockupMovementRow extends LockupMovement {
  qty_after: number;
  person_name: string | null;
  actor_name: string | null;
  date_on_hat: string | null;
  note: string | null;
  is_test: boolean;
}

export interface PersonIssue {
  employee_id: string;
  stock_id: string;
  section: LockupSection;
  checklist_item_id: string | null;
  item_name: string;
  quantity_held: number;
  last_issued_at: string | null;
  is_test: boolean;
}

export async function listLockup(): Promise<LockupRow[]> {
  return (check(await supabase.from('kit_lockup_overview').select('*')) as LockupRow[]) ?? [];
}

/** Movements with the item name; for one person (issued / returned) or all. */
export async function listLockupMovements(employeeId?: string): Promise<LockupMovementRow[]> {
  let q = supabase.from('kit_lockup_movements').select('*');
  if (employeeId) q = q.eq('employee_id', employeeId);
  const [moves, lines] = await Promise.all([
    q.order('created_at', { ascending: false }),
    supabase.from('kit_lockup_overview').select('id, name, checklist_item_id'),
  ]);
  const byId = new Map(((check(lines) as { id: string; name: string; checklist_item_id: string | null }[]) ?? []).map((l) => [l.id, l]));
  return ((check(moves) as Omit<LockupMovementRow, 'item_name' | 'checklist_item_id'>[]) ?? []).map((m) => ({
    ...m,
    item_name: byId.get(m.stock_id)?.name ?? 'Item',
    checklist_item_id: byId.get(m.stock_id)?.checklist_item_id ?? null,
  }));
}

/** What a person still holds from the lockup (net of returns). */
export async function listPersonIssues(employeeId: string): Promise<PersonIssue[]> {
  return (check(await supabase.from('kit_lockup_person_issues').select('*').eq('employee_id', employeeId).gt('quantity_held', 0)) as PersonIssue[]) ?? [];
}

export async function addToLockup(input: {
  section: LockupSection;
  checklistItemId: string | null;
  customName: string | null;
  quantity: number;
  note: string | null;
  isTest: boolean;
  actorId: string | null;
}): Promise<string> {
  return check(await supabase.rpc('kit_lockup_add', {
    p_section: input.section,
    p_checklist_item_id: input.checklistItemId,
    p_custom_name: input.customName,
    p_quantity: input.quantity,
    p_note: input.note,
    p_is_test: input.isTest,
    p_actor_id: input.actorId,
  })) as string;
}

export async function adjustLockup(stockId: string, delta: number, actorId: string | null): Promise<number> {
  return check(await supabase.rpc('kit_lockup_adjust', { p_stock_id: stockId, p_delta: delta, p_note: null, p_actor_id: actorId })) as number;
}

/** − / + with the same rule as the database, so the message shows without a round trip. */
export async function adjustLockupChecked(line: { id: string; quantity: number }, delta: number, actorId: string | null): Promise<number> {
  const r = applyStockDelta(line.quantity, delta);
  if (!r.ok) throw new Error(r.error);
  return adjustLockup(line.id, delta, actorId);
}

export async function issueFromLockup(input: {
  stockId: string;
  employeeId: string;
  quantity: number;
  dateOnHat: string | null;
  note: string | null;
  actorId: string | null;
}): Promise<number> {
  return check(await supabase.rpc('kit_lockup_issue', {
    p_stock_id: input.stockId,
    p_employee_id: input.employeeId,
    p_quantity: input.quantity,
    p_date_on_hat: input.dateOnHat,
    p_note: input.note,
    p_actor_id: input.actorId,
  })) as number;
}

export async function returnToLockup(input: {
  stockId: string;
  employeeId: string;
  quantity: number;
  note: string | null;
  actorId: string | null;
}): Promise<number> {
  return check(await supabase.rpc('kit_lockup_return', {
    p_stock_id: input.stockId,
    p_employee_id: input.employeeId,
    p_quantity: input.quantity,
    p_note: input.note,
    p_actor_id: input.actorId,
  })) as number;
}

export async function setLockupNote(stockId: string, note: string | null): Promise<void> {
  check(await supabase.from('kit_lockup_stock').update({ note: note?.trim() || null }).eq('id', stockId));
}

/** "Low at" for a stock line; null clears the warning. */
export async function setLockupLowAt(stockId: string, lowAt: number | null): Promise<void> {
  if (lowAt !== null && (!Number.isInteger(lowAt) || lowAt < 0)) throw new Error('“Low at” must be a whole number, 0 or more.');
  check(await supabase.from('kit_lockup_stock').update({ low_at: lowAt }).eq('id', stockId));
}
