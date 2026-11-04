import { useCallback, useEffect, useMemo, useState } from 'react';
import { loadAuditReferenceData, listFileDeletions, StaffRow, VanRow } from '../../../../lib/siteAuditService';
import { buildAuditTargets, vanLabelFor, AuditTarget, FileDeletion } from '../../../../lib/siteAuditLogic';
import { AuditChecklistItem, KitType } from '../../../../lib/supabase';

/** Staff, vans, checklist, kit types + the "Dom Oliver · YE24 TNL" labels built from them. */
export function useAuditRef() {
  const [employees, setEmployees] = useState<StaffRow[]>([]);
  const [vehicles, setVehicles] = useState<VanRow[]>([]);
  const [checklist, setChecklist] = useState<AuditChecklistItem[]>([]);
  const [kitTypes, setKitTypes] = useState<KitType[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const ref = await loadAuditReferenceData();
      setEmployees(ref.employees);
      setVehicles(ref.vehicles);
      setChecklist(ref.checklist);
      setKitTypes(ref.kitTypes);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load staff and vans.');
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const targets = useMemo(() => buildAuditTargets(employees, vehicles), [employees, vehicles]);
  const allTargets = useMemo<AuditTarget[]>(() => [...targets.gangs, ...targets.otherVans], [targets]);
  const vanLabel = useCallback(
    (vehicleId: string | null | undefined, fallbackReg?: string | null) => vanLabelFor(targets, vehicleId, fallbackReg),
    [targets]
  );
  /** gang/van page key for a van id ("gang:<id>" when a ganger has it) */
  const keyForVan = useCallback(
    (vehicleId: string | null | undefined) => allTargets.find((t) => t.vehicleId && t.vehicleId === vehicleId)?.key ?? null,
    [allTargets]
  );

  return {
    employees, vehicles, checklist, kitTypes, setKitTypes, targets, allTargets,
    vanLabel, keyForVan, loaded, error, reload,
  };
}

export function useFileDeletions() {
  const [deletions, setDeletions] = useState<FileDeletion[]>([]);
  const reload = useCallback(() => {
    listFileDeletions().then(setDeletions).catch(() => setDeletions([]));
  }, []);
  useEffect(() => {
    reload();
  }, [reload]);
  return { deletions, reload };
}
