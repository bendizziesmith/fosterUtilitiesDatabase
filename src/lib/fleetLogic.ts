/**
 * Round 6 rules (pure, unit-tested in fleetLogic.test.ts): the audit schedule,
 * Kit & Plant tiles, where kit goes when a van is off the road, and what an
 * audit edit changed.
 */
import { addMonths, getExpiryStatus, AuditTarget } from './siteAuditLogic';

const DAY_MS = 24 * 60 * 60 * 1000;
const daysBetween = (from: string, to: string) => {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / DAY_MS);
};

// ---------------------------------------------------------------- audit schedule

export interface ScheduleAudit {
  id: string;
  status: 'draft' | 'submitted';
  audit_date: string;
  holder_employee_id: string | null;
  ganger_id: string | null;
  vehicle_id: string | null;
}

export type ScheduleStatus = 'never' | 'overdue' | 'due_soon' | 'ok';

export interface ScheduleRow {
  key: string;
  label: string;
  target: AuditTarget;
  lastAudit: string | null;
  lastAuditId: string | null;
  due: string | null;
  daysLeft: number | null;
  status: ScheduleStatus;
}

function auditsFor(t: AuditTarget, audits: ScheduleAudit[]) {
  return audits.filter((a) => {
    if (a.status !== 'submitted') return false;
    if (t.kind === 'person') return a.holder_employee_id === t.personId || (!a.holder_employee_id && a.ganger_id === t.personId);
    return !a.holder_employee_id && !a.ganger_id && a.vehicle_id === t.vehicleId;
  });
}

const ORDER: Record<ScheduleStatus, number> = { never: 0, overdue: 1, due_soon: 2, ok: 3 };

/** Next audit due = last submitted audit + interval. Never audited = due now. */
export function auditSchedule(targets: AuditTarget[], audits: ScheduleAudit[], intervalMonths: number, today: string): ScheduleRow[] {
  const rows = targets.map((t): ScheduleRow => {
    const last = auditsFor(t, audits).sort((a, b) => b.audit_date.localeCompare(a.audit_date))[0];
    if (!last) return { key: t.key, label: t.label, target: t, lastAudit: null, lastAuditId: null, due: null, daysLeft: null, status: 'never' };
    const due = addMonths(last.audit_date, intervalMonths);
    const daysLeft = daysBetween(today, due);
    return {
      key: t.key, label: t.label, target: t, lastAudit: last.audit_date, lastAuditId: last.id, due, daysLeft,
      status: daysLeft < 0 ? 'overdue' : daysLeft <= 30 ? 'due_soon' : 'ok',
    };
  });
  return rows.sort((a, b) =>
    ORDER[a.status] - ORDER[b.status] || (a.daysLeft ?? 0) - (b.daysLeft ?? 0) || a.label.localeCompare(b.label));
}

export function formatDue(r: Pick<ScheduleRow, 'status' | 'daysLeft'>): string {
  if (r.status === 'never' || r.daysLeft === null) return 'Due now';
  const n = Math.abs(r.daysLeft);
  const span = n >= 14 ? `${Math.floor(n / 7)} weeks` : `${n} ${n === 1 ? 'day' : 'days'}`;
  if (r.daysLeft < 0) return `${span} overdue`;
  if (r.daysLeft === 0) return 'Due today';
  return `Due in ${span}`;
}

// ---------------------------------------------------------------- Kit & Plant tiles

export function kitTiles(schedule: ScheduleRow[], kit: { status: string; expiry_status: string | null }[]) {
  const live = kit.filter((k) => k.status !== 'removed');
  const warn = live.filter((k) => k.status !== 'away_for_service');
  return {
    /** audited within the interval (next audit not yet overdue) */
    audited: schedule.filter((r) => r.status === 'ok' || r.status === 'due_soon').length,
    auditTargets: schedule.length,
    needsAuditing: schedule.filter((r) => r.status !== 'ok').length,
    away: live.filter((k) => k.status === 'away_for_service').length,
    expired: warn.filter((k) => k.expiry_status === 'expired').length,
    dueSoon: warn.filter((k) => k.expiry_status === 'due_soon').length,
  };
}

// ---------------------------------------------------------------- van off the road

