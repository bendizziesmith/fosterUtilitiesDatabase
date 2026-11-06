import {
  supabase,
  AuditChecklistItem,
  KitType,
  KitItemOverview,
  KitVanKitListRow,
  SiteAuditSummary,
  SiteAudit,
  AuditMemberRow,
  AuditLineRow,
  KitRecentUpdate,
  KitStatus,
  AuditPpeItem,
  Auditor,
  AuditPhotoSlot,
  AuditPhotoRow,
} from './supabase';
import { draftsInProgress } from './draftLogic';
import type { AuditResolution, LineFollowup } from './followupLogic';
import { preparePhoto, StampInfo } from './photoUpload';
import { photoPath, TakenAtSource } from './photoLogic';
import { AttentionRow, AuditTarget, DraftLine, FileDeletion, TeamMember, buildTeam } from './siteAuditLogic';
import { listLockup } from './lockupService';
import { listOffRoad, getAuditInterval } from './fleetService';
import { auditSchedule } from './fleetLogic';
import { buildAuditTargets, auditTargetsOf, todayISO } from './siteAuditLogic';
import { lowStockLines } from './lockupLogic';
import { getWeekEndingSunday } from './timesheetUtils';

/**
 * Data access for Site Audits and Kit & Plant. All tables are admin-only (RLS).
 * Multi-step changes (submit, update, swap, move) run as Postgres functions so
 * they either fully happen or not at all, and are logged in kit_history.
 */

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

// ---------------------------------------------------------------- reference data

export interface StaffRow {
  id: string;
  full_name: string;
  role: string;
  assigned_vehicle_id: string | null;
}
export interface VanRow {
  id: string;
  registration_number: string;
}

export async function loadAuditReferenceData(): Promise<{
  employees: StaffRow[];
  vehicles: VanRow[];
  checklist: AuditChecklistItem[];
  kitTypes: KitType[];
  auditors: Auditor[];
  /** standard photos on every audit; empty until the round 9 database step is run */
  photoSlots: AuditPhotoSlot[];
}> {
  const [emp, veh, chk, kt, aud, slots] = await Promise.all([
    supabase.from('employees').select('id, full_name, role, assigned_vehicle_id').order('full_name'),
    supabase.from('vehicles').select('id, registration_number').order('registration_number'),
    supabase.from('audit_checklist_items').select('*').eq('is_active', true).order('sort_order'),
    supabase.from('kit_types').select('*').eq('is_active', true).order('sort_order'),
    supabase.from('audit_auditors').select('*').eq('is_active', true).order('sort_order'),
    supabase.from('audit_photo_slots').select('*').eq('is_active', true).order('sort_order'),
  ]);
  return {
    employees: check(emp) ?? [],
    vehicles: check(veh) ?? [],
    checklist: check(chk) ?? [],
    kitTypes: check(kt) ?? [],
    auditors: check(aud) ?? [],
    photoSlots: slots.error ? [] : ((slots.data as AuditPhotoSlot[]) ?? []),
  };
}

export async function createKitType(name: string, serviceIntervalMonths: number | null = null): Promise<KitType> {
  const { data: existing } = await supabase.from('kit_types').select('sort_order').order('sort_order', { ascending: false }).limit(1);
  const next = ((existing?.[0]?.sort_order as number | undefined) ?? 0) + 10;
  return check(
    await supabase
      .from('kit_types')
      .insert({ name: name.trim(), sort_order: next, service_interval_months: serviceIntervalMonths })
      .select('*')
      .single()
  ) as KitType;
}

/** Team for a gang: ganger + latest weekly timesheet labourers, else latest HAVS week. */
export async function loadTeam(ganger: StaffRow | null, employees: StaffRow[]): Promise<TeamMember[]> {
  if (!ganger) return [];
  const weekEnding = getWeekEndingSunday();
  const ts = check(
    await supabase
      .from('timesheet_weeks')
      .select('labourer_1_name, labourer_2_name, week_ending')
      .eq('ganger_employee_id', ganger.id)
      .lte('week_ending', weekEnding)
      .order('week_ending', { ascending: false })
      .limit(1)
  ) as { labourer_1_name: string | null; labourer_2_name: string | null }[];

  let havsMembers: { employee_id: string | null; manual_name: string | null; person_type: string }[] = [];
  if (!ts?.length) {
    const weeks = check(
      await supabase
        .from('havs_weeks')
        .select('id')
        .eq('ganger_id', ganger.id)
        .lte('week_ending', weekEnding)
        .order('week_ending', { ascending: false })
        .limit(1)
    ) as { id: string }[];
    if (weeks?.length) {
      havsMembers = (check(
        await supabase
          .from('havs_week_members')
          .select('employee_id, manual_name, person_type')
          .eq('havs_week_id', weeks[0].id)
      ) as typeof havsMembers) ?? [];
    }
  }
  return buildTeam({ ganger, timesheet: ts?.[0] ?? null, havsMembers, employees });
}

