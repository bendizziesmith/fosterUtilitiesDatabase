import { useEffect, useMemo, useState } from 'react';
import { listKit, swapKit } from '../../../../lib/siteAuditService';
import { previewSwap, AuditTarget, ServiceExpiryState, SwapDestination, SwapReplacement } from '../../../../lib/siteAuditLogic';
import { KitItemOverview } from '../../../../lib/supabase';

export type SwapItem = Pick<KitItemOverview, 'id' | 'kit_type_id' | 'type_name' | 'plant_no' | 'vehicle_id' | 'vehicle_reg'>;
export type Dest = 'away_for_service' | 'spare' | 'on_van' | 'removed';

/** State + save for a swap; shared by the Swap sheet and Update → "Swap with a spare". */
export function useSwapForm(item: SwapItem, targets: AuditTarget[]) {
  const [spares, setSpares] = useState<KitItemOverview[] | null>(null);
  const [dest, setDest] = useState<Dest>('away_for_service');
  const [company, setCompany] = useState('');
  const [destKey, setDestKey] = useState('');
  const [repl, setRepl] = useState(''); // spare id | 'new' | 'none'
  const [newPlant, setNewPlant] = useState('');
  const [dates, setDates] = useState<ServiceExpiryState>({ serviceDate: null, expiry: null, expiryManual: false });
  const [note, setNote] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    listKit()
      .then((all) => {
        const s = all.filter((k) => k.status === 'spare' && k.kit_type_id === item.kit_type_id);
        setSpares(s);
        setRepl(s.length ? s[0].id : 'new');
      })
      .catch((e) => setLoadError(e.message));
  }, [item.kit_type_id]);

  const destVan = targets.find((t) => t.key === destKey);
  const preview = useMemo(() => {
    const d: SwapDestination =
      dest === 'away_for_service'
        ? { destination: dest, serviceCompany: company }
        : dest === 'on_van'
          ? { destination: dest, vanReg: destVan?.label ?? 'another van' }
          : { destination: dest };
    const spare = spares?.find((s) => s.id === repl);
    const r: SwapReplacement = spare
      ? { mode: 'spare', plantNo: spare.plant_no }
      : repl === 'new'
        ? { mode: 'new', plantNo: newPlant.trim() || null }
        : { mode: 'none' };
    return previewSwap({ plant_no: item.plant_no, type_name: item.type_name, vehicle_reg: item.vehicle_reg }, d, r);
  }, [dest, company, destVan, repl, newPlant, spares, item]);

  const save = async () => {
    if (dest === 'on_van' && !destVan?.vehicleId) throw new Error('Pick the van it is going to.');
    if (!repl) throw new Error('Choose what goes on the van instead.');
    const isSpare = repl !== 'new' && repl !== 'none';
    await swapKit({
      itemId: item.id,
      destination: dest,
      destVehicleId: dest === 'on_van' ? destVan!.vehicleId : null,
      serviceCompany: dest === 'away_for_service' ? company.trim() || null : null,
      replacement: isSpare ? 'spare' : (repl as 'new' | 'none'),
      spareId: isSpare ? repl : null,
      newPlantNo: repl === 'new' ? newPlant.trim() || null : null,
      newServiceDate: repl === 'new' ? dates.serviceDate : null,
      newExpiryDate: repl === 'new' ? dates.expiry : null,
      note: note.trim() || null,
    });
  };

  return {
    item, targets, spares, dest, setDest, company, setCompany, destKey, setDestKey, repl, setRepl,
    newPlant, setNewPlant, dates, setDates, note, setNote, preview, save, loadError,
  };
}

export type SwapForm = ReturnType<typeof useSwapForm>;
