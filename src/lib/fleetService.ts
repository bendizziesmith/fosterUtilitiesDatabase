import { supabase } from './supabase';
import { OffRoadMove } from './fleetLogic';
import { rememberPersonVan } from './vanChangeService';

/**
 * Round 6 data access: take out of van, van off the road, the audit schedule
 * setting, editing / deleting audits, deleting plant completely.
 *
 * SAFETY: employees is an existing live table and is written only by
 * takeOutOfVan in live mode. vehicles is never written.
 */

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

const BUCKET = 'audit-photos';

/** "Take out of van": the van becomes a spare van and keeps all the person's kit. */
export async function takeOutOfVan(input: {
  personId: string;
  vehicleId: string;
  note: string | null;
  testMode: boolean;
  actorId: string | null;
}): Promise<{ vanSaved: boolean; moved: number }> {
  const moved = check(await supabase.rpc('kit_take_out_of_van', {
    p_person_id: input.personId,
    p_vehicle_id: input.vehicleId,
    p_note: input.note,
    p_is_test: input.testMode,
    p_actor_id: input.actorId,
  })) as number;
  if (input.testMode) return { vanSaved: false, moved };
  check(await supabase.from('employees').update({ assigned_vehicle_id: null }).eq('id', input.personId));
  await rememberPersonVan(input.personId, null, false);
  return { vanSaved: true, moved };
}

/** A van unassigned in Employee Management: its kit stays with the van (spare-van kit). */
export async function reconcileUnassigned(isTest: boolean): Promise<number> {
  return (check(await supabase.rpc('kit_reconcile_unassigned', { p_is_test: isTest })) as number) ?? 0;
}

export interface VanStatusRow {
  id: string;
  vehicle_id: string | null;
  vehicle_reg_snapshot: string | null;
  reason: 'broken_down' | 'leaving_fleet' | 'other';
  note: string | null;
  off_at: string;
  off_actor_name: string | null;
  is_test: boolean;
}

/** Vans currently off the road. */
export async function listOffRoad(): Promise<VanStatusRow[]> {
  return (check(await supabase.from('kit_van_status').select('*').is('back_at', null)) as VanStatusRow[]) ?? [];
}

export async function vanOffRoad(input: {
  vehicleId: string;
  reason: VanStatusRow['reason'];
  note: string | null;
  moves: OffRoadMove[];
  isTest: boolean;
  actorId: string | null;
}): Promise<void> {
  check(await supabase.rpc('kit_van_off_road', {
    p_vehicle_id: input.vehicleId,
    p_reason: input.reason,
    p_note: input.note,
    p_moves: input.moves,
    p_is_test: input.isTest,
    p_actor_id: input.actorId,
  }));
}

export async function vanBackOnRoad(vehicleId: string, actorId: string | null): Promise<void> {
  check(await supabase.rpc('kit_van_back_on_road', { p_vehicle_id: vehicleId, p_actor_id: actorId }));
}

// ---------------------------------------------------------------- schedule setting

export async function getAuditInterval(): Promise<number> {
  const rows = check(await supabase.from('audit_settings').select('audit_interval_months').limit(1)) as { audit_interval_months: number }[];
  return rows?.[0]?.audit_interval_months ?? 6;
}

export async function setAuditInterval(months: number, byName: string | null): Promise<void> {
  if (!Number.isInteger(months) || months < 1 || months > 60) throw new Error('Audit every … months must be between 1 and 60.');
  check(await supabase.from('audit_settings').update({ audit_interval_months: months, updated_by_name: byName, updated_at: new Date().toISOString() }).eq('id', true));
}

// ---------------------------------------------------------------- edit / delete audits

export interface AuditEditRow {
  id: string;
  audit_id: string;
  actor_name: string | null;
  summary: string[];
  created_at: string;
}

export async function listAuditEdits(auditId: string): Promise<AuditEditRow[]> {
  return (check(await supabase.from('audit_edits').select('id, audit_id, actor_name, summary, created_at').eq('audit_id', auditId).order('created_at')) as AuditEditRow[]) ?? [];
}

/** Changes come from diffAuditLines; only line, field and new value are sent (the database reads the old value). */
export async function editAudit(
  auditId: string,
  changes: { line_id: string; field: string; from: string | null; to: string | null }[],
  actorId: string | null
): Promise<string[]> {
  return check(await supabase.rpc('audit_edit', {
    p_audit_id: auditId,
    p_changes: changes.map((c) => ({ line_id: c.line_id, field: c.field, to: c.to })),
    p_actor_id: actorId,
  })) as string[];
}

/** Deletes the audit (lines, members, photos, edits); then its photo files from storage. Kit stays where it is. */
export async function deleteAudit(auditId: string, reason: string, actorId: string | null): Promise<void> {
  // the standard / additional photos go with the audit; collect their files first
  const ph = await supabase.from('audit_photos').select('path').eq('audit_id', auditId);
  const photoPaths = ph.error ? [] : ((ph.data as { path: string | null }[]) ?? []).map((p) => p.path).filter((p): p is string => !!p);
  const linePaths = (check(await supabase.rpc('audit_delete', { p_audit_id: auditId, p_reason: reason, p_actor_id: actorId })) as string[]) ?? [];
  const paths = [...new Set([...linePaths, ...photoPaths])];
  if (paths.length) check(await supabase.storage.from(BUCKET).remove(paths));
}

// ---------------------------------------------------------------- delete plant completely

/** Gone from every record (history too). Past audits keep only their own text line. */
export async function deletePlant(itemId: string, confirm: string, actorId: string | null): Promise<void> {
  const paths = (check(await supabase.rpc('kit_delete_item', { p_item_id: itemId, p_confirm: confirm, p_actor_id: actorId })) as string[]) ?? [];
  if (paths.length) check(await supabase.storage.from(BUCKET).remove(paths));
}

/** Caption of a photo on a submitted audit: through the database so the change is allowed past the lock and logged. */
export async function setPhotoCaption(photoId: string, caption: string, actorId: string | null): Promise<string> {
  return check(await supabase.rpc('audit_photo_caption', { p_photo_id: photoId, p_caption: caption.trim(), p_actor_id: actorId })) as string;
}