export type OffRoadDest =
  | { kind: 'spare' }
  | { kind: 'away_for_service'; serviceCompany?: string | null }
  | { kind: 'holder'; holderEmployeeId: string | null; vehicleId: string | null };

export type OffRoadMove =
  | { item_id: string; to: 'spare' }
  | { item_id: string; to: 'away_for_service'; service_company: string | null }
  | { item_id: string; to: 'holder'; holder_employee_id: string | null; vehicle_id: string | null };

/** "All to …" for everything, item-by-item choices override it. */
export function planOffRoad(kit: { id: string }[], allTo: OffRoadDest | null, perItem: Record<string, OffRoadDest>) {
  const moves: OffRoadMove[] = [];
  const missing: string[] = [];
  for (const k of kit) {
    const d = perItem[k.id] ?? allTo;
    if (!d) {
      missing.push(k.id);
      continue;
    }
    if (d.kind === 'spare') moves.push({ item_id: k.id, to: 'spare' });
    else if (d.kind === 'away_for_service') moves.push({ item_id: k.id, to: 'away_for_service', service_company: d.serviceCompany?.trim() || null });
    else moves.push({ item_id: k.id, to: 'holder', holder_employee_id: d.holderEmployeeId, vehicle_id: d.holderEmployeeId ? null : d.vehicleId });
  }
  return { moves, missing };
}

// ---------------------------------------------------------------- audit edits

export interface EditableLine {
  id: string;
  item_name: string;
  result: string | null;
  qty: string | null;
  comment: string | null;
  expiry_date: string | null;
  service_date: string | null;
  plant_no_snapshot: string | null;
  date_tag: string | null;
  label_on?: string | null;
  gauge?: string | null;
}

const FIELDS: { key: keyof EditableLine; label: string | null }[] = [
  { key: 'result', label: null },
  { key: 'qty', label: 'qty' },
  { key: 'expiry_date', label: 'expiry' },
  { key: 'service_date', label: 'service date' },
  { key: 'plant_no_snapshot', label: 'plant no' },
  { key: 'date_tag', label: 'date/tag' },
  { key: 'label_on', label: 'label on' },
  { key: 'gauge', label: 'gauge' },
  { key: 'comment', label: 'comment' },
];

const norm = (v: string | null | undefined) => (v === null || v === undefined || v.trim() === '' ? null : v.trim());
const show = (field: keyof EditableLine, v: string | null) =>
  v === null ? '—' : field === 'result' && v === 'not_carried' ? 'Not carried' : v;

/** What an edit changed, line by line, plus readable lines for the log ("Ear defenders N → Y"). */
export function diffAuditLines(before: EditableLine[], after: EditableLine[]) {
  const changes: { line_id: string; field: string; from: string | null; to: string | null }[] = [];
  const summary: string[] = [];
  const old = new Map(before.map((l) => [l.id, l]));
  for (const l of after) {
    const o = old.get(l.id);
    if (!o) continue;
    for (const f of FIELDS) {
      const from = norm(o[f.key] as string | null);
      const to = norm(l[f.key] as string | null);
      if (from === to) continue;
      changes.push({ line_id: l.id, field: f.key, from, to });
      summary.push(f.label ? `${l.item_name} ${f.label}: ${show(f.key, from)} → ${show(f.key, to)}` : `${l.item_name} ${show(f.key, from)} → ${show(f.key, to)}`);
    }
  }
  return { changes, summary };
}

/** Edit audit: lines whose date is expired or due within 30 days, for "2 expired · 1 due soon" (tap to jump). */
export function dateAlerts(lines: { id: string; result: string | null; expiry_date: string | null }[], today: string) {
  const expired: string[] = [];
  const dueSoon: string[] = [];
  for (const l of lines) {
    if (l.result === 'not_carried') continue;
    const { status } = getExpiryStatus(l.expiry_date, today);
    if (status === 'expired') expired.push(l.id);
    if (status === 'due_soon') dueSoon.push(l.id);
  }
  const text = [expired.length ? `${expired.length} expired` : '', dueSoon.length ? `${dueSoon.length} due soon` : ''].filter(Boolean).join(' · ');
  return { expired, dueSoon, text };
}