/** One row of audit_holder_answers: what the holder answered last time, per checklist item. */
export interface HolderAnswer {
  checklist_item_id: string;
  qty: string | null;
  service_date: string | null;
  label_on: 'Y' | 'N' | null;
  date_tag: string | null;
}

/** person:<id> → that person; van:<id> → that spare van */
export const holderParams = (t: Pick<AuditTarget, 'kind' | 'personId' | 'vehicleId'>) => ({
  holderEmployeeId: t.kind === 'person' ? t.personId : null,
  vehicleId: t.kind === 'spare_van' ? t.vehicleId : null,
});

/**
 * Everything a person (or spare van) holds: kit, PPE expiry dates, "not carried"
 * list, and the lines of their last submitted audit (for quantities).
 */
export async function loadHolderRecord(t: Pick<AuditTarget, 'kind' | 'personId' | 'vehicleId'>): Promise<{
  heldKit: KitItemOverview[];
  ppe: AuditPpeItem[];
  notCarried: KitVanKitListRow[];
  lastLines: AuditLineRow[];
  /** last answers kept on their record: qty, date on hat, Label on, date / tag (round 8) */
  answers: HolderAnswer[];
  lastAuditId: string | null;
  /** when their last audit was submitted (for "Issued since last audit") */
  lastAuditAt: string | null;
}> {
  const { holderEmployeeId, vehicleId } = holderParams(t);
  if (!holderEmployeeId && !vehicleId) return { heldKit: [], ppe: [], notCarried: [], lastLines: [], answers: [], lastAuditId: null, lastAuditAt: null };
  // rows held by this person, or (no person) by this spare van
  const own = (table: string, cols = '*') => {
    const q = supabase.from(table).select(cols);
    return holderEmployeeId ? q.eq('holder_employee_id', holderEmployeeId) : q.is('holder_employee_id', null).eq('vehicle_id', vehicleId as string);
  };
  const [kit, ppe, vkl, audits, answers] = await Promise.all([
    holderEmployeeId
      ? supabase.from('kit_items_overview').select('*').eq('status', 'on_van').eq('holder_employee_id', holderEmployeeId).order('type_sort')
      : supabase.from('kit_items_overview').select('*').eq('status', 'on_van').is('holder_employee_id', null).eq('spare_vehicle_id', vehicleId as string).order('type_sort'),
    own('audit_ppe_items'),
    own('kit_van_kit_list'),
    own('audit_site_audits', 'id, audit_date, submitted_at').eq('status', 'submitted')
      .order('audit_date', { ascending: false }).order('submitted_at', { ascending: false }).limit(1),
    own('audit_holder_answers', 'checklist_item_id, qty, service_date, label_on, date_tag'),
  ]);
  const last = (check(audits) as unknown as { id: string; submitted_at: string | null }[] | null)?.[0] ?? null;
  const lastLines = last
    ? ((check(await supabase.from('audit_lines').select('*').eq('audit_id', last.id).order('sort_order')) as AuditLineRow[]) ?? [])
    : [];
  return {
    heldKit: (check(kit) as unknown as KitItemOverview[]) ?? [],
    ppe: (check(ppe) as unknown as AuditPpeItem[]) ?? [],
    notCarried: (check(vkl) as unknown as KitVanKitListRow[]) ?? [],
    lastLines,
    answers: (check(answers) as unknown as HolderAnswer[]) ?? [],
    lastAuditId: last?.id ?? null,
    lastAuditAt: last?.submitted_at ?? null,
  };
}

// ---------------------------------------------------------------- audits

