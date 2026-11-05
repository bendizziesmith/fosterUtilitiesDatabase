/**
 * Pure rules for Site Audits and Kit & Plant (no Supabase calls here, so every
 * rule is unit-tested in siteAuditLogic.test.ts). Data access lives in
 * siteAuditService.ts.
 */

export type ExpiryStatus = 'expired' | 'due_soon' | 'ok';
export type AuditSection = 'ppe' | 'hs' | 'kit' | 'other';
export type LineResult = 'Y' | 'N' | 'not_carried' | null;
export type KitStatus = 'on_van' | 'spare' | 'away_for_service' | 'removed';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days between two YYYY-MM-DD dates, ignoring clock changes. */
function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / DAY_MS);
}

/** Today as YYYY-MM-DD in local time (the employer is in the UK). */
export function todayISO(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Same rule as getVehicleServiceStatus(): overdue once the date has passed,
 * due when it is today or within 30 days. Mirrors audit_expiry_status() in Postgres.
 */
export function getExpiryStatus(
  expiry: string | null | undefined,
  today: string
): { status: ExpiryStatus | null; daysLeft: number | null } {
  if (!expiry) return { status: null, daysLeft: null };
  const daysLeft = daysBetween(today, expiry);
  if (daysLeft < 0) return { status: 'expired', daysLeft };
  if (daysLeft <= 30) return { status: 'due_soon', daysLeft };
  return { status: 'ok', daysLeft };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * The one expiry status used everywhere (form, Edit audit, detail, Kit & Plant, person pages):
 * red "Expired 3 weeks ago", amber "Expires in 12 days", green "OK until Mar 2027".
 */
export function expiryWording(expiry: string | null | undefined, today: string): { tone: ExpiryStatus | null; text: string } {
  const { status, daysLeft } = getExpiryStatus(expiry, today);
  if (!status || daysLeft === null) return { tone: null, text: 'No expiry date' };
  if (status === 'expired') {
    const n = -daysLeft;
    if (n === 1) return { tone: status, text: 'Expired yesterday' };
    if (n < 14) return { tone: status, text: `Expired ${n} days ago` };
    if (n < 60) return { tone: status, text: `Expired ${Math.floor(n / 7)} weeks ago` };
    return { tone: status, text: `Expired ${Math.floor(n / 30)} months ago` };
  }
  if (status === 'due_soon') {
    if (daysLeft === 0) return { tone: status, text: 'Expires today' };
    if (daysLeft === 1) return { tone: status, text: 'Expires tomorrow' };
    return { tone: status, text: `Expires in ${daysLeft} days` };
  }
  const [y, m] = (expiry as string).split('-').map(Number);
  return { tone: status, text: `OK until ${MONTHS[m - 1]} ${y}` };
}

export function formatExpiryStatus(daysLeft: number | null | undefined): string {
  if (daysLeft === null || daysLeft === undefined) return 'N/A';
  if (daysLeft === 0) return 'Due today';
  const n = Math.abs(daysLeft);
  const unit = n === 1 ? 'day' : 'days';
  return daysLeft < 0 ? `${n} ${unit} over` : `${n} ${unit} left`;
}

// ---------------------------------------------------------------- audit targets + team

interface StaffLike {
  id: string;
  full_name: string;
  role: string;
  assigned_vehicle_id?: string | null;
}
interface VanLike {
  id: string;
  registration_number: string;
}

/** A kit holder / audit subject: a person (key person:<id>) or a spare van (key van:<id>). */
export interface AuditTarget {
  key: string;
  label: string;
  kind: 'person' | 'spare_van';
  personId: string | null;
  personName: string | null;
  isGanger: boolean;
  /** the person's assigned van, or the spare van */
  vehicleId: string | null;
  reg: string | null;
  teamName: string;
  /** the van is marked "Off the road" (round 6) */
  offRoad?: boolean;
}

/** "Dom Oliver" → "D. Oliver" */
export function shortName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length < 2) return parts[0] ?? '';
  return `${parts[0][0].toUpperCase()}. ${parts.slice(1).join(' ')}`;
}

export interface Targets {
  gangs: AuditTarget[];
  staff: AuditTarget[];
  spareVans: AuditTarget[];
}

