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
} from './supabase';
import { AttentionRow, DraftLine, TeamMember, buildTeam } from './siteAuditLogic';
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
}> {
  const [emp, veh, chk, kt] = await Promise.all([
    supabase.from('employees').select('id, full_name, role, assigned_vehicle_id').order('full_name'),
    supabase.from('vehicles').select('id, registration_number').order('registration_number'),
    supabase.from('audit_checklist_items').select('*').eq('is_active', true).order('sort_order'),
    supabase.from('kit_types').select('*').eq('is_active', true).order('sort_order'),
  ]);
  return {
    employees: check(emp) ?? [],
    vehicles: check(veh) ?? [],
    checklist: check(chk) ?? [],
    kitTypes: check(kt) ?? [],
  };
}

export async function createKitType(name: string): Promise<KitType> {
  const { data: existing } = await supabase.from('kit_types').select('sort_order').order('sort_order', { ascending: false }).limit(1);
  const next = ((existing?.[0]?.sort_order as number | undefined) ?? 0) + 10;
  return check(await supabase.from("kit_types").insert({ name: name.trim(), sort_order: next }).select("*").single()) as KitType;
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

export async function loadVanKit(vehicleId: string | null): Promise<{
  list: KitVanKitListRow[];
  items: KitItemOverview[];
}> {
  if (!vehicleId) return { list: [], items: [] };
  const [list, items] = await Promise.all([
    supabase.from('kit_van_kit_list').select('*').eq('vehicle_id', vehicleId),
    supabase.from('kit_items_overview').select('*').eq('vehicle_id', vehicleId).eq('status', 'on_van').order('type_sort'),
  ]);
  return { list: check(list) ?? [], items: check(items) ?? [] };
}

// ---------------------------------------------------------------- audits

export type AuditHeader = Omit<SiteAudit, 'id' | 'status' | 'submitted_at'>;

const LINE_COLUMNS = [
  'section', 'checklist_item_id', 'kit_type_id', 'item_name', 'expected_qty', 'result', 'qty',
  'expiry_date', 'service_date', 'plant_no_snapshot', 'date_tag', 'comment', 'photo_path', 'kit_item_id',
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
  lines: DraftLine[]
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
  return id;
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
}> {
  const [a, m, l] = await Promise.all([
    supabase.from('audit_site_audits').select('*').eq('id', auditId).single(),
    supabase.from('audit_members').select('*').eq('audit_id', auditId).order('sort_order'),
    supabase.from('audit_lines').select('*').eq('audit_id', auditId).order('sort_order'),
  ]);
  return { audit: check(a), members: check(m) ?? [], lines: check(l) ?? [] };
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
}> {
  const [att, kit] = await Promise.all([
    supabase.from('audit_needs_attention').select('expiry_status'),
    supabase.from('kit_items').select('status').in('status', ['on_van', 'spare']),
  ]);
  const a = (check(att) ?? []) as { expiry_status: string }[];
  const k = (check(kit) ?? []) as { status: string }[];
  return {
    expired: a.filter((r) => r.expiry_status === 'expired').length,
    dueSoon: a.filter((r) => r.expiry_status === 'due_soon').length,
    onVans: k.filter((r) => r.status === 'on_van').length,
    spares: k.filter((r) => r.status === 'spare').length,
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

export async function setVanCarried(vehicleId: string, kitTypeId: string, carried: boolean, isTest: boolean) {
  check(await supabase.rpc('kit_set_van_carried', {
    p_vehicle_id: vehicleId, p_kit_type_id: kitTypeId, p_carried: carried, p_is_test: isTest,
  }));
}

export interface AddKitInput {
  kitTypeId: string;
  plantNo: string | null;
  serviceDate: string | null;
  expiryDate: string | null;
  status: Exclude<KitStatus, 'removed'>;
  vehicleId: string | null;
  serviceCompany: string | null;
  notes: string | null;
  isTest: boolean;
}

export async function addKit(input: AddKitInput): Promise<string> {
  return check(await supabase.rpc('kit_add_item', {
    p_kit_type_id: input.kitTypeId,
    p_plant_no: input.plantNo,
    p_service_date: input.serviceDate || null,
    p_expiry_date: input.expiryDate || null,
    p_status: input.status,
    p_vehicle_id: input.vehicleId,
    p_service_company: input.serviceCompany,
    p_notes: input.notes,
    p_is_test: input.isTest,
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
}

/** "Update" from Needs attention / Kit page: clears the warning and logs old → new. */
export async function updateAttentionItem(input: UpdateItemInput): Promise<void> {
  if (input.source === 'ppe') {
    check(await supabase.rpc('audit_update_ppe', {
      p_ppe_id: input.itemId,
      p_expiry_date: input.expiryDate || null,
      p_certificate_path: input.certificatePath,
      p_note: input.note,
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
  }));
}

export async function moveKit(itemId: string, status: KitStatus, vehicleId: string | null, serviceCompany: string | null, note: string | null) {
  check(await supabase.rpc('kit_move_item', {
    p_item_id: itemId, p_status: status, p_vehicle_id: vehicleId,
    p_service_company: serviceCompany, p_note: note, p_action: null,
  }));
}

export interface SwapInput {
  itemId: string;
  destination: 'away_for_service' | 'spare' | 'on_van' | 'removed';
  destVehicleId: string | null;
  serviceCompany: string | null;
  replacement: 'spare' | 'new' | 'none';
  spareId: string | null;
  newPlantNo: string | null;
  newServiceDate: string | null;
  newExpiryDate: string | null;
  note: string | null;
}

export async function swapKit(input: SwapInput): Promise<string | null> {
  return check(await supabase.rpc('kit_swap', {
    p_item_id: input.itemId,
    p_destination: input.destination,
    p_dest_vehicle_id: input.destVehicleId,
    p_service_company: input.serviceCompany,
    p_replacement: input.replacement,
    p_spare_id: input.spareId,
    p_new_plant_no: input.newPlantNo,
    p_new_service_date: input.newServiceDate || null,
    p_new_expiry_date: input.newExpiryDate || null,
    p_note: input.note,
  })) as string | null;
}

// ---------------------------------------------------------------- photos / certificates (private bucket)

const BUCKET = 'audit-photos';

export async function uploadAuditFile(file: File, folder: 'lines' | 'certificates'): Promise<string> {
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const path = `${folder}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
  check(await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || undefined }));
  return path;
}

export async function getAuditFileUrl(path: string): Promise<string> {
  const data = check(await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60)) as { signedUrl: string };
  return data.signedUrl;
}

// ---------------------------------------------------------------- who is auditing

export async function getCurrentAuditor(): Promise<{ id: string; name: string } | null> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  return { id: data.user.id, name: data.user.email ?? 'Admin' };
}
