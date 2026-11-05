import { supabase } from './supabase';
import { KitMove } from './vanChange';

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

/**
 * Carries out a van change. Kit moves happen in one Postgres function
 * (kit_change_van: all or nothing, each move logged in kit_history).
 *
 * SAFETY: employees is an existing live table. In test mode (local build) it
 * is never written; the person's van stays as it is and vanSaved is false.
 */
export async function changeVan(input: {
  personId: string;
  oldVehicleId: string | null;
  newVehicleId: string;
  moves: KitMove[];
  /** "Anything missing?": spares taken (Yard Lockup / spare van) or new items, saved in the same call */
  takes?: ({ item_id: string; to: 'take' } | { to: 'new'; kit_type_id: string; plant_no: string | null; service_date: string | null; expiry_date: string | null })[];
  note: string | null;
  testMode: boolean;
  /** "Who's doing this?" (audit_auditors.id) */
  actorId: string | null;
  /** the van was already changed in Employee / Vehicle Management */
  assignmentAlreadyDone?: boolean;
}): Promise<{ vanSaved: boolean }> {
  check(
    await supabase.rpc('kit_change_van', {
      p_person_id: input.personId,
      p_old_vehicle_id: input.oldVehicleId,
      p_new_vehicle_id: input.newVehicleId,
      p_moves: [...input.moves.map((m) => ({ item_id: m.itemId, to: m.to })), ...(input.takes ?? [])],
      p_note: input.note,
      p_is_test: input.testMode,
      p_actor_id: input.actorId,
    })
  );

  let vanSaved = false;
  if (!input.testMode && !input.assignmentAlreadyDone) {
    check(await supabase.from('employees').update({ assigned_vehicle_id: input.newVehicleId }).eq('id', input.personId));
    vanSaved = true;
  }
  if (!input.testMode || input.assignmentAlreadyDone) {
    await rememberPersonVan(input.personId, input.newVehicleId, input.testMode);
  }
  return { vanSaved };
}

/**
 * Records every person's current van in one go (only people not recorded yet;
 * existing records are kept so a change made the old way is still spotted).
 * Reads employees, writes only kit_person_vans.
 */
export async function recordAllPersonVans(isTest: boolean): Promise<void> {
  check(await supabase.rpc('kit_record_person_vans', { p_is_test: isTest }));
}

/** The van we last recorded for each person. */
export async function listPersonVans(): Promise<{ employee_id: string | null; vehicle_id: string | null }[]> {
  return (check(await supabase.from('kit_person_vans').select('employee_id, vehicle_id')) as { employee_id: string | null; vehicle_id: string | null }[]) ?? [];
}

export async function rememberPersonVan(employeeId: string, vehicleId: string | null, isTest: boolean): Promise<void> {
  check(
    await supabase
      .from('kit_person_vans')
      .upsert({ employee_id: employeeId, vehicle_id: vehicleId, is_test: isTest, updated_at: new Date().toISOString() }, { onConflict: 'employee_id' })
  );
}