/** Gangers, then other staff, then vans nobody is assigned (spare vans). */
export function buildAuditTargets(employees: StaffLike[], vehicles: VanLike[], offRoad: Set<string> = new Set()): Targets {
  const byId = new Map(vehicles.map((v) => [v.id, v]));
  const person = (e: StaffLike): AuditTarget => {
    const van = e.assigned_vehicle_id ? byId.get(e.assigned_vehicle_id) : undefined;
    const isGanger = e.role === 'Ganger';
    const off = !!van && offRoad.has(van.id);
    return {
      key: `person:${e.id}`,
      label: `${e.full_name} · ${van ? van.registration_number : 'no van'}${off ? ' (off the road)' : ''}`,
      offRoad: off,
      kind: 'person',
      personId: e.id,
      personName: e.full_name,
      isGanger,
      vehicleId: van?.id ?? null,
      reg: van?.registration_number ?? null,
      teamName: isGanger ? `${shortName(e.full_name)}'s gang` : e.full_name,
    };
  };
  const byName = (a: StaffLike, b: StaffLike) => a.full_name.localeCompare(b.full_name);
  const gangs = employees.filter((e) => e.role === 'Ganger').sort(byName).map(person);
  const staff = employees.filter((e) => e.role !== 'Ganger').sort(byName).map(person);
  const taken = new Set(employees.map((e) => e.assigned_vehicle_id).filter(Boolean));
  const spareVans = vehicles
    .filter((v) => !taken.has(v.id) && !offRoad.has(v.id))
    .sort((a, b) => a.registration_number.localeCompare(b.registration_number))
    .map((v) => ({
      key: `van:${v.id}`,
      label: `${v.registration_number} · spare van`,
      kind: 'spare_van' as const,
      personId: null,
      personName: null,
      isGanger: false,
      vehicleId: v.id,
      reg: v.registration_number,
      teamName: `${v.registration_number} (spare van)`,
    }));
  return { gangs, staff, spareVans };
}

export const allTargetsOf = (t: Targets): AuditTarget[] => [...t.gangs, ...t.staff, ...t.spareVans];

/** Who can be audited: gangers, staff who have a van, then spare vans. */
export const auditTargetsOf = (t: Targets): AuditTarget[] =>
  [...t.gangs, ...t.staff.filter((s) => s.vehicleId), ...t.spareVans].filter((x) => !x.offRoad);

export interface TeamMember {
  name: string;
  employee_id: string | null;
}

const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

/**
 * Team = ganger + the labourers on the ganger's latest weekly timesheet
 * (the most complete weekly record in the live data); falls back to the latest
 * HAVS week's members. gang_membership is empty in the live database.
 */
export function buildTeam(input: {
  ganger: StaffLike | null;
  timesheet: { labourer_1_name: string | null; labourer_2_name: string | null } | null;
  havsMembers: { employee_id: string | null; manual_name: string | null; person_type: string }[];
  employees: StaffLike[];
}): TeamMember[] {
  const { ganger, timesheet, havsMembers, employees } = input;
  if (!ganger) return [];

  const team: TeamMember[] = [{ name: ganger.full_name, employee_id: ganger.id }];
  const seen = new Set([norm(ganger.full_name)]);
  const add = (m: TeamMember) => {
    const k = norm(m.name);
    if (!k || seen.has(k)) return;
    seen.add(k);
    team.push(m);
  };
  const fromName = (raw: string): TeamMember => {
    const match = employees.find((e) => norm(e.full_name) === norm(raw));
    return match
      ? { name: match.full_name, employee_id: match.id }
      : { name: raw.trim().replace(/\s+/g, ' '), employee_id: null };
  };

  if (timesheet) {
    [timesheet.labourer_1_name, timesheet.labourer_2_name]
      .filter((n): n is string => !!n && !!n.trim())
      .forEach((n) => add(fromName(n)));
    return team;
  }

  havsMembers
    .filter((m) => m.person_type !== 'ganger')
    .forEach((m) => {
      const emp = m.employee_id ? employees.find((e) => e.id === m.employee_id) : undefined;
      if (emp) add({ name: emp.full_name, employee_id: emp.id });
      else if (m.manual_name) add(fromName(m.manual_name));
    });
  return team;
}

