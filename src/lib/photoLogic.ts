/**
 * Photos (round 9): the date / time stamp, shrinking before upload, file names and the
 * required-slot check. Pure, unit-tested in photoLogic.test.ts; canvas work is in photoUpload.ts.
 */

const pad = (n: number) => String(n).padStart(2, '0');

export type TakenAtSource = 'camera' | 'exif' | 'uploaded';

/** "05/11/2026 14:32" (or "Uploaded 05/11/2026 14:32"), then "WV72 OZL · feerg" underneath (left out when unknown). */
export function stampLines(takenAt: Date, reg: string | null | undefined, site: string | null | undefined, used?: TakenAtSource): string[] {
  const time = `${pad(takenAt.getDate())}/${pad(takenAt.getMonth() + 1)}/${takenAt.getFullYear()} ${pad(takenAt.getHours())}:${pad(takenAt.getMinutes())}`;
  const when = used === 'uploaded' ? `Uploaded ${time}` : time;
  const sub = [reg?.trim(), site?.trim()].filter(Boolean).join(' · ');
  return sub ? [when, sub] : [when];
}

/** Long side down to `max` (about 1600px), shape kept, never enlarged. */
export function fitWithin(width: number, height: number, max = 1600): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/** e.g. photos/20261105-143209-ab12.jpg: the name carries when it was taken. */
export function photoPath(folder: string, takenAt: Date, rand: string): string {
  const d = takenAt;
  return `${folder}/${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}-${rand}.jpg`;
}

/** The phone's clock when the photo was taken: the photo file's time, else now. */
export function takenAtFor(file: { lastModified?: number }, now: Date = new Date()): Date {
  return file.lastModified && file.lastModified > 0 ? new Date(file.lastModified) : now;
}

/** Photos are stamped and shrunk; documents (PDFs) are uploaded as they are. */
export const isStampable = (file: { type: string }): boolean => file.type.startsWith('image/');

export interface PhotoSlotLike { id: string; name: string; required: boolean; sort_order: number }
export interface PhotoLike { slot_id: string | null; path: string | null; skip_reason: string | null }

/** Suggested slots (round 11: photos are optional): done when it has a photo. */
export function photoProgress<S extends PhotoSlotLike>(slots: S[], photos: PhotoLike[]) {
  const required = [...slots].filter((s) => s.required).sort((a, b) => a.sort_order - b.sort_order);
  const ok = (s: S) => photos.some((p) => p.slot_id === s.id && !!p.path);
  const missing = required.filter((s) => !ok(s));
  return { done: required.length - missing.length, total: required.length, missing, complete: missing.length === 0 };
}

/** "3 suggested photos not taken" (gentle amber note); null when all are taken. */
export function suggestedNote(p: { missing: unknown[] }): string | null {
  const n = p.missing.length;
  return n ? `${n} suggested photo${n === 1 ? '' : 's'} not taken` : null;
}

// ---------------------------------------------------------------- round 13: stamp bottom-left, EXIF time

/**
 * Where the stamp goes: bottom-LEFT, text about 3.5% of the photo height (date / time line),
 * the van / site line 75% of that, a small margin from the edges. textWidths are the measured
 * widths of each line at those sizes.
 */
export function stampLayout(width: number, height: number, textWidths: number[]) {
  const big = Math.max(14, Math.round(height * 0.035));
  const small = Math.round(big * 0.75);
  const pad = Math.round(big * 0.4);
  const gap = Math.round(big * 0.25);
  const margin = Math.max(8, Math.round(height * 0.02));
  const sizes = textWidths.map((_, i) => (i === 0 ? big : small));
  // never wider than the photo (very long site names are clipped by the strip, not the photo edge)
  const w = Math.min(Math.ceil(Math.max(...textWidths, 0) + pad * 2), width - margin * 2);
  const h = Math.ceil(sizes.reduce((a, b) => a + b, 0) + gap * Math.max(0, textWidths.length - 1) + pad * 2);
  return { x: margin, y: height - h - margin, w, h, big, small, pad, gap, margin, sizes };
}

/** The photo's own taken-time from its EXIF data (DateTimeOriginal, else DateTime); null if none. */
export function exifTakenAt(buf: ArrayBuffer): Date | null {
  try {
    const v = new DataView(buf);
    if (v.byteLength < 4 || v.getUint16(0) !== 0xffd8) return null;
    let p = 2;
    while (p + 4 <= v.byteLength) {
      const marker = v.getUint16(p);
      if ((marker & 0xff00) !== 0xff00 || marker === 0xffd9 || marker === 0xffda) return null;
      const len = v.getUint16(p + 2);
      if (marker === 0xffe1 && v.getUint32(p + 4) === 0x45786966) return readExif(v, p + 10);
      p += 2 + len;
    }
    return null;
  } catch {
    return null;
  }
}

function readExif(v: DataView, tiff: number): Date | null {
  const little = v.getUint16(tiff) === 0x4949;
  const u16 = (o: number) => v.getUint16(tiff + o, little);
  const u32 = (o: number) => v.getUint32(tiff + o, little);
  const ascii = (o: number, n: number) => {
    let s = '';
    for (let i = 0; i < n; i++) {
      const c = v.getUint8(tiff + o + i);
      if (!c) break;
      s += String.fromCharCode(c);
    }
    return s;
  };
  const find = (ifd: number, tag: number) => {
    const n = u16(ifd);
    for (let i = 0; i < n; i++) {
      const e = ifd + 2 + i * 12;
      if (u16(e) === tag) return { type: u16(e + 2), count: u32(e + 4), value: u32(e + 8) };
    }
    return null;
  };
  const toDate = (e: { count: number; value: number } | null) => {
    if (!e) return null;
    const m = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(ascii(e.value, e.count));
    if (!m) return null;
    const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
    return Number.isNaN(d.getTime()) || +m[1] < 1990 ? null : d;
  };
  const ifd0 = u32(4);
  const exifPtr = find(ifd0, 0x8769);
  return (exifPtr ? toDate(find(exifPtr.value, 0x9003)) : null) ?? toDate(find(ifd0, 0x0132));
}

/** Camera: when it is taken. Library: the photo's own EXIF time, else the upload time ("Uploaded …"). */
export function chooseTakenAt(input: { source: 'camera' | 'library'; exif: Date | null; now: Date }): { at: Date; used: TakenAtSource } {
  if (input.source === 'camera') return { at: input.now, used: 'camera' };
  return input.exif ? { at: input.exif, used: 'exif' } : { at: input.now, used: 'uploaded' };
}
