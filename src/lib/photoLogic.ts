/**
 * Photos (round 9): the date / time stamp, shrinking before upload, file names and the
 * required-slot check. Pure, unit-tested in photoLogic.test.ts; canvas work is in photoUpload.ts.
 */

const pad = (n: number) => String(n).padStart(2, '0');

/** "05/11/2026 14:32", then "WV72 OZL · feerg" underneath (left out when unknown). */
export function stampLines(takenAt: Date, reg: string | null | undefined, site: string | null | undefined): string[] {
  const when = `${pad(takenAt.getDate())}/${pad(takenAt.getMonth() + 1)}/${takenAt.getFullYear()} ${pad(takenAt.getHours())}:${pad(takenAt.getMinutes())}`;
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

/** Required slots: done with a photo, or "Can't take photo" with a reason typed. */
export function photoProgress<S extends PhotoSlotLike>(slots: S[], photos: PhotoLike[]) {
  const required = [...slots].filter((s) => s.required).sort((a, b) => a.sort_order - b.sort_order);
  const ok = (s: S) => photos.some((p) => p.slot_id === s.id && (!!p.path || !!p.skip_reason?.trim()));
  const missing = required.filter((s) => !ok(s));
  return { done: required.length - missing.length, total: required.length, missing, complete: missing.length === 0 };
}
