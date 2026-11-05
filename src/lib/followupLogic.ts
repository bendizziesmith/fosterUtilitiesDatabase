/**
 * "What has happened since" on audit records (round 12). The audit keeps what was found on the day;
 * this says what the item is like now, and whether a problem found that day is resolved.
 * Rows come from the audit_line_followup / audit_resolution views. Tested in followupLogic.test.ts.
 */
import { expiryWording } from './siteAuditLogic';
import { longDate } from './auditReport';

export interface LineFollowup {
  line_id?: string;
  is_fail: boolean;
  date_problem: 'expired' | 'due_soon' | null;
  deleted: boolean;
  kit_status: string | null;
  current_expiry: string | null;
  expiry_changed: boolean;
  last_action: string | null;
  last_action_at: string | null;
  last_action_by: string | null;
  swapped_for: string | null;
  fail_resolved: boolean;
  date_resolved: boolean;
}

export interface AuditResolution { fails_resolved: number; expired_resolved: number; due_soon_resolved: number }

const ACTION: Record<string, string> = {
  reserviced: 'Re-serviced',
  replaced: 'Replaced',
  expiry_updated: 'Updated',
  assigned: 'Moved',
  sent_for_service: 'Away for service',
  back_from_service: 'Back from service',
  moved_to_spare: 'Back in the Yard Lockup',
  removed: 'Scrapped',
};

const dayMonth = (iso: string) => longDate(iso).slice(0, 6); // "05 Nov"

/** "OK until 20 Nov 2027" / "expires in 12 days" / "expired 5 weeks ago" */
function nowExpiry(expiry: string, today: string): string {
  const w = expiryWording(expiry, today);
  if (w.tone === 'ok') return `OK until ${longDate(expiry)}`;
  return w.text.charAt(0).toLowerCase() + w.text.slice(1);
}

/** Text under the line, and Resolved (true / false) when there was a problem on the day, else null. */
export function followupText(f: LineFollowup, today: string): { text: string; resolved: boolean | null } | null {
  const problem = f.is_fail || !!f.date_problem;
  const resolved = problem ? (f.is_fail && f.fail_resolved) || (!!f.date_problem && f.date_resolved) : null;
  const when = f.last_action_at ? `${dayMonth(f.last_action_at)}${f.last_action_by ? `, ${f.last_action_by}` : ''}` : '';
  if (f.deleted) return { text: 'Deleted', resolved };
  if (f.last_action === 'swapped_out') return { text: `${f.swapped_for ? `Swapped for ${f.swapped_for}` : 'Swapped out'}${when ? ` (${when})` : ''}`, resolved };
  if (f.kit_status === 'away_for_service' || f.kit_status === 'spare' || f.kit_status === 'removed') {
    const label = f.kit_status === 'away_for_service' ? 'Away for service' : f.kit_status === 'spare' ? 'Back in the Yard Lockup' : 'Scrapped';
    return { text: `${label}${when ? ` (${when})` : ''}`, resolved };
  }
  if (f.last_action && f.last_action_at) {
    const label = ACTION[f.last_action] ?? 'Changed';
    const now = f.current_expiry ? ` · now ${nowExpiry(f.current_expiry, today)}` : '';
    return { text: `${label} ${dayMonth(f.last_action_at)}${f.last_action_by ? ` by ${f.last_action_by}` : ''}${now}`, resolved };
  }
  if (f.expiry_changed && f.current_expiry) return { text: `Now: ${nowExpiry(f.current_expiry, today)}`, resolved };
  return problem && resolved ? { text: 'Resolved', resolved } : null;
}

export type BadgeTone = 'red' | 'amber' | 'green';

/** Records list / audit header: "1 expired · resolved" once everything of that kind is resolved. */
export function resolutionBadges(
  s: { fail_count: number; expired_count: number; due_soon_count: number; look_count?: number | null },
  r: AuditResolution | null
): { text: string; tone: BadgeTone }[] {
  const out: { text: string; tone: BadgeTone }[] = [];
  const add = (n: number, done: number, word: string, tone: BadgeTone) => {
    if (n <= 0) return;
    if (done >= n) out.push({ text: `${n} ${word} · resolved`, tone: 'green' });
    else out.push({ text: `${n} ${word}${done > 0 ? ` (${done} resolved)` : ''}`, tone });
  };
  add(s.expired_count, r?.expired_resolved ?? 0, 'expired', 'red');
  add(s.due_soon_count, r?.due_soon_resolved ?? 0, 'due soon', 'amber');
  add(s.fail_count, r?.fails_resolved ?? 0, s.fail_count === 1 ? 'fail' : 'fails', 'red');
  if ((s.look_count ?? 0) > 0) out.push({ text: `${s.look_count} to look at`, tone: 'amber' });
  return out.length ? out : [{ text: 'All OK', tone: 'green' }];
}

/** The same counts as the audit_resolution view, from one audit's lines. */
export function resolutionFrom(rows: LineFollowup[]): AuditResolution {
  return {
    fails_resolved: rows.filter((r) => r.is_fail && r.fail_resolved).length,
    expired_resolved: rows.filter((r) => r.date_problem === 'expired' && r.date_resolved).length,
    due_soon_resolved: rows.filter((r) => r.date_problem === 'due_soon' && r.date_resolved).length,
  };
}