export type AuditHeader = Omit<SiteAudit, 'id' | 'status' | 'submitted_at'>;

const LINE_COLUMNS = [
  'section', 'checklist_item_id', 'kit_type_id', 'item_name', 'expected_qty', 'result', 'qty',
  'expiry_date', 'service_date', 'plant_no_snapshot', 'date_tag', 'label_on', 'gauge', 'comment', 'photo_path', 'photo_taken_at', 'kit_item_id',
] as const;

function lineToRow(auditId: string, line: DraftLine, index: number) {
  const row: Record<string, unknown> = { audit_id: auditId, sort_order: index };
  for (const col of LINE_COLUMNS) {
    const v = (line as unknown as Record<string, unknown>)[col];
    row[col] = typeof v === 'string' ? (v.trim() === '' ? null : v.trim()) : v ?? null;
  }
  return row;
}

/** Saves a draft (new or existing). Members and lines are replaced as a whole. */
export async function saveDraftAudit(
  auditId: string | null,
  header: AuditHeader,
  members: TeamMember[],
  lines: DraftLine[],
  photos: AuditPhotoRow[] = []
): Promise<string> {
  let id = auditId;
  if (!id) {
    const created = check(
      await supabase.from('audit_site_audits').insert({ ...header, status: 'draft' }).select('id').single()
    ) as { id: string };
    id = created.id;
  } else {
    check(await supabase.from('audit_site_audits').update(header).eq('id', id).eq('status', 'draft'));
    check(await supabase.from('audit_members').delete().eq('audit_id', id));
    check(await supabase.from('audit_lines').delete().eq('audit_id', id));
  }
  if (members.length) {
    check(
      await supabase.from('audit_members').insert(
        members.map((m, i) => ({ audit_id: id, employee_id: m.employee_id, name: m.name, sort_order: i }))
      )
    );
  }
  if (lines.length) {
    check(await supabase.from('audit_lines').insert(lines.map((l, i) => lineToRow(id as string, l, i))));
  }
  await saveAuditPhotos(id, photos, header.is_test);
  return id;
}

/** Photo rows are replaced as a whole, like lines (the files are already uploaded). */
async function saveAuditPhotos(auditId: string, photos: AuditPhotoRow[], isTest: boolean) {
  const keep = photos.filter((p) => p.path || (p.slot_id && p.skip_reason?.trim()));
  const del = await supabase.from('audit_photos').delete().eq('audit_id', auditId);
  // before the round 9 database step the table is missing: fine while there are no photos
  if (del.error) {
    if (!keep.length) return;
    throw new Error(del.error.message);
  }
  if (!keep.length) return;
  check(await supabase.from('audit_photos').insert(keep.map((p, i) => ({
    audit_id: auditId,
    slot_id: p.slot_id,
    slot_name: p.slot_name,
    path: p.path,
    caption: p.caption?.trim() || null,
    skip_reason: p.path ? null : p.skip_reason?.trim() || null,
    taken_at: p.taken_at,
    sort_order: i,
    is_test: isTest,
  }))));
}

export async function listAuditPhotos(auditId: string): Promise<AuditPhotoRow[]> {
  const r = await supabase.from('audit_photos').select('*').eq('audit_id', auditId).order('sort_order');
  return r.error ? [] : ((r.data as AuditPhotoRow[]) ?? []);
}

export async function submitAudit(auditId: string): Promise<void> {
  check(await supabase.rpc('audit_submit', { p_audit_id: auditId }));
}

export async function listAuditSummaries(): Promise<SiteAuditSummary[]> {
  return check(
    await supabase.from('audit_site_audit_summary').select('*').order('audit_date', { ascending: false }).order('created_at', { ascending: false })
  ) ?? [];
}

export async function getAudit(auditId: string): Promise<{
  audit: SiteAudit;
  members: AuditMemberRow[];
  lines: AuditLineRow[];
  photos: AuditPhotoRow[];
}> {
  const [a, m, l, p] = await Promise.all([
    supabase.from('audit_site_audits').select('*').eq('id', auditId).single(),
    supabase.from('audit_members').select('*').eq('audit_id', auditId).order('sort_order'),
    supabase.from('audit_lines').select('*').eq('audit_id', auditId).order('sort_order'),
    listAuditPhotos(auditId),
  ]);
  return { audit: check(a), members: check(m) ?? [], lines: check(l) ?? [], photos: p };
}

