import { describe, it, expect } from 'vitest';
import { draftsInProgress, draftsBadgeText, lastSavedText } from './draftLogic';

const row = (id: string, status: 'draft' | 'submitted', updated_at: string) =>
  ({ id, status, updated_at, created_at: updated_at, audit_date: '2026-11-05' }) as never;

describe('draftsInProgress — the "Drafts in progress" list', () => {
  it('only drafts, most recently saved first', () => {
    const rows = [row('a', 'draft', '2026-11-05T08:00:00Z'), row('b', 'submitted', '2026-11-05T09:00:00Z'), row('c', 'draft', '2026-11-05T10:00:00Z')];
    expect(draftsInProgress(rows).map((r: { id: string }) => r.id)).toEqual(['c', 'a']);
  });
  it('no drafts = empty list (the section is hidden)', () => {
    expect(draftsInProgress([row('b', 'submitted', '2026-11-05T09:00:00Z')])).toEqual([]);
  });
});

describe('draftsBadgeText — dashboard Site Audits card', () => {
  it('"1 draft" / "3 drafts", nothing at 0', () => {
    expect(draftsBadgeText(0)).toBeNull();
    expect(draftsBadgeText(1)).toBe('1 draft');
    expect(draftsBadgeText(3)).toBe('3 drafts');
  });
});

describe('lastSavedText — when the draft was last saved', () => {
  const now = new Date('2026-11-05T12:00:00Z');
  it('minutes ago, today at a time, or a date', () => {
    expect(lastSavedText('2026-11-05T11:59:40Z', now)).toBe('Just now');
    expect(lastSavedText('2026-11-05T11:35:00Z', now)).toBe('25 min ago');
    expect(lastSavedText('2026-11-05T08:05:00Z', now)).toMatch(/^Today \d\d:\d\d$/);
    expect(lastSavedText('2026-11-03T08:05:00Z', now)).toBe('3 Nov');
    expect(lastSavedText(null, now)).toBe('—');
  });
});
