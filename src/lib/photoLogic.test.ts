import { describe, it, expect } from 'vitest';
import { stampLines, fitWithin, photoPath, takenAtFor, photoProgress, isStampable, suggestedNote } from './photoLogic';

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

describe('photoProgress — suggested photos (round 11: optional)', () => {
  const slots = [
    { id: 's1', name: 'Van & reg', required: true, sort_order: 10 },
    { id: 's2', name: 'Van open', required: true, sort_order: 20 },
    { id: 's3', name: 'CAT', required: true, sort_order: 30 },
  ];
  it('only a photo counts; an old "can\'t take photo" reason does not', () => {
    const p = photoProgress(slots, [
      { slot_id: 's1', path: 'a.jpg', skip_reason: null },
      { slot_id: 's2', path: null, skip_reason: 'Van in for repair' },
    ]);
    expect(p).toMatchObject({ done: 1, total: 3, complete: false });
    expect(p.missing.map((s) => s.name)).toEqual(['Van open', 'CAT']);
  });
  it('additional photos do not count towards the suggested slots', () => {
    expect(photoProgress(slots, [{ slot_id: null, path: 'x.jpg', skip_reason: null }]).done).toBe(0);
  });
  it('the amber note text', () => {
    expect(suggestedNote(photoProgress(slots, []))).toBe('3 suggested photos not taken');
    expect(suggestedNote(photoProgress(slots, [{ slot_id: 's1', path: 'a', skip_reason: null }, { slot_id: 's2', path: 'b', skip_reason: null }]))).toBe('1 suggested photo not taken');
    expect(suggestedNote(photoProgress(slots, slots.map((s) => ({ slot_id: s.id, path: 'p', skip_reason: null }))))).toBeNull();
  });
});

import { stampLayout, exifTakenAt, chooseTakenAt } from './photoLogic';

/** A tiny JPEG with an EXIF DateTimeOriginal ("2026:10:30 14:05:09"), little-endian TIFF. */
function jpegWithExif(when: string, little = true): ArrayBuffer {
  const tiff: number[] = [];
  const u16 = (v: number) => (little ? [v & 255, v >> 8] : [v >> 8, v & 255]);
  const u32 = (v: number) => (little ? [v & 255, (v >> 8) & 255, (v >> 16) & 255, v >>> 24] : [v >>> 24, (v >> 16) & 255, (v >> 8) & 255, v & 255]);
  tiff.push(...(little ? [0x49, 0x49] : [0x4d, 0x4d]), ...u16(42), ...u32(8));
  // IFD0 at 8: one entry, the Exif IFD pointer → 26
  tiff.push(...u16(1), ...u16(0x8769), ...u16(4), ...u32(1), ...u32(26), ...u32(0));
  // Exif IFD at 26: one entry, DateTimeOriginal (ASCII, 20 bytes) → 44
  tiff.push(...u16(1), ...u16(0x9003), ...u16(2), ...u32(20), ...u32(44), ...u32(0));
  tiff.push(...Array.from(when).map((c) => c.charCodeAt(0)), 0);
  const app1 = [...Array.from('Exif').map((c) => c.charCodeAt(0)), 0, 0, ...tiff];
  const len = app1.length + 2;
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe1, len >> 8, len & 255, ...app1, 0xff, 0xd9]).buffer;
}

describe('round 13: photo stamp bottom-left, about 3.5% of the photo height', () => {
  it('sits in the bottom-left corner with a small margin, text sized to the photo', () => {
    const l = stampLayout(1600, 1200, [300, 220]);
    expect(l.big).toBe(42); // 3.5% of 1200
    expect(l.small).toBe(32);
    expect(l.x).toBe(l.margin);
    expect(l.y + l.h).toBe(1200 - l.margin);
    expect(l.margin).toBeGreaterThan(0);
    expect(l.w).toBe(300 + l.pad * 2);
  });
  it('a portrait photo is sized from its height too', () => {
    expect(stampLayout(1200, 1600, [100]).big).toBe(56);
  });
});

describe('round 13: which time is stamped', () => {
  const now = new Date(2026, 10, 6, 9, 42);
  it('camera photo: the time it is taken', () => {
    expect(chooseTakenAt({ source: 'camera', exif: null, now })).toEqual({ at: now, used: 'camera' });
  });
  it('library photo with EXIF: the photo’s own taken-time', () => {
    const exif = exifTakenAt(jpegWithExif('2026:10:30 14:05:09'));
    expect(exif).toEqual(new Date(2026, 9, 30, 14, 5, 9));
    expect(exifTakenAt(jpegWithExif('2026:10:30 14:05:09', false))).toEqual(new Date(2026, 9, 30, 14, 5, 9));
    expect(chooseTakenAt({ source: 'library', exif, now })).toEqual({ at: exif, used: 'exif' });
  });
  it('library photo without EXIF: the upload time, labelled "Uploaded"', () => {
    expect(exifTakenAt(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]).buffer)).toBeNull();
    expect(exifTakenAt(new Uint8Array([1, 2, 3]).buffer)).toBeNull();
    const c = chooseTakenAt({ source: 'library', exif: null, now });
    expect(c).toEqual({ at: now, used: 'uploaded' });
    expect(stampLines(c.at, 'WV72 OZL', 'feerg', c.used)).toEqual(['Uploaded 06/11/2026 09:42', 'WV72 OZL · feerg']);
    expect(stampLines(now, null, null, 'exif')).toEqual(['06/11/2026 09:42']);
  });
});