// ---------------------------------------------------------------- Needs attention

export interface AttentionRow {
  source: 'kit' | 'ppe';
  item_id: string;
  item_name: string;
  plant_no: string | null;
  kit_status: KitStatus | null;
  vehicle_id: string | null;
  vehicle_reg: string | null;
  ganger_name: string | null;
  expiry_date: string | null;
  days_left: number | null;
  /** no_home: held by someone who was deleted from staff */
  expiry_status: 'expired' | 'due_soon' | 'no_home';
  is_test: boolean;
  holder_employee_id?: string | null;
  holder_name?: string | null;
  holder_kind?: 'person' | 'spare_van' | 'none';
}

export type AttentionTab = 'all' | 'expired' | 'due';

/** Expired first (most overdue first), then the soonest due. */
export function sortAttention<T extends { days_left: number | null }>(rows: T[]): T[] {
  const d = (r: T) => (r.days_left === null ? -Infinity : r.days_left);
  return [...rows].sort((a, b) => d(a) - d(b));
}

export function filterAttention<T extends { expiry_status: string }>(rows: T[], tab: AttentionTab): T[] {
  if (tab === 'expired') return rows.filter((r) => r.expiry_status === 'expired');
  if (tab === 'due') return rows.filter((r) => r.expiry_status === 'due_soon');
  return rows;
}

// ---------------------------------------------------------------- audit lines

export interface DraftLine {
  section: AuditSection;
  item_name: string;
  result: LineResult;
  expiry_date: string | null;
  checklist_item_id?: string | null;
  kit_type_id?: string | null;
  kit_item_id?: string | null;
  expected_qty?: string | null;
  qty?: string | null;
  service_date?: string | null;
  plant_no_snapshot?: string | null;
  date_tag?: string | null;
  /** "Label on?" (Other section): Y / N / blank */
  label_on?: 'Y' | 'N' | null;
  /** fire extinguisher pressure gauge: red = fail, amber = to look at (round 9) */
  gauge?: 'green' | 'amber' | 'red' | null;
  /** when the photo on an N answer was taken (round 9) */
  photo_taken_at?: string | null;
  comment?: string | null;
  photo_path?: string | null;
  /** set when the van's kit list already says this type is not carried */
  notCarriedBefore?: boolean;
  /** local only: the person typed this expiry, so a new service date won't overwrite it */
  expiryManual?: boolean;
  /** local-only key for React lists */
  key?: string;
}

/** "N fails, N expired, N due soon". Not carried is not a fail; H&S has no dates. */
export function summariseAuditLines(
  lines: DraftLine[],
  auditDate: string
): { fails: number; expired: number; dueSoon: number; toLookAt: number } {
  let fails = 0;
  let expired = 0;
  let dueSoon = 0;
  let toLookAt = 0;
  for (const l of lines) {
    // a fail: Fit for purpose N, "Label on? = N", or a red pressure gauge; one item counts once
    if (l.result === 'N' || l.label_on === 'N' || l.gauge === 'red') fails++;
    else if (l.gauge === 'amber') toLookAt++;
    if (l.result === 'not_carried') continue;
    // PPE, kit and the dated H&S items (undated H&S lines have no expiry)
    if (l.section === 'other') continue;
    const { status } = getExpiryStatus(l.expiry_date, auditDate);
    if (status === 'expired') expired++;
    if (status === 'due_soon') dueSoon++;
  }
  return { fails, expired, dueSoon, toLookAt };
}

