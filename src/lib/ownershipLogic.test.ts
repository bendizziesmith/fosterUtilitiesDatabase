import { describe, it, expect } from 'vitest';
import { ownershipOf, ownershipLabel, filterByOwnership, withOwnership, OWNERSHIP_FILTERS } from './ownershipLogic';

describe('Fosters | Hire on a kit item', () => {
  it('no choice yet (older records) counts as Fosters', () => {
    expect(ownershipOf({ ownership: null })).toBe('fosters');
    expect(ownershipOf({})).toBe('fosters');
    expect(ownershipOf({ ownership: 'hire' })).toBe('hire');
  });
  it('the tag reads "Fosters" or "Hire"', () => {
    expect(ownershipLabel('fosters')).toBe('Fosters');
    expect(ownershipLabel('hire')).toBe('Hire');
  });
});

describe('Kit & Plant filter: All | Fosters kit | Hire kit', () => {
  const kit = [
    { id: 'a', ownership: 'fosters' as const },
    { id: 'b', ownership: 'hire' as const },
    { id: 'c', ownership: null },
  ];
  it('offers the three choices in that order', () => {
    expect(OWNERSHIP_FILTERS.map((f) => f.label)).toEqual(['All', 'Fosters kit', 'Hire kit']);
  });
  it('All shows everything', () => {
    expect(filterByOwnership(kit, 'all').map((k) => k.id)).toEqual(['a', 'b', 'c']);
  });
  it('Hire kit shows only hired items', () => {
    expect(filterByOwnership(kit, 'hire').map((k) => k.id)).toEqual(['b']);
  });
  it('Fosters kit shows ours, including items with no choice yet', () => {
    expect(filterByOwnership(kit, 'fosters').map((k) => k.id)).toEqual(['a', 'c']);
  });
});

describe('withOwnership: the register gets each item’s saved setting', () => {
  it('copies Fosters / Hire from kit_items onto the register rows', () => {
    const rows = withOwnership([{ id: 'a', plant_no: '1' }, { id: 'b', plant_no: '2' }], [{ id: 'b', ownership: 'hire' }]);
    expect(rows.map((r) => [r.id, r.ownership])).toEqual([['a', 'fosters'], ['b', 'hire']]);
  });
});