// ---------------------------------------------------------------- Needs attention + recent

export async function listAttention(): Promise<AttentionRow[]> {
  return (check(await supabase.from('audit_needs_attention').select('*')) as AttentionRow[]) ?? [];
}

export async function listRecentUpdates(limit = 10): Promise<KitRecentUpdate[]> {
  return check(
    await supabase.from('kit_recent_updates').select('*').order('created_at', { ascending: false }).limit(limit)
  ) ?? [];
}

export async function getDashboardCounts(): Promise<{
  expired: number;
  dueSoon: number;
  onVans: number;
  spares: number;
  /** Yard Lockup stock lines at or below their "Low at" */
  lowStock: number;
  /** gangs / spare vans overdue, never audited, or due within 30 days */
  auditsDue: number;
  /** audits saved as a draft, not submitted yet */
  drafts: number;
}> {
  const [att, kit, lockup] = await Promise.all([
    supabase.from('audit_needs_attention').select('expiry_status'),
    supabase.from('kit_items').select('status').in('status', ['on_van', 'spare']),
    listLockup().catch(() => []),
  ]);
  let auditsDue = 0;
  let drafts = 0;
  try {
    const [ref, offRoad, interval, audits] = await Promise.all([
      loadAuditReferenceData(), listOffRoad().catch(() => []), getAuditInterval().catch(() => 6), listAuditSummaries(),
    ]);
    const off = new Set(offRoad.map((r) => r.vehicle_id).filter((v): v is string => !!v));
    const targets = auditTargetsOf(buildAuditTargets(ref.employees, ref.vehicles, off));
    drafts = draftsInProgress(audits).length;
    auditsDue = auditSchedule(targets, audits, interval, todayISO()).filter((r) => r.status !== 'ok').length;
  } catch {
    auditsDue = 0;
  }
  const a = (check(att) ?? []) as { expiry_status: string }[];
  const k = (check(kit) ?? []) as { status: string }[];
  return {
    expired: a.filter((r) => r.expiry_status === 'expired').length,
    dueSoon: a.filter((r) => r.expiry_status === 'due_soon').length,
    onVans: k.filter((r) => r.status === 'on_van').length,
    spares: k.filter((r) => r.status === 'spare').length,
    lowStock: lowStockLines(lockup).length,
    auditsDue,
    drafts,
  };
}

// ---------------------------------------------------------------- Kit & Plant

export async function listKit(): Promise<KitItemOverview[]> {
  return check(
    await supabase.from('kit_items_overview').select('*').neq('status', 'removed').order('type_sort').order('plant_no')
  ) ?? [];
}

export async function listVanKitLists(): Promise<KitVanKitListRow[]> {
  return check(await supabase.from('kit_van_kit_list').select('*')) ?? [];
}

/** "Not carried" list for a person (holderEmployeeId) or a spare van (vehicleId). */
export async function setCarried(holderEmployeeId: string | null, vehicleId: string | null, kitTypeId: string, carried: boolean, isTest: boolean) {
  check(await supabase.rpc('kit_set_carried', {
    p_holder_employee_id: holderEmployeeId, p_vehicle_id: holderEmployeeId ? null : vehicleId,
    p_kit_type_id: kitTypeId, p_carried: carried, p_is_test: isTest,
  }));
}

export interface AddKitInput {
  kitTypeId: string;
  plantNo: string | null;
  serviceDate: string | null;
  expiryDate: string | null;
  status: Exclude<KitStatus, 'removed'>;
  /** a person holds it … */
  holderEmployeeId: string | null;
  /** … or, with no person, a spare van */
  vehicleId: string | null;
  serviceCompany: string | null;
  notes: string | null;
  isTest: boolean;
  /** "Who's doing this?" */
  actorId: string | null;
}

export async function addKit(input: AddKitInput): Promise<string> {
  return check(await supabase.rpc('kit_add_item', {
    p_kit_type_id: input.kitTypeId,
    p_plant_no: input.plantNo,
    p_service_date: input.serviceDate || null,
    p_expiry_date: input.expiryDate || null,
    p_status: input.status,
    p_holder_employee_id: input.holderEmployeeId,
    p_vehicle_id: input.holderEmployeeId ? null : input.vehicleId,
    p_service_company: input.serviceCompany,
    p_notes: input.notes,
    p_is_test: input.isTest,
    p_actor_id: input.actorId,
    p_audit_id: null,
  })) as string;
}

