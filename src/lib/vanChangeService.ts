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
  note: string | null;
  testMode: boolean;
  /** the van was already changed in Employee / Vehicle Management */
  assignmentAlreadyDone?: boolean;
}): Promise<{ vanSaved: boolean }> {
  check(
    await supabase.rpc('kit_change_van', {
      p_old_vehicle_id: input.oldVehicleId,
      p_new_vehicle_id: input.newVehicleId,
      p_moves: input.moves.map((m) => ({ item_id: m.itemId, to: m.to })),
      p_note: input.note,
      p_is_test: input.testMode,
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

/** Last van we know the person had, to spot a change made in Employee / Vehicle Management. */
export async function getPersonVan(employeeId: string): Promise<{ vehicle_id: string | null } | null> {
  const rows = check(await supabase.from('kit_person_vans').select('vehicle_id').eq('employee_id', employeeId)) as { vehicle_id: string | null }[] | null;
  return rows?.[0] ?? null;
}

export async function rememberPersonVan(employeeId: string, vehicleId: string | null, isTest: boolean): Promise<void> {
  check(
    await supabase
      .from('kit_person_vans')
      .upsert({ employee_id: employeeId, vehicle_id: vehicleId, is_test: isTest, updated_at: new Date().toISOString() }, { onConflict: 'employee_id' })
  );
}