export function buildKitLines(
  kitTypes: { id: string; name: string; sort_order: number }[],
  vanKitList: { kit_type_id: string; carried: boolean }[],
  vanItems: {
    id: string;
    kit_type_id: string;
    plant_no: string | null;
    service_date: string | null;
    expiry_date: string | null;
  }[]
): DraftLine[] {
  const notCarried = new Set(vanKitList.filter((l) => !l.carried).map((l) => l.kit_type_id));
  const lines: DraftLine[] = [];
  [...kitTypes]
    .sort((a, b) => a.sort_order - b.sort_order)
    .forEach((t) => {
      const items = vanItems.filter((i) => i.kit_type_id === t.id);
      const base = {
        section: 'kit' as const,
        kit_type_id: t.id,
        item_name: t.name,
        comment: null,
      };
      if (items.length === 0) {
        const nc = notCarried.has(t.id);
        lines.push({
          ...base,
          key: `kit:${t.id}:0`,
          result: nc ? 'not_carried' : null,
          notCarriedBefore: nc,
          kit_item_id: null,
          plant_no_snapshot: null,
          service_date: null,
          expiry_date: null,
        });
        return;
      }
      items.forEach((i, idx) =>
        lines.push({
          ...base,
          key: `kit:${t.id}:${idx}`,
          result: null,
          notCarriedBefore: false,
          kit_item_id: i.id,
          plant_no_snapshot: i.plant_no,
          service_date: i.service_date,
          expiry_date: i.expiry_date,
        })
      );
    });
  return lines;
}

// ---------------------------------------------------------------- swap

export type SwapDestination =
  | { destination: 'away_for_service'; serviceCompany?: string }
  | { destination: 'spare' }
  | { destination: 'on_van'; vanReg: string }
  | { destination: 'removed' };

export type SwapReplacement =
  | { mode: 'spare'; plantNo: string | null; from?: string }
  | { mode: 'new'; plantNo: string | null }
  | { mode: 'none' };

export function previewSwap(
  item: { plant_no: string | null; type_name: string; vehicle_reg: string | null },
  dest: SwapDestination,
  repl: SwapReplacement
): { outgoing: string; incoming: string } {
  const label = item.plant_no || `${item.type_name} (no plant no)`;
  const van = item.vehicle_reg ?? 'the van';
  let where: string;
  switch (dest.destination) {
    case 'away_for_service':
      where = dest.serviceCompany?.trim()
        ? `Away for service (${dest.serviceCompany.trim()})`
        : 'Away for service';
      break;
    case 'spare':
      where = 'Yard Lockup';
      break;
    case 'on_van':
      where = dest.vanReg;
      break;
    default:
      where = 'Scrapped / removed';
  }
  let incoming: string;
  if (repl.mode === 'spare') incoming = `${repl.plantNo || 'Item'} (from ${repl.from ?? 'Yard Lockup'}) → on ${van}`;
  else if (repl.mode === 'new') incoming = `New ${item.type_name}${repl.plantNo ? ` ${repl.plantNo}` : ''} → on ${van}`;
  else incoming = `Nothing for now: ${van} will have no ${item.type_name}`;
  return { outgoing: `${label} → ${where}`, incoming };
}

// ---------------------------------------------------------------- Kit page (phone)

export function groupKitForPhone<
  T extends { status: string; vehicle_reg: string | null; ganger_name: string | null }
>(items: T[]): { title: string; items: T[] }[] {
  const vans = new Map<string, { title: string; items: T[] }>();
  const spares: T[] = [];
  const away: T[] = [];
  for (const i of items) {
    if (i.status === 'on_van') {
      const reg = i.vehicle_reg ?? 'Unknown van';
      const title = i.ganger_name ? `${i.ganger_name} · ${reg}` : reg;
      if (!vans.has(reg)) vans.set(reg, { title, items: [] });
      vans.get(reg)!.items.push(i);
    } else if (i.status === 'spare') spares.push(i);
    else if (i.status === 'away_for_service') away.push(i);
  }
  const groups = [...vans.values()].sort((a, b) => a.title.localeCompare(b.title));
  if (spares.length) groups.push({ title: 'Yard Lockup', items: spares });
  if (away.length) groups.push({ title: 'Away for service', items: away });
  return groups;
}

// ---------------------------------------------------------------- labels + search (round 2)

/** Label for a van: the person on it ("Dom Oliver · YE24 TNL", ganger first) or "WV72 OZL · spare van". */
export function vanLabelFor(t: Targets, vehicleId: string | null | undefined, fallbackReg?: string | null): string {
  if (vehicleId) {
    const hit = t.gangs.find((g) => g.vehicleId === vehicleId) ?? t.staff.find((s) => s.vehicleId === vehicleId) ?? t.spareVans.find((v) => v.vehicleId === vehicleId);
    if (hit) return hit.label;
  }
  return fallbackReg || '—';
}

