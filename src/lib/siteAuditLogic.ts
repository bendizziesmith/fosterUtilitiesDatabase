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

export interface AuditTarget {
  key: string;
  label: string;
  gangerId: string | null;
  gangerName: string | null;
  vehicleId: string | null;
  reg: string | null;
  teamName: string;
}

/** "Dom Oliver" → "D. Oliver" */
export function shortName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length < 2) return parts[0] ?? '';
  return `${parts[0][0].toUpperCase()}. ${parts.slice(1).join(' ')}`;
}

export function buildAuditTargets(
  employees: StaffLike[],
  vehicles: VanLike[]
): { gangs: AuditTarget[]; otherVans: AuditTarget[] } {
  const byId = new Map(vehicles.map((v) => [v.id, v]));
  const gangers = employees
    .filter((e) => e.role === 'Ganger')
    .sort((a, b) => a.full_name.localeCompare(b.full_name));

  const gangs = gangers.map((g) => {
    const van = g.assigned_vehicle_id ? byId.get(g.assigned_vehicle_id) : undefined;
    const teamName = `${shortName(g.full_name)}'s gang`;
    return {
      key: `gang:${g.id}`,
      label: `${teamName} · ${van ? van.registration_number : 'no van assigned'}`,
      gangerId: g.id,
      gangerName: g.full_name,
      vehicleId: van?.id ?? null,
      reg: van?.registration_number ?? null,
      teamName,
    };
  });

  const gangerVans = new Set(gangers.map((g) => g.assigned_vehicle_id).filter(Boolean));
  const otherVans = vehicles
    .filter((v) => !gangerVans.has(v.id))
    .sort((a, b) => a.registration_number.localeCompare(b.registration_number))
    .map((v) => {
      const holder = employees.find((e) => e.assigned_vehicle_id === v.id);
      return {
        key: `van:${v.id}`,
        label: `${v.registration_number} · ${holder ? holder.full_name : 'no one assigned'}`,
        gangerId: null,
        gangerName: null,
        vehicleId: v.id,
        reg: v.registration_number,
        teamName: holder ? `${v.registration_number} (${holder.full_name})` : v.registration_number,
      };
    });

  return { gangs, otherVans };
}

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
  expiry_date: string;
  days_left: number;
  expiry_status: 'expired' | 'due_soon';
  is_test: boolean;
}

export type AttentionTab = 'all' | 'expired' | 'due';

/** Expired first (most overdue first), then the soonest due. */
export function sortAttention<T extends { days_left: number }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.days_left - b.days_left);
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
  comment?: string | null;
  photo_path?: string | null;
  /** set when the van's kit list already says this type is not carried */
  notCarriedBefore?: boolean;
  /** local-only key for React lists */
  key?: string;
}

/** "N fails, N expired, N due soon". Not carried is not a fail; H&S has no dates. */
export function summariseAuditLines(
  lines: DraftLine[],
  auditDate: string
): { fails: number; expired: number; dueSoon: number } {
  let fails = 0;
  let expired = 0;
  let dueSoon = 0;
  for (const l of lines) {
    if (l.result === 'N') fails++;
    if (l.result === 'not_carried') continue;
    if (l.section !== 'ppe' && l.section !== 'kit') continue;
    const { status } = getExpiryStatus(l.expiry_date, auditDate);
    if (status === 'expired') expired++;
    if (status === 'due_soon') dueSoon++;
  }
  return { fails, expired, dueSoon };
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
  | { mode: 'spare'; plantNo: string | null }
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
      where = 'Spare · Yard';
      break;
    case 'on_van':
      where = dest.vanReg;
      break;
    default:
      where = 'Scrapped / removed';
  }
  let incoming: string;
  if (repl.mode === 'spare') incoming = `${repl.plantNo || 'Spare'} (spare) → on ${van}`;
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
  if (spares.length) groups.push({ title: 'Spares · Yard', items: spares });
  if (away.length) groups.push({ title: 'Away for service', items: away });
  return groups;
}
