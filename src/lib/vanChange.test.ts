import { describe, it, expect } from 'vitest';
import { planVanChange, type VanKit } from './vanChange';

const oldKit: VanKit[] = [
  { id: 'o1', kit_type_id: 'dig', type_name: 'Digger', plant_no: 'D-1' },
  { id: 'o2', kit_type_id: 'brk', type_name: 'Breaker', plant_no: 'B-1' },
];
const newKit: VanKit[] = [
  { id: 'n1', kit_type_id: 'dig', type_name: 'Digger', plant_no: 'D-9' },
  { id: 'n2', kit_type_id: 'saw', type_name: 'STIHL saw', plant_no: 'S-1' },
];
const ids = (xs: VanKit[]) => xs.map((x) => x.id);

describe('planVanChange — "Take my kit with me"', () => {
  const p = planVanChange({ oldKit, newKit, mode: 'take_all' });
  it('moves everything from the old van to the new van', () => {
    expect(p.moves).toEqual([
      { itemId: 'o1', to: 'new_van' },
      { itemId: 'o2', to: 'new_van' },
    ]);
  });
  it('leaves the kit already in the new van there, so the person holds both', () => {
    expect(ids(p.willHold)).toEqual(['o1', 'o2', 'n1', 'n2']);
    expect(p.leftInOld).toEqual([]);
    expect(p.toYard).toEqual([]);
  });
  it('warns about two of the same kit type', () => {
    expect(p.duplicates).toEqual(['Digger']);
  });
});

describe('planVanChange — "Use the kit already in the new van"', () => {
  const p = planVanChange({ oldKit, newKit, mode: 'use_new' });
  it('moves nothing; the old kit stays with the old van', () => {
    expect(p.moves).toEqual([]);
    expect(ids(p.leftInOld)).toEqual(['o1', 'o2']);
  });
  it('the person holds the new van’s kit, with no duplicate warning', () => {
    expect(ids(p.willHold)).toEqual(['n1', 'n2']);
    expect(p.duplicates).toEqual([]);
  });
});

describe('planVanChange — "Mix"', () => {
  const p = planVanChange({
    oldKit,
    newKit,
    mode: 'mix',
    mix: { o1: 'new_van', o2: 'spare', n1: 'old_van', n2: 'keep' },
  });
  it('turns each choice into a move', () => {
    expect(p.moves).toEqual([
      { itemId: 'o1', to: 'new_van' },
      { itemId: 'o2', to: 'spare' },
      { itemId: 'n1', to: 'old_van' },
    ]);
  });
  it('summarises what the person holds, what is left in the old van and what goes to the yard', () => {
    expect(ids(p.willHold)).toEqual(['o1', 'n2']);
    expect(ids(p.leftInOld)).toEqual(['n1']);
    expect(ids(p.toYard)).toEqual(['o2']);
    expect(p.duplicates).toEqual([]);
  });
  it('defaults unchosen items: old-van kit stays in the old van, new-van kit is kept', () => {
    const d = planVanChange({ oldKit, newKit, mode: 'mix', mix: {} });
    expect(d.moves).toEqual([]);
    expect(ids(d.willHold)).toEqual(['n1', 'n2']);
    expect(ids(d.leftInOld)).toEqual(['o1', 'o2']);
  });
  it('warns when the mix leaves two of a type with the person', () => {
    expect(planVanChange({ oldKit, newKit, mode: 'mix', mix: { o1: 'new_van' } }).duplicates).toEqual(['Digger']);
  });
});

describe('planVanChange — person had no van before', () => {
  it('can only use the kit in the new van', () => {
    const p = planVanChange({ oldKit: [], newKit, mode: 'take_all' });
    expect(p.moves).toEqual([]);
    expect(ids(p.willHold)).toEqual(['n1', 'n2']);
  });
  it('turns "Move to old van" into "Back to yard" when there is no old van', () => {
    const p = planVanChange({ oldKit: [], newKit, mode: 'mix', mix: { n1: 'old_van' }, hasOldVan: false });
    expect(p.moves).toEqual([{ itemId: 'n1', to: 'spare' }]);
    expect(ids(p.toYard)).toEqual(['n1']);
  });
});
