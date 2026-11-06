import { describe, it, expect } from 'vitest';
import { latestDownloads, downloadedLabel, notDownloaded, deleteKitConfirm } from './downloadLogic';

const rows = [
  { audit_id: 'a1', downloaded_at: '2026-11-05T10:00:00Z', actor_name: 'Neil Foster', kind: 'single' },
  { audit_id: 'a1', downloaded_at: '2026-11-06T09:30:00Z', actor_name: 'Christina Pearson', kind: 'zip' },
  { audit_id: 'a2', downloaded_at: '2026-11-04T08:00:00Z', actor_name: null, kind: 'single' },
];

describe('"Downloaded" tick on audits (round 14)', () => {
  it('keeps the latest download per audit', () => {
    const m = latestDownloads(rows);
    expect(m.get('a1')?.actor_name).toBe('Christina Pearson');
    expect(m.get('a2')?.downloaded_at).toBe('2026-11-04T08:00:00Z');
    expect(m.has('a3')).toBe(false);
  });
  it('"Downloaded 06 Nov by Christina Pearson" (no name: Office login)', () => {
    expect(downloadedLabel(rows[1])).toBe('Downloaded 06 Nov by Christina Pearson');
    expect(downloadedLabel(rows[2])).toBe('Downloaded 04 Nov by Office login');
  });
  it('"Not downloaded yet" filter', () => {
    const audits = [{ id: 'a1' }, { id: 'a2' }, { id: 'a3' }];
    expect(notDownloaded(audits, latestDownloads(rows)).map((a) => a.id)).toEqual(['a3']);
  });
});

describe('Delete kit: a plain "are you sure?" (round 14)', () => {
  it('asks in words, and passes the item’s own plant no to the safety check', () => {
    expect(deleteKitConfirm({ type_name: 'CAT', plant_no: '1234' })).toEqual({
      question: 'Delete CAT 1234 completely?',
      detail: 'It’s removed from Kit & Plant and its history. This can’t be undone.',
      token: '1234',
    });
  });
  it('no plant no: the type name is the token', () => {
    expect(deleteKitConfirm({ type_name: 'Digger', plant_no: null })).toMatchObject({ question: 'Delete Digger completely?', token: 'Digger' });
  });
});
