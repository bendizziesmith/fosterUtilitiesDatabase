/**
 * Fosters | Hire (7 Nov 2026): is a kit item ours or hired? Applies to individual kit items only
 * (not Yard Lockup count-only stock). Pure rules, tested in ownershipLogic.test.ts.
 */
export type Ownership = 'fosters' | 'hire';
export type OwnershipFilter = 'all' | Ownership;

export const OWNERSHIP_FILTERS: { value: OwnershipFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'fosters', label: 'Fosters kit' },
  { value: 'hire', label: 'Hire kit' },
];

/** No choice yet (records from before Fosters | Hire) counts as Fosters. */
export const ownershipOf = (x: { ownership?: Ownership | null }): Ownership => (x.ownership === 'hire' ? 'hire' : 'fosters');

export const ownershipLabel = (o: Ownership): string => (o === 'hire' ? 'Hire' : 'Fosters');

export function filterByOwnership<T extends { ownership?: Ownership | null }>(items: T[], filter: OwnershipFilter): T[] {
  return filter === 'all' ? items : items.filter((i) => ownershipOf(i) === filter);
}

/** Register rows + each item's saved setting from kit_items (missing = Fosters). */
export function withOwnership<T extends { id: string }>(rows: T[], saved: { id: string; ownership: Ownership | null }[]): (T & { ownership: Ownership })[] {
  const by = new Map(saved.map((s) => [s.id, s.ownership]));
  return rows.map((r) => ({ ...r, ownership: ownershipOf({ ownership: by.get(r.id) ?? null }) }));
}
