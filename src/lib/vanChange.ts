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