export interface UpdateItemInput {
  source: 'kit' | 'ppe';
  itemId: string;
  action: 'reserviced' | 'replaced';
  serviceDate: string | null;
  expiryDate: string | null;
  plantNo: string | null;
  certificatePath: string | null;
  note: string | null;
  actorId: string | null;
}

/** "Update" from Needs attention / Kit page: clears the warning and logs old → new. */
export async function updateAttentionItem(input: UpdateItemInput): Promise<void> {
  if (input.source === 'ppe') {
    check(await supabase.rpc('audit_update_ppe', {
      p_ppe_id: input.itemId,
      p_expiry_date: input.expiryDate || null,
      p_certificate_path: input.certificatePath,
      p_note: input.note,
      p_actor_id: input.actorId,
    }));
    return;
  }
  check(await supabase.rpc('kit_update_item', {
    p_item_id: input.itemId,
    p_action: input.action,
    p_service_date: input.serviceDate || null,
    p_expiry_date: input.expiryDate || null,
    p_plant_no: input.plantNo,
    p_certificate_path: input.certificatePath,
    p_note: input.note,
    p_actor_id: input.actorId,
  }));
}

export async function moveKit(m: {
  itemId: string; status: KitStatus; holderEmployeeId: string | null; vehicleId: string | null;
  serviceCompany: string | null; note: string | null; actorId: string | null;
}) {
  check(await supabase.rpc('kit_move_item', {
    p_item_id: m.itemId, p_status: m.status, p_holder_employee_id: m.holderEmployeeId,
    p_vehicle_id: m.holderEmployeeId ? null : m.vehicleId,
    p_service_company: m.serviceCompany, p_note: m.note, p_action: null, p_actor_id: m.actorId,
  }));
}

export interface SwapInput {
  itemId: string;
  /** holder = another person or spare van */
  destination: 'away_for_service' | 'spare' | 'holder' | 'removed';
  destHolderEmployeeId: string | null;
  destVehicleId: string | null;
  serviceCompany: string | null;
  replacement: 'spare' | 'new' | 'none';
  spareId: string | null;
  newPlantNo: string | null;
  newServiceDate: string | null;
  newExpiryDate: string | null;
  note: string | null;
  actorId: string | null;
}

export async function swapKit(input: SwapInput): Promise<string | null> {
  return check(await supabase.rpc('kit_swap', {
    p_item_id: input.itemId,
    p_destination: input.destination,
    p_dest_holder_employee_id: input.destHolderEmployeeId,
    p_dest_vehicle_id: input.destHolderEmployeeId ? null : input.destVehicleId,
    p_service_company: input.serviceCompany,
    p_replacement: input.replacement,
    p_spare_id: input.spareId,
    p_new_plant_no: input.newPlantNo,
    p_new_service_date: input.newServiceDate || null,
    p_new_expiry_date: input.newExpiryDate || null,
    p_note: input.note,
    p_actor_id: input.actorId,
  })) as string | null;
}

// ---------------------------------------------------------------- photos / certificates (private bucket)

const BUCKET = 'audit-photos';

/**
 * Uploads a photo or document. Photos are shrunk and stamped with the date / time (plus van
 * reg and site) first; the file name carries when it was taken. PDFs go up unchanged.
 */
export async function uploadAuditPhoto(
  file: File,
  folder: 'lines' | 'certificates' | 'photos',
  stamp: StampInfo = {},
  /** told when the photo is ready and the upload starts (for "Preparing… / Uploading…") */
  onUploading?: () => void,
  /** camera: stamped with the time taken; library: the photo's EXIF time, else "Uploaded …" */
  source: 'camera' | 'library' = 'library'
): Promise<{ path: string; takenAt: string; used: TakenAtSource }> {
  const prepared = await preparePhoto(file, stamp, source);
  onUploading?.();
  const rand = Math.random().toString(36).slice(2, 8);
  // the file name records which time was stamped: …-camera-…, …-exif-…, …-uploaded-…
  const path = prepared.ext === 'jpg' ? photoPath(folder, prepared.takenAt, `${prepared.used}-${rand}`) : `${folder}/${Date.now()}_${rand}.${prepared.ext}`;
  check(await supabase.storage.from(BUCKET).upload(path, prepared.blob, { contentType: prepared.contentType }));
  return { path, takenAt: prepared.takenAt.toISOString(), used: prepared.used };
}

