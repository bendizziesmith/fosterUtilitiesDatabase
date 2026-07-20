/**
 * Price Work — pure logic for the per-job "price work" quantities captured on the
 * employee weekly timesheet. Two work types (Trench in metres, Joint Hole as a
 * whole count), each split Verge / Footway (F/W) / Carriageway (C/W).
 *
 * Kept free of React so it can be unit-tested in isolation.
 */

/** Stored / DB-facing shape: numbers or null (blank = null). */
export interface PriceWorkFields {
  pw_trench_verge: number | null;
  pw_trench_footway: number | null;
  pw_trench_carriageway: number | null;
  pw_joint_verge: number | null;
  pw_joint_footway: number | null;
  pw_joint_carriageway: number | null;
}

/** Local input shape: raw strings held in component/editor state while typing. */
export interface PriceWorkLocal {
  pw_trench_verge: string;
  pw_trench_footway: string;
  pw_trench_carriageway: string;
  pw_joint_verge: string;
  pw_joint_footway: string;
  pw_joint_carriageway: string;
}

export const EMPTY_PRICE_WORK_LOCAL: PriceWorkLocal = {
  pw_trench_verge: '',
  pw_trench_footway: '',
  pw_trench_carriageway: '',
  pw_joint_verge: '',
  pw_joint_footway: '',
  pw_joint_carriageway: '',
};

/** Trench metres: decimals allowed, non-negative. Empty/invalid/negative → null. */
export function parseTrench(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

/** Joint-hole count: whole non-negative number. Empty/invalid/negative → null. */
export function parseJoint(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
}

/** Sum a section's values, treating null as 0. Rounded to 2dp to avoid float drift. */
export function sumSection(values: (number | null)[]): number {
  const total = values.reduce<number>((sum, v) => sum + (v ?? 0), 0);
  return Math.round(total * 100) / 100;
}

/** Render a stored number as an input string; null/undefined → ''. */
export function numberToInput(v: number | null | undefined): string {
  return v === null || v === undefined ? '' : String(v);
}

/** Map stored fields to local input strings (for seeding editor state on load). */
export function fieldsToLocal(f: Partial<PriceWorkFields>): PriceWorkLocal {
  return {
    pw_trench_verge: numberToInput(f.pw_trench_verge),
    pw_trench_footway: numberToInput(f.pw_trench_footway),
    pw_trench_carriageway: numberToInput(f.pw_trench_carriageway),
    pw_joint_verge: numberToInput(f.pw_joint_verge),
    pw_joint_footway: numberToInput(f.pw_joint_footway),
    pw_joint_carriageway: numberToInput(f.pw_joint_carriageway),
  };
}

/** Map local input strings to the DB save payload (blanks → null). */
export function buildPriceWorkUpdate(local: PriceWorkLocal): PriceWorkFields {
  return {
    pw_trench_verge: parseTrench(local.pw_trench_verge),
    pw_trench_footway: parseTrench(local.pw_trench_footway),
    pw_trench_carriageway: parseTrench(local.pw_trench_carriageway),
    pw_joint_verge: parseJoint(local.pw_joint_verge),
    pw_joint_footway: parseJoint(local.pw_joint_footway),
    pw_joint_carriageway: parseJoint(local.pw_joint_carriageway),
  };
}

export function trenchTotal(f: PriceWorkFields): number {
  return sumSection([f.pw_trench_verge, f.pw_trench_footway, f.pw_trench_carriageway]);
}

export function jointTotal(f: PriceWorkFields): number {
  return sumSection([f.pw_joint_verge, f.pw_joint_footway, f.pw_joint_carriageway]);
}

/** True if any of the six values is present (non-null), including an explicit zero. */
export function hasPriceWork(f: PriceWorkFields): boolean {
  return [
    f.pw_trench_verge,
    f.pw_trench_footway,
    f.pw_trench_carriageway,
    f.pw_joint_verge,
    f.pw_joint_footway,
    f.pw_joint_carriageway,
  ].some((v) => v !== null && v !== undefined);
}

/** Format a metres value: whole numbers plain, decimals trimmed of trailing zeros. */
export function formatMetres(n: number): string {
  return parseFloat(n.toFixed(2)).toString();
}

/** Read-only cell display: an em dash for blank (null/undefined), otherwise the number. */
export function formatPwValue(v: number | null | undefined): string {
  return v === null || v === undefined ? '–' : formatMetres(v);
}

/** Chip text, e.g. "Price work · Trench 57 m · Joint Hole 3". Null when no price work. */
export function formatPriceWorkSummary(f: PriceWorkFields): string | null {
  if (!hasPriceWork(f)) return null;
  const parts: string[] = [];
  const t = trenchTotal(f);
  const j = jointTotal(f);
  if (t > 0) parts.push(`Trench ${formatMetres(t)} m`);
  if (j > 0) parts.push(`Joint Hole ${j}`);
  return parts.length ? `Price work · ${parts.join(' · ')}` : 'Price work';
}

/** Live Trench total from raw input strings (used by the UI while typing). */
export function liveTrenchTotal(local: PriceWorkLocal): number {
  return sumSection([
    parseTrench(local.pw_trench_verge),
    parseTrench(local.pw_trench_footway),
    parseTrench(local.pw_trench_carriageway),
  ]);
}

/** Live Joint Hole total from raw input strings (used by the UI while typing). */
export function liveJointTotal(local: PriceWorkLocal): number {
  return sumSection([
    parseJoint(local.pw_joint_verge),
    parseJoint(local.pw_joint_footway),
    parseJoint(local.pw_joint_carriageway),
  ]);
}

/** True if the local input state holds any price-work value. */
export function localHasPriceWork(local: PriceWorkLocal): boolean {
  return hasPriceWork(buildPriceWorkUpdate(local));
}