const squash = (s: string) => s.toLowerCase().replace(/\s+/g, '');

/** Match a name or a reg (spaces ignored). Gangers, then other staff, then spare vans. */
export function searchTargets(targets: AuditTarget[], query: string, opts: { vansOnly?: boolean } = {}): AuditTarget[] {
  const q = squash(query);
  const list = targets.filter((t) => (!opts.vansOnly || t.vehicleId) && (!q || squash(t.label).includes(q)));
  return [...list.filter((t) => t.isGanger), ...list.filter((t) => t.kind === 'person' && !t.isGanger), ...list.filter((t) => t.kind === 'spare_van')];
}

// ---------------------------------------------------------------- holders + names (round 3)

export interface HolderLike {
  status: string;
  holder_kind: 'person' | 'spare_van' | 'none';
  holder_employee_id: string | null;
  holder_name: string | null;
  holder_reg: string | null;
  vehicle_id: string | null;
  service_company?: string | null;
}

export function holderLabel(k: HolderLike): string {
  if (k.status === 'spare') return 'Yard Lockup';
  if (k.status === 'away_for_service') return `Away for service${k.service_company ? ` · ${k.service_company}` : ''}`;
  if (k.status === 'removed') return 'Scrapped';
  if (k.holder_kind === 'person') return `${k.holder_name ?? 'Unknown'} · ${k.holder_reg ?? 'no van'}`;
  if (k.holder_kind === 'spare_van') return `${k.holder_reg ?? 'Van'} · spare van`;
  return 'Unassigned, needs a home';
}

/** holder page key: person:<id> or van:<id>; null when not held (yard, service, needs a home) */
export function holderKey(k: HolderLike): string | null {
  if (k.status !== 'on_van') return null;
  if (k.holder_kind === 'person' && k.holder_employee_id) return `person:${k.holder_employee_id}`;
  if (k.holder_kind === 'spare_van' && k.vehicle_id) return `van:${k.vehicle_id}`;
  return null;
}

/** The "Who's doing this?" name. Rows that only recorded a login email show "Office login". */
export const whoName = (name: string | null | undefined): string => (name && name.trim() ? name : 'Office login');

// ---------------------------------------------------------------- "Other" section answers (round 7)

/**
 * What an Other-section line asks besides Fit for purpose / Qty / Comment, from the
 * checklist item's settings: "Label on?" Y/N, the old free-text date / tag box, or nothing.
 */
export function otherAnswerFor(
  item: { section: string; has_date_tag: boolean; has_label_check?: boolean | null } | undefined
): 'label' | 'date_tag' | 'none' {
  if (!item || item.section !== 'other') return 'none';
  if (item.has_label_check) return 'label';
  return item.has_date_tag ? 'date_tag' : 'none';
}

// ---------------------------------------------------------------- audit pre-fill from the holder's record