export async function uploadAuditFile(file: File, folder: 'lines' | 'certificates', stamp: StampInfo = {}): Promise<string> {
  return (await uploadAuditPhoto(file, folder, stamp)).path;
}

export async function getAuditFileUrl(path: string): Promise<string> {
  const data = check(await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60)) as { signedUrl: string };
  return data.signedUrl;
}

// ---------------------------------------------------------------- gang / van view

/** Kit history for a person (anything they held) or a spare van. */
export async function listHolderHistory(t: Pick<AuditTarget, 'kind' | 'personId' | 'vehicleId'>, limit = 15): Promise<KitRecentUpdate[]> {
  const { holderEmployeeId, vehicleId } = holderParams(t);
  if (!holderEmployeeId && !vehicleId) return [];
  const q = supabase.from('kit_recent_updates').select('*');
  return check(
    await (holderEmployeeId ? q.contains('related_holder_ids', [holderEmployeeId]) : q.contains('related_vehicle_ids', [vehicleId as string]))
      .order('created_at', { ascending: false })
      .limit(limit)
  ) ?? [];
}

/** Latest submitted audit for a person or a spare van. */
export async function lastAudit(t: Pick<AuditTarget, 'kind' | 'personId' | 'vehicleId'>): Promise<SiteAuditSummary | null> {
  const { holderEmployeeId, vehicleId } = holderParams(t);
  let q = supabase.from('audit_site_audit_summary').select('*').eq('status', 'submitted');
  if (holderEmployeeId) q = q.eq('holder_employee_id', holderEmployeeId);
  else if (vehicleId) q = q.is('holder_employee_id', null).eq('vehicle_id', vehicleId);
  else return null;
  const rows = check(await q.order('audit_date', { ascending: false }).order('submitted_at', { ascending: false }).limit(1)) as SiteAuditSummary[];
  return rows?.[0] ?? null;
}

// ---------------------------------------------------------------- deleting photos / certificates

export async function listFileDeletions(): Promise<FileDeletion[]> {
  return check(await supabase.from('audit_file_deletions').select('path, deleted_by_name, deleted_at, actor_name')) ?? [];
}

/**
 * Deletes the file from storage, then records "deleted by X on date". The audit
 * line / history entry that pointed at it is never changed.
 */
/** A photo removed from a draft before it was ever submitted: just the file, no deletion record. */
export async function removeDraftFile(path: string): Promise<void> {
  check(await supabase.storage.from(BUCKET).remove([path]));
}

export async function deleteAuditFile(path: string, isTest: boolean, actor: { id: string; name: string } | null): Promise<void> {
  check(await supabase.storage.from(BUCKET).remove([path]));
  check(await supabase.from('audit_file_deletions').insert({ path, is_test: isTest, actor_id: actor?.id ?? null, actor_name: actor?.name ?? null }));
}

// ---------------------------------------------------------------- who is auditing

export async function getCurrentAuditor(): Promise<{ id: string; name: string } | null> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  return { id: data.user.id, name: data.user.email ?? 'Admin' };
}

// ---------------------------------------------------------------- what has happened since (round 12)

/** Per line of one audit: the item now, and whether a problem found that day is resolved. */
export async function listLineFollowups(auditId: string): Promise<LineFollowup[]> {
  const r = await supabase.from('audit_line_followup').select('*').eq('audit_id', auditId);
  return r.error ? [] : ((r.data as LineFollowup[]) ?? []);
}

/** Per audit: how many fails / expired / due-soon items found on the day are now resolved. */
export async function listResolutions(): Promise<Map<string, AuditResolution>> {
  const r = await supabase.from('audit_resolution').select('*');
  const rows = r.error ? [] : ((r.data as (AuditResolution & { audit_id: string })[]) ?? []);
  return new Map(rows.map((x) => [x.audit_id, x]));
}
