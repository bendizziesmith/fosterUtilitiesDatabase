/**
 * Planning a "Change van" for a person (pure, unit-tested in vanChange.test.ts).
 * Kit belongs to a van; a person holds whatever is on their van. Changing van
 * decides, item by item, where the kit on the old and new van ends up.
 */

export interface VanKit {
  id: string;
  kit_type_id: string;
  type_name: string;
  plant_no: string | null;
}

export type VanChangeMode = 'take_all' | 'use_new' | 'mix';
/** old-van kit: new_van / old_van (stay) / spare. New-van kit: keep / old_van / spare. */
export type MixChoice = 'new_van' | 'old_van' | 'spare' | 'keep';

export interface KitMove {
  itemId: string;
  to: 'new_van' | 'old_van' | 'spare';
}

export interface VanChangePlan {
  moves: KitMove[];
  /** kit the person will hold (on the new van) */
  willHold: VanKit[];
  /** kit left on the old van (goes to whoever has that van, or stays as spare-van kit) */
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
    const choice: MixChoice = mode === 'take_all' ? 'new_van' : mode === 'use_new' ? 'old_van' : mix[k.id] ?? 'old_van';
    if (choice === 'new_van') {
      moves.push({ itemId: k.id, to: 'new_van' });
      willHold.push(k);
    } else if (choice === 'spare') {
      moves.push({ itemId: k.id, to: 'spare' });
      toYard.push(k);
    } else {
      leftInOld.push(k);
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