export function buildAuditPrefill(input: {
  checklist: { id: string; section: string; name: string; expected_qty: string | null; sort_order: number; has_expiry?: boolean }[];
  kitTypes: { id: string; name: string; sort_order: number }[];
  heldKit: { id: string; kit_type_id: string; plant_no: string | null; service_date: string | null; expiry_date: string | null }[];
  ppe: { checklist_item_id: string; expiry_date: string | null }[];
  notCarried: { kit_type_id: string; carried: boolean }[];
  lastLines: { section: string; checklist_item_id: string | null; qty: string | null; service_date: string | null; date_tag: string | null; label_on?: string | null }[];
  /** the holder's record of last answers (survives a deleted audit); wins over lastLines */
  answers?: { checklist_item_id: string; qty: string | null; service_date: string | null; label_on: string | null; date_tag: string | null }[];
}): DraftLine[] {
  const last = new Map<string, { qty: string | null; service_date: string | null; date_tag: string | null; label_on?: string | null }>(
    input.lastLines.filter((l) => l.checklist_item_id).map((l) => [l.checklist_item_id as string, l])
  );
  (input.answers ?? []).forEach((a) => last.set(a.checklist_item_id, a));
  const ppe = new Map(input.ppe.map((p) => [p.checklist_item_id, p.expiry_date]));
  const sectionOrder: Record<string, number> = { ppe: 0, hs: 1, other: 2 };
  const checklistLines: DraftLine[] = [...input.checklist]
    .sort((a, b) => (sectionOrder[a.section] ?? 9) - (sectionOrder[b.section] ?? 9) || a.sort_order - b.sort_order)
    .map((c) => {
      const prev = last.get(c.id);
      // PPE dates, and the dated H&S items (first aid kit, eye wash, burns kit, fire extinguisher)
      const dated = c.section === 'ppe' || (c.section === 'hs' && !!c.has_expiry);
      return {
        key: `c:${c.id}`,
        section: c.section as AuditSection,
        checklist_item_id: c.id,
        item_name: c.name,
        expected_qty: c.expected_qty,
        result: null,
        qty: prev?.qty ?? '',
        expiry_date: dated ? ppe.get(c.id) ?? null : null,
        expiryManual: false,
        service_date: dated ? prev?.service_date ?? null : null,
        gauge: null,
        date_tag: prev?.date_tag ?? '',
        label_on: prev?.label_on === 'Y' || prev?.label_on === 'N' ? prev.label_on : null,
        comment: '',
        photo_path: null,
      };
    });
  const kit = buildKitLines(input.kitTypes, input.notCarried, input.heldKit).map((l) => ({ ...l, expiryManual: false }));
  return [...checklistLines, ...kit];
}

// ---------------------------------------------------------------- auto expiry from service date

/** Adds whole months; a day past the end of the new month lands on its last day (31 Jan + 1 = 28/29 Feb). */
export function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = total % 12;
  const lastDay = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  const nd = Math.min(d, lastDay);
  return `${ny}-${String(nm + 1).padStart(2, '0')}-${String(nd).padStart(2, '0')}`;
}

export function autoExpiry(serviceDate: string | null | undefined, months: number | null | undefined): string | null {
  if (!serviceDate || !months || months <= 0) return null;
  return addMonths(serviceDate, months);
}

export interface ServiceExpiryState {
  serviceDate: string | null;
  expiry: string | null;
  /** true once the person typed their own expiry */
  expiryManual: boolean;
}

/** New service date: refill expiry unless the person typed their own. */
export function applyServiceDate(state: ServiceExpiryState, serviceDate: string | null, months: number | null | undefined): ServiceExpiryState {
  const next = { ...state, serviceDate };
  if (!state.expiryManual && months) {
    const auto = autoExpiry(serviceDate, months);
    if (auto || !serviceDate) next.expiry = auto;
  }
  return next;
}

/** Typed expiry: keep it; clearing it hands control back to the automatic date. */
export function applyExpiry(state: ServiceExpiryState, expiry: string | null): ServiceExpiryState {
  return { ...state, expiry, expiryManual: !!expiry };
}

// ---------------------------------------------------------------- Kit & Plant at scale

interface KitLike {
  kit_type_id: string;
  status: string;
  vehicle_id: string | null;
  expiry_status: string | null;
}

const warns = (k: KitLike) => k.status !== 'away_for_service';

export function summariseKitByType(types: { id: string; name: string; sort_order: number }[], kit: KitLike[]) {
  return [...types]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((t) => {
      const items = kit.filter((k) => k.kit_type_id === t.id);
      return {
        typeId: t.id,
        name: t.name,
        total: items.length,
        onVans: items.filter((k) => k.status === 'on_van').length,
        spares: items.filter((k) => k.status === 'spare').length,
        away: items.filter((k) => k.status === 'away_for_service').length,
        expired: items.filter((k) => warns(k) && k.expiry_status === 'expired').length,
        dueSoon: items.filter((k) => warns(k) && k.expiry_status === 'due_soon').length,
      };
    });
}

