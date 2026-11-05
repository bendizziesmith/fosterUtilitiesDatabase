/**
 * Planning a "Change van" for a person (pure, unit-tested in vanChange.test.ts).
 * Kit belongs to a person (or a spare van). oldKit = what the person holds;
 * newKit = spare-van kit in the new van. Changing van decides where each ends up.
 */

export interface VanKit {
  id: string;
  kit_type_id: string;
  type_name: string;
  plant_no: string | null;
}

export type VanChangeMode = 'take_all' | 'use_new' | 'mix';
/** person's kit: new_van (stays with them) / old_van / spare. New-van kit: keep / old_van / spare. */
export type MixChoice = 'new_van' | 'old_van' | 'spare' | 'keep';

export interface KitMove {
  itemId: string;
  /** person: now held by the person · old_van: whoever has the old van, else spare-van kit · spare: yard */
  to: 'person' | 'old_van' | 'spare';
}

export interface VanChangePlan {
  moves: KitMove[];
  /** kit the person will hold */
  willHold: VanKit[];
  /** kit left with the old van (whoever is assigned it, or spare-van kit) */
  leftInOld: VanKit[];
  toYard: VanKit[];
  /** kit types the person would hold more than one of */
  duplicates: string[];
}

export function planVanChange(input: {
  oldKit: VanKit[];
  newKit: VanKit[];
  mode: VanChangeMode;
  mix?: Record<string, MixChoice>;
  hasOldVan?: boolean;
}): VanChangePlan {
  const { oldKit, newKit, mode, mix = {} } = input;
  const hasOldVan = input.hasOldVan ?? oldKit.length > 0;
  const moves: KitMove[] = [];
  const willHold: VanKit[] = [];
  const leftInOld: VanKit[] = [];
  const toYard: VanKit[] = [];

  for (const k of oldKit) {
    let choice: MixChoice = mode === 'take_all' ? 'new_van' : mode === 'use_new' ? 'old_van' : mix[k.id] ?? 'new_van';
    if (choice === 'old_van' && !hasOldVan) choice = 'new_van';
    if (choice === 'old_van') {
      moves.push({ itemId: k.id, to: 'old_van' });
      leftInOld.push(k);
    } else if (choice === 'spare') {
      moves.push({ itemId: k.id, to: 'spare' });
      toYard.push(k);
    } else {
      willHold.push(k); // already theirs: goes with them
    }
  }

  for (const k of newKit) {
    let choice: MixChoice = mode === 'mix' ? mix[k.id] ?? 'keep' : 'keep';
    if (choice === 'old_van' && !hasOldVan) choice = 'spare';
    if (choice === 'old_van') {
      moves.push({ itemId: k.id, to: 'old_van' });
      leftInOld.push(k);
    } else if (choice === 'spare') {
      moves.push({ itemId: k.id, to: 'spare' });
      toYard.push(k);
    } else {
      moves.push({ itemId: k.id, to: 'person' });
      willHold.push(k);
    }
  }

  const counts = new Map<string, { name: string; n: number }>();
  willHold.forEach((k) => {
    const c = counts.get(k.kit_type_id) ?? { name: k.type_name, n: 0 };
    c.n++;
    counts.set(k.kit_type_id, c);
  });
  const duplicates = [...counts.values()].filter((c) => c.n > 1).map((c) => c.name);

  return { moves, willHold, leftInOld, toYard, duplicates };
}

export interface VanChangeToCheck {
  employeeId: string;
  name: string;
  fromVehicleId: string | null;
  toVehicleId: string;
}

/**
 * People whose van in Employee / Vehicle Management differs from the van we
 * recorded: their kit didn't move ("Van changed: check kit"). People not yet
 * recorded, or taken off a van altogether, are not listed.
 */
export function vanChangesToCheck(
  staff: { id: string; full_name: string; assigned_vehicle_id: string | null }[],
  known: { employee_id: string | null; vehicle_id: string | null }[]
): VanChangeToCheck[] {
  const byPerson = new Map(known.filter((k) => k.employee_id).map((k) => [k.employee_id as string, k.vehicle_id]));
  return staff
    .filter((s) => byPerson.has(s.id) && s.assigned_vehicle_id && byPerson.get(s.id) !== s.assigned_vehicle_id)
    .map((s) => ({
      employeeId: s.id,
      name: s.full_name,
      fromVehicleId: byPerson.get(s.id) ?? null,
      toVehicleId: s.assigned_vehicle_id as string,
    }));
}

// ---------------------------------------------------------------- step 2 wording (round 7)

/** Step 2 always offers all three, even with no kit on either side: the choice still decides what the old van keeps. */
export function vanModeOptions(hasOldVan: boolean): { mode: VanChangeMode; title: string; hint: string }[] {
  return [
    {
      mode: 'take_all',
      title: 'Swap vans: my kit goes with me into the new van, and the old van becomes a spare van',
      hint: hasOldVan
        ? 'Everything they hold goes with them (and any spare-van kit in the new van becomes theirs).'
        : 'No old van, so everything they hold, and the new van’s spare-van kit, is theirs.',
    },
    {
      mode: 'use_new',
      title: 'Use the kit already in the new van',
      hint: hasOldVan ? 'The kit they hold stays with the old van.' : 'Takes over the kit in the new van.',
    },
    { mode: 'mix', title: 'Mix', hint: 'Choose item by item.' },
  ];
}

const kitList = (items: VanKit[]) => items.map((k) => `${k.type_name}${k.plant_no ? ` ${k.plant_no}` : ''}`).join(', ');

/** "You hold no kit" / "OW72 SKV has: Digger DG-005, …" / "OW72 SKV has no kit". */
export function kitOnHandText(input: { oldKit: VanKit[]; newKit: VanKit[]; newLabel: string }): { held: string; newVan: string } {
  return {
    held: input.oldKit.length ? `You hold: ${kitList(input.oldKit)}` : 'You hold no kit',
    newVan: input.newKit.length ? `${input.newLabel} has: ${kitList(input.newKit)}` : `${input.newLabel} has no kit`,
  };
}

/** Shown before step 2 when someone is already on the new van. */
export function occupiedWarning(newLabel: string, holders: string[]): string | null {
  if (!holders.length) return null;
  const names = holders.length === 1 ? holders[0] : `${holders.slice(0, -1).join(', ')} and ${holders[holders.length - 1]}`;
  return `${newLabel} is already assigned to ${names}. They stay on it too; only their own kit stays theirs.`;
}
