import { describe, it, expect } from 'vitest';
import { stampLines, fitWithin, photoPath, takenAtFor, photoProgress, isStampable } from './photoLogic';

describe('stampLines — date and time stamp drawn on every photo', () => {
  const at = new Date(2026, 10, 5, 14, 32);
  it('date and time, then van reg and site underneath', () => {
    expect(stampLines(at, 'WV72 OZL', 'feerg')).toEqual(['05/11/2026 14:32', 'WV72 OZL · feerg']);
  });
  it('leaves out what is not known', () => {
    expect(stampLines(at, null, 'feerg')).toEqual(['05/11/2026 14:32', 'feerg']);
    expect(stampLines(at, null, '  ')).toEqual(['05/11/2026 14:32']);
  });
});

describe('fitWithin — shrink before upload (about 1600px)', () => {
  it('scales the long side down to 1600 and keeps the shape', () => {
    expect(fitWithin(4032, 3024)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(3024, 4032)).toEqual({ width: 1200, height: 1600 });
  });
  it('never enlarges a small photo', () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
  });
});

describe('photo file names, taken-at time, what gets stamped', () => {
  it('names the file by when it was taken', () => {
    expect(photoPath('photos', new Date(2026, 10, 5, 14, 32, 9), 'ab12')).toBe('photos/20261105-143209-ab12.jpg');
  });
  it('uses the phone clock: the photo file time, else now', () => {
    const now = new Date(2026, 10, 5, 15, 0);
    expect(takenAtFor({ lastModified: new Date(2026, 10, 5, 14, 32).getTime() }, now).getHours()).toBe(14);
    expect(takenAtFor({ lastModified: 0 }, now)).toEqual(now);
  });
  it('stamps photos, never PDFs', () => {
    expect(isStampable({ type: 'image/jpeg' })).toBe(true);
    expect(isStampable({ type: 'image/heic' })).toBe(true);
    expect(isStampable({ type: 'application/pdf' })).toBe(false);
  });
});

describe('photoProgress — required photos', () => {
  const slots = [
    { id: 's1', name: 'Van & reg', required: true, sort_order: 10 },
    { id: 's2', name: 'Van open', required: true, sort_order: 20 },
    { id: 's3', name: 'CAT', required: true, sort_order: 30 },
  ];
  it('a slot is done with a photo, or "Can\'t take photo" with a reason', () => {
    const p = photoProgress(slots, [
      { slot_id: 's1', path: 'a.jpg', skip_reason: null },
      { slot_id: 's2', path: null, skip_reason: 'Van in for repair' },
      { slot_id: 's3', path: null, skip_reason: '  ' },
    ]);
    expect(p).toMatchObject({ done: 2, total: 3, complete: false });
    expect(p.missing.map((s) => s.name)).toEqual(['CAT']);
  });
  it('additional photos do not count towards required slots', () => {
    expect(photoProgress(slots, [{ slot_id: null, path: 'x.jpg', skip_reason: null }]).done).toBe(0);
  });
});
