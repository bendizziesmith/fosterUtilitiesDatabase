import { describe, it, expect } from 'vitest';
import { followupText, resolutionBadges } from './followupLogic';

const base = { is_fail: false, date_problem: null, deleted: false, kit_status: 'on_van', current_expiry: null, expiry_changed: false,
  last_action: null, last_action_at: null, last_action_by: null, swapped_for: null, fail_resolved: false, date_resolved: false };
const today = '2026-11-06';

describe('followupText — what has happened to the item since the audit (round 12)', () => {
  it('re-serviced: who, when, and the new status', () => {
    expect(followupText({ ...base, date_problem: 'expired', last_action: 'reserviced', last_action_at: '2026-11-05T11:02:24Z', last_action_by: 'Christina Pearson', current_expiry: '2027-11-20', expiry_changed: true, date_resolved: true }, today))
      .toEqual({ text: 'Re-serviced 05 Nov by Christina Pearson · now OK until 20 Nov 2027', resolved: true });
  });
  it('still expired: no Resolved', () => {
    expect(followupText({ ...base, date_problem: 'expired', current_expiry: '2026-10-01' }, today)).toBeNull();
    expect(followupText({ ...base, date_problem: 'expired', last_action: 'assigned', last_action_at: '2026-11-05T12:00:00Z', last_action_by: 'Sam Longcroft', current_expiry: '2026-10-01', date_resolved: false }, today))
      .toEqual({ text: 'Moved 05 Nov by Sam Longcroft · now expired 5 weeks ago', resolved: false });
  });
  it('swapped', () => {
    expect(followupText({ ...base, date_problem: 'expired', is_fail: true, last_action: 'swapped_out', last_action_at: '2026-11-05T11:00:00Z', last_action_by: 'Neil Foster', swapped_for: 'SS-311', kit_status: 'away_for_service', date_resolved: true, fail_resolved: true }, today))
      .toEqual({ text: 'Swapped for SS-311 (05 Nov, Neil Foster)', resolved: true });
  });
  it('deleted item', () => {
    expect(followupText({ ...base, date_problem: 'due_soon', deleted: true, date_resolved: true }, today)).toEqual({ text: 'Deleted', resolved: true });
  });
  it('away for service (no problem on the day: no Resolved badge)', () => {
    expect(followupText({ ...base, kit_status: 'away_for_service', last_action: 'sent_for_service', last_action_at: '2026-11-05T09:00:00Z', last_action_by: 'Neil Foster' }, today))
      .toEqual({ text: 'Away for service (05 Nov, Neil Foster)', resolved: null });
  });
  it('date changed with no history line (e.g. a later audit): "Now: …"', () => {
    expect(followupText({ ...base, expiry_changed: true, current_expiry: '2027-03-01' }, today)).toEqual({ text: 'Now: OK until 01 Mar 2027', resolved: null });
  });
  it('nothing happened: nothing shown', () => {
    expect(followupText(base, today)).toBeNull();
  });
});

describe('resolutionBadges — records list and audit header', () => {
  const s = { fail_count: 1, expired_count: 2, due_soon_count: 1, look_count: 0 };
  it('all resolved: "2 expired · resolved", not a plain red warning', () => {
    expect(resolutionBadges(s, { fails_resolved: 1, expired_resolved: 2, due_soon_resolved: 1 })).toEqual([
      { text: '2 expired · resolved', tone: 'green' },
      { text: '1 due soon · resolved', tone: 'green' },
      { text: '1 fail · resolved', tone: 'green' },
    ]);
  });
  it('partly resolved stays red / amber and says how many are resolved', () => {
    expect(resolutionBadges(s, { fails_resolved: 0, expired_resolved: 1, due_soon_resolved: 0 })).toEqual([
      { text: '2 expired (1 resolved)', tone: 'red' },
      { text: '1 due soon', tone: 'amber' },
      { text: '1 fail', tone: 'red' },
    ]);
  });
  it('nothing found on the day: All OK', () => {
    expect(resolutionBadges({ fail_count: 0, expired_count: 0, due_soon_count: 0, look_count: 0 }, null)).toEqual([{ text: 'All OK', tone: 'green' }]);
  });
  it('amber gauge stays "to look at"', () => {
    expect(resolutionBadges({ fail_count: 0, expired_count: 0, due_soon_count: 0, look_count: 1 }, null)).toEqual([{ text: '1 to look at', tone: 'amber' }]);
  });
});

import { resolutionFrom } from './followupLogic';
describe('resolutionFrom — the audit header from its lines', () => {
  it('counts what is resolved per kind', () => {
    expect(resolutionFrom([
      { ...base, date_problem: 'expired', date_resolved: true },
      { ...base, date_problem: 'expired', date_resolved: false },
      { ...base, date_problem: 'due_soon', date_resolved: true },
      { ...base, is_fail: true, fail_resolved: true, date_problem: 'expired', date_resolved: true },
    ])).toEqual({ fails_resolved: 1, expired_resolved: 2, due_soon_resolved: 1 });
  });
});
