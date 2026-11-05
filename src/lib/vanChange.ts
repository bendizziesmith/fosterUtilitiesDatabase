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

// ---------------------------------------------------------------- "Anything missing?" (round 10)

/** Kit types they carried before but won't hold after the change (not counting types marked "not carried"). */
export function vanShortfall(input: { oldKit: VanKit[]; willHold: VanKit[]; notCarried: string[] }): { kit_type_id: string; type_name: string }[] {
  const holds = new Set(input.willHold.map((k) => k.kit_type_id));
  const skip = new Set(input.notCarried);
  const out: { kit_type_id: string; type_name: string }[] = [];
  for (const k of input.oldKit) {
    if (holds.has(k.kit_type_id) || skip.has(k.kit_type_id) || out.some((o) => o.kit_type_id === k.kit_type_id)) continue;
    out.push({ kit_type_id: k.kit_type_id, type_name: k.type_name });
  }
  return out;
}

type SpareOpt = { id: string; plant_no: string | null; expiry_date: string | null; where: string };

/** Pre-selected spare: in date with the longest expiry; Yard Lockup first, then spare vans. No date = in date, after dated. */
export function bestSpare<T extends SpareOpt>(groups: { lockup: T[]; spareVans: T[] }, today: string): T | null {
  const inDate = (list: T[]) =>
    list
      .filter((s) => !s.expiry_date || s.expiry_date >= today)
      .sort((a, b) => (a.expiry_date && b.expiry_date ? b.expiry_date.localeCompare(a.expiry_date) : a.expiry_date ? -1 : b.expiry_date ? 1 : 0));
  return inDate(groups.lockup)[0] ?? inDate(groups.spareVans)[0] ?? null;
}

export type TakeChoice = { kit_type_id: string; type_name: string } & (
  | { kind: 'spare'; itemId: string; plantNo: string | null; from: string }
  | { kind: 'new'; plantNo: string | null; serviceDate: string | null; expiry: string | null }
  | { kind: 'leave' }
);

/** Extra moves for the same Save: take a spare (Yard Lockup or a spare van), or add a new item. */
export type TakeMove =
  | { item_id: string; to: 'take' }
  | { to: 'new'; kit_type_id: string; plant_no: string | null; service_date: string | null; expiry_date: string | null };

export function takeMoves(takes: TakeChoice[]): TakeMove[] {
  return takes.flatMap((t): TakeMove[] =>
    t.kind === 'spare'
      ? [{ item_id: t.itemId, to: 'take' as const }]
      : t.kind === 'new'
        ? [{ to: 'new' as const, kit_type_id: t.kit_type_id, plant_no: t.plantNo?.trim() || null, service_date: t.serviceDate, expiry_date: t.expiry }]
        : []
  );
}

/** Step 3 wording: "Takes SS-311 from the Yard Lockup". */
export function takeSummary(t: TakeChoice): string {
  if (t.kind === 'spare') return `Takes ${t.plantNo || t.type_name} from ${t.from === 'Yard Lockup' ? 'the Yard Lockup' : t.from}`;
  if (t.kind === 'new') return `Adds a new ${t.type_name}${t.plantNo?.trim() ? ` ${t.plantNo.trim()}` : ''}`;
  return `No ${t.type_name} for now`;
}