export function summariseKitByHolder(targets: AuditTarget[], kit: (KitLike & Partial<HolderLike>)[]) {
  return targets.map((t) => {
    const items = kit.filter((k) => k.status === 'on_van' && holderKey(k as HolderLike) === t.key);
    return {
      key: t.key,
      label: t.label,
      vehicleId: t.vehicleId,
      personId: t.personId,
      items: items.length,
      expired: items.filter((k) => k.expiry_status === 'expired').length,
      dueSoon: items.filter((k) => k.expiry_status === 'due_soon').length,
    };
  });
}

export type KitSort = 'expiry' | 'plant' | 'van';

export function sortKit<T extends { plant_no: string | null; expiry_date: string | null; vehicle_label?: string | null }>(items: T[], by: KitSort): T[] {
  const cmp = (a: string | null | undefined, b: string | null | undefined) => {
    if (a && b) return a.localeCompare(b, undefined, { numeric: true });
    if (a) return -1;
    if (b) return 1;
    return 0;
  };
  return [...items].sort((a, b) =>
    by === 'expiry' ? cmp(a.expiry_date, b.expiry_date) : by === 'plant' ? cmp(a.plant_no, b.plant_no) : cmp(a.vehicle_label, b.vehicle_label)
  );
}

// ---------------------------------------------------------------- deleted photos / certificates

export interface FileDeletion {
  path: string;
  deleted_by_name: string | null;
  deleted_at: string;
  /** "Who's doing this?" name (round 3) */
  actor_name?: string | null;
}

export function isFileDeleted(path: string | null | undefined, deletions: FileDeletion[]): FileDeletion | undefined {
  if (!path) return undefined;
  return deletions.find((d) => d.path === path);
}

// ---------------------------------------------------------------- form progress (round 8)

const PROGRESS_SECTIONS: { key: AuditSection; title: string }[] = [
  { key: 'ppe', title: 'PPE' },
  { key: 'hs', title: 'H&S' },
  { key: 'kit', title: 'Kit' },
  { key: 'other', title: 'Other' },
];

/** answered = Y, N or Not carried */
const isAnswered = (l: Pick<DraftLine, 'result'>) => l.result === 'Y' || l.result === 'N' || l.result === 'not_carried';

/** "PPE 6/9 · H&S 8/8 · Kit 3/7 · Other 5/5"; a section is done when every item is answered. */
export function sectionProgress(lines: Pick<DraftLine, 'section' | 'result'>[]) {
  return PROGRESS_SECTIONS.map((s) => {
    const sl = lines.filter((l) => l.section === s.key);
    const answered = sl.filter(isAnswered).length;
    return { key: s.key, title: s.title, answered, total: sl.length, done: answered === sl.length };
  });
}

/** Items with no answer yet, in form order (Submit lists them and jumps to the first). */
export function unansweredLines<T extends Pick<DraftLine, 'section' | 'result'>>(lines: T[]): T[] {
  const order = PROGRESS_SECTIONS.map((s) => s.key);
  return [...lines].filter((l) => !isAnswered(l)).sort((a, b) => order.indexOf(a.section) - order.indexOf(b.section));
}

// ---------------------------------------------------------------- spares for a swap (round 9)

type SpareLike = {
  id: string; kit_type_id: string; status: string; holder_kind: string; plant_no: string | null;
  vehicle_reg: string | null; spare_vehicle_id?: string | null; vehicle_id: string | null;
};

/** Same-type replacements: in the Yard Lockup, and spare-van kit ("WV72 OZL · spare van"). */
export function spareOptions<T extends SpareLike>(kit: T[], kitTypeId: string, excludeItemId: string) {
  const same = kit.filter((k) => k.kit_type_id === kitTypeId && k.id !== excludeItemId);
  const byPlant = (a: T, b: T) => (a.plant_no ?? '').localeCompare(b.plant_no ?? '');
  const lockup = same.filter((k) => k.status === 'spare').sort(byPlant).map((k) => ({ ...k, where: 'Yard Lockup' }));
  const spareVans = same
    .filter((k) => k.status === 'on_van' && k.holder_kind === 'spare_van')
    .sort((a, b) => (a.vehicle_reg ?? '').localeCompare(b.vehicle_reg ?? '') || byPlant(a, b))
    .map((k) => ({ ...k, where: `${k.vehicle_reg ?? 'Van'} · spare van` }));
  return { lockup, spareVans };
}
