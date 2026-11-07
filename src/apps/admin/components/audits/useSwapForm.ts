import { useEffect, useMemo, useState } from 'react';
import { listKit, setKitOwnership, swapKit } from '../../../../lib/siteAuditService';
import type { Ownership } from '../../../../lib/ownershipLogic';
import { previewSwap, holderKey, holderLabel, spareOptions, AuditTarget, ServiceExpiryState, SwapDestination, SwapReplacement } from '../../../../lib/siteAuditLogic';
import { KitItemOverview } from '../../../../lib/supabase';

export type SpareOption = KitItemOverview & { where: string };

export type SwapItem = Pick<KitItemOverview, 'id' | 'kit_type_id' | 'type_name' | 'plant_no' | 'vehicle_id' | 'vehicle_reg'
  | 'status' | 'holder_kind' | 'holder_employee_id' | 'holder_name' | 'holder_reg'>;
/** holder = another person or a spare van */
export type Dest = 'away_for_service' | 'spare' | 'holder' | 'removed';

/** State + save for a swap; shared by the Swap sheet and Update → "Swap with a spare". */
export function useSwapForm(item: SwapItem, targets: AuditTarget[]) {
  /** same-type spares: in the Yard Lockup, and spare-van kit ('WV72 OZL · spare van') */
  const [spareGroups, setSpareGroups] = useState<{ lockup: SpareOption[]; spareVans: SpareOption[] } | null>(null);
  const [dest, setDest] = useState<Dest>('away_for_service');
  const [company, setCompany] = useState('');
  const [destKey, setDestKey] = useState('');
  const [repl, setRepl] = useState(''); // spare id | 'new' | 'none'
  const [newPlant, setNewPlant] = useState('');
  /** Fosters | Hire for a new replacement (Fosters by default) */
  const [newOwnership, setNewOwnership] = useState<Ownership>('fosters');
  const [dates, setDates] = useState<ServiceExpiryState>({ serviceDate: null, expiry: null, expiryManual: false });
  const [note, setNote] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    listKit()
      .then((all) => {
        const g = spareOptions(all, item.kit_type_id, item.id);
        setSpareGroups(g);
        const first = g.lockup[0] ?? g.spareVans[0];
        setRepl(first ? first.id : 'new');
      })
      .catch((e) => setLoadError(e.message));
  }, [item.kit_type_id, item.id]);
  const spares = useMemo(() => (spareGroups ? [...spareGroups.lockup, ...spareGroups.spareVans] : null), [spareGroups]);

  const destHolder = targets.find((t) => t.key === destKey);
  /** the item's current holder page key, so the picker can leave it out */
  const currentKey = holderKey(item);
  const holderText = holderLabel(item);
  const preview = useMemo(() => {
    const d: SwapDestination =
      dest === 'away_for_service'
        ? { destination: dest, serviceCompany: company }
        : dest === 'holder'
          ? { destination: 'on_van' as const, vanReg: destHolder?.label ?? 'someone else' }
          : { destination: dest };
    const spare = spares?.find((s) => s.id === repl);
    const r: SwapReplacement = spare
      ? { mode: 'spare', plantNo: spare.plant_no, from: spare.where }
      : repl === 'new'
        ? { mode: 'new', plantNo: newPlant.trim() || null }
        : { mode: 'none' };
    return previewSwap({ plant_no: item.plant_no, type_name: item.type_name, vehicle_reg: holderText }, d, r);
  }, [dest, company, destHolder, repl, newPlant, spares, item, holderText]);

  const save = async (actorId: string | null) => {
    if (!actorId) throw new Error('Pick who’s doing this.');
    if (dest === 'holder' && !destHolder) throw new Error('Pick who it is going to.');
    if (!repl) throw new Error('Choose what goes on the van instead.');
    const isSpare = repl !== 'new' && repl !== 'none';
    const newId = await swapKit({
      itemId: item.id,
      destination: dest,
      destHolderEmployeeId: dest === 'holder' && destHolder?.kind === 'person' ? destHolder.personId : null,
      destVehicleId: dest === 'holder' && destHolder?.kind === 'spare_van' ? destHolder.vehicleId : null,
      serviceCompany: dest === 'away_for_service' ? company.trim() || null : null,
      replacement: isSpare ? 'spare' : (repl as 'new' | 'none'),
      spareId: isSpare ? repl : null,
      newPlantNo: repl === 'new' ? newPlant.trim() || null : null,
      newServiceDate: repl === 'new' ? dates.serviceDate : null,
      newExpiryDate: repl === 'new' ? dates.expiry : null,
      note: note.trim() || null,
      actorId,
    });
    if (repl === 'new' && newId && newOwnership === 'hire') await setKitOwnership(newId, 'hire');
  };

  return {
    item, targets, currentKey, spares, spareGroups, dest, setDest, company, setCompany, destKey, setDestKey, repl, setRepl,
    newPlant, setNewPlant, newOwnership, setNewOwnership, dates, setDates, note, setNote, preview, save, loadError,
  };
}

export type SwapForm = ReturnType<typeof useSwapForm>;
