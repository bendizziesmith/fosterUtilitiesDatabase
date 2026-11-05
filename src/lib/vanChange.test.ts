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

// Kit belongs to the person. oldKit = what the person holds; newKit = spare-van kit in the new van.
describe('planVanChange — "Take my kit with me"', () => {
  const p = planVanChange({ oldKit, newKit, mode: 'take_all' });
  it('their own kit needs no move (it goes with them); the new van’s kit becomes theirs too', () => {
    expect(p.moves).toEqual([
      { itemId: 'n1', to: 'person' },
      { itemId: 'n2', to: 'person' },
    ]);
  });
  it('so they hold everything', () => {
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
  it('their old kit stays with the old van, the new van’s kit becomes theirs', () => {
    expect(p.moves).toEqual([
      { itemId: 'o1', to: 'old_van' },
      { itemId: 'o2', to: 'old_van' },
      { itemId: 'n1', to: 'person' },
      { itemId: 'n2', to: 'person' },
    ]);
    expect(ids(p.leftInOld)).toEqual(['o1', 'o2']);
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
      { itemId: 'o2', to: 'spare' },
      { itemId: 'n1', to: 'old_van' },
      { itemId: 'n2', to: 'person' },
    ]);
  });
  it('summarises what the person holds, what is left in the old van and what goes to the yard', () => {
    expect(ids(p.willHold)).toEqual(['o1', 'n2']);
    expect(ids(p.leftInOld)).toEqual(['n1']);
    expect(ids(p.toYard)).toEqual(['o2']);
    expect(p.duplicates).toEqual([]);
  });
  it('defaults unchosen items: their kit stays with them, the new van’s kit is kept', () => {
    const d = planVanChange({ oldKit, newKit, mode: 'mix', mix: {} });
    expect(d.moves).toEqual([{ itemId: 'n1', to: 'person' }, { itemId: 'n2', to: 'person' }]);
    expect(ids(d.willHold)).toEqual(['o1', 'o2', 'n1', 'n2']);
  });
  it('warns when the mix leaves two of a type with the person', () => {
    expect(planVanChange({ oldKit, newKit, mode: 'mix', mix: { o1: 'old_van' } }).duplicates).toEqual([]);
    expect(planVanChange({ oldKit, newKit, mode: 'mix', mix: {} }).duplicates).toEqual(['Digger']);
  });
});

describe('planVanChange — person had no van before', () => {
  it('takes over the kit in the new van', () => {
    const p = planVanChange({ oldKit: [], newKit, mode: 'take_all', hasOldVan: false });
    expect(p.moves).toEqual([{ itemId: 'n1', to: 'person' }, { itemId: 'n2', to: 'person' }]);
    expect(ids(p.willHold)).toEqual(['n1', 'n2']);
  });
  it('turns "Move to old van" into "Back to yard" when there is no old van', () => {
    const p = planVanChange({ oldKit: [], newKit, mode: 'mix', mix: { n1: 'old_van' }, hasOldVan: false });
    expect(p.moves).toEqual([{ itemId: 'n1', to: 'spare' }, { itemId: 'n2', to: 'person' }]);
    expect(ids(p.toYard)).toEqual(['n1']);
  });
});

import { vanChangesToCheck } from './vanChange';

describe('vanChangesToCheck — vans changed in Employee / Vehicle Management', () => {
  const staff = [
    { id: 'e1', full_name: 'Dom Oliver', assigned_vehicle_id: 'v-new' },
    { id: 'e2', full_name: 'John Hume', assigned_vehicle_id: 'v2' },
    { id: 'e3', full_name: 'Phil Hall', assigned_vehicle_id: null },
    { id: 'e4', full_name: 'New Starter', assigned_vehicle_id: 'v4' },
  ];
  const known = [
    { employee_id: 'e1', vehicle_id: 'v-old' },
    { employee_id: 'e2', vehicle_id: 'v2' },
    { employee_id: 'e3', vehicle_id: 'v3' },
  ];

  it('lists people now on a different van from the one recorded', () => {
    expect(vanChangesToCheck(staff, known)).toEqual([
      { employeeId: 'e1', name: 'Dom Oliver', fromVehicleId: 'v-old', toVehicleId: 'v-new' },
    ]);
  });
  it('ignores people who were taken off a van (nothing to move kit onto)', () => {
    expect(vanChangesToCheck(staff, known).some((c) => c.employeeId === 'e3')).toBe(false);
  });
  it('ignores people not recorded yet (they are recorded in one go first)', () => {
    expect(vanChangesToCheck(staff, known).some((c) => c.employeeId === 'e4')).toBe(false);
  });
  it('spots someone who had no van and now has one', () => {
    expect(vanChangesToCheck([{ id: 'e3', full_name: 'Phil Hall', assigned_vehicle_id: 'v9' }], [{ employee_id: 'e3', vehicle_id: null }]))
      .toEqual([{ employeeId: 'e3', name: 'Phil Hall', fromVehicleId: null, toVehicleId: 'v9' }]);
  });
});

import { vanModeOptions, kitOnHandText, occupiedWarning } from './vanChange';

describe('Change van step 2 always shows all three options (round 7)', () => {
  it('three options even when the person had no van before', () => {
    expect(vanModeOptions(false).map((o) => o.mode)).toEqual(['take_all', 'use_new', 'mix']);
    expect(vanModeOptions(true).map((o) => o.mode)).toEqual(['take_all', 'use_new', 'mix']);
  });
  it('keeps the round 6 wording for the swap option', () => {
    expect(vanModeOptions(true)[0].title).toBe('Swap vans: my kit goes with me into the new van, and the old van becomes a spare van');
  });
});

describe('kitOnHandText — say what kit is there', () => {
  it('nothing held, new van empty', () => {
    expect(kitOnHandText({ oldKit: [], newKit: [], newLabel: 'OW72 SKV' })).toEqual({ held: 'You hold no kit', newVan: 'OW72 SKV has no kit' });
  });
  it('lists the kit', () => {
    expect(kitOnHandText({ oldKit, newKit, newLabel: 'OW72 SKV' })).toEqual({
      held: 'You hold: Digger D-1, Breaker B-1',
      newVan: 'OW72 SKV has: Digger D-9, STIHL saw S-1',
    });
  });
});

describe('occupiedWarning — who is on the new van now', () => {
  it('none when nobody is on it', () => {
    expect(occupiedWarning('OW72 SKV', [])).toBeNull();
  });
  it('names who is on it and that they stay on it', () => {
    expect(occupiedWarning('OW72 SKV', ['Phil Hall'])).toBe('OW72 SKV is already assigned to Phil Hall. They stay on it too; only their own kit stays theirs.');
    expect(occupiedWarning('OW72 SKV', ['A', 'B'])).toMatch(/assigned to A and B/);
  });
});
