import { useCallback, useEffect, useMemo, useState } from 'react';
import { loadAuditReferenceData, listFileDeletions, StaffRow, VanRow } from '../../../../lib/siteAuditService';
import { buildAuditTargets, vanLabelFor, allTargetsOf, auditTargetsOf, AuditTarget, FileDeletion } from '../../../../lib/siteAuditLogic';
import { AuditChecklistItem, Auditor, KitType } from '../../../../lib/supabase';
import { listPersonVans, recordAllPersonVans } from '../../../../lib/vanChangeService';
import { vanChangesToCheck } from '../../../../lib/vanChange';
import { TEST_MODE } from './styles';

/** Staff, vans, checklist, kit types + the "Dom Oliver · YE24 TNL" labels built from them. */
export function useAuditRef() {
  const [employees, setEmployees] = useState<StaffRow[]>([]);
  const [vehicles, setVehicles] = useState<VanRow[]>([]);
  const [checklist, setChecklist] = useState<AuditChecklistItem[]>([]);
  const [kitTypes, setKitTypes] = useState<KitType[]>([]);
  const [auditors, setAuditors] = useState<Auditor[]>([]);
  const [personVans, setPersonVans] = useState<{ employee_id: string | null; vehicle_id: string | null }[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const ref = await loadAuditReferenceData();
      setEmployees(ref.employees);
      setVehicles(ref.vehicles);
      setChecklist(ref.checklist);
      setKitTypes(ref.kitTypes);
      setAuditors(ref.auditors);
      // record every person's current van in one go (new people only), then read them back
      try {
        await recordAllPersonVans(TEST_MODE);
        setPersonVans(await listPersonVans());
      } catch {
        setPersonVans([]);
      }
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
  /** every possible holder: gangers, then other staff, then spare vans */
  const allTargets = useMemo<AuditTarget[]>(() => allTargetsOf(targets), [targets]);
  /** who can be audited: gangers, staff with a van, spare vans */
  const auditTargets = useMemo<AuditTarget[]>(() => auditTargetsOf(targets), [targets]);
  const vanLabel = useCallback(
    (vehicleId: string | null | undefined, fallbackReg?: string | null) => vanLabelFor(targets, vehicleId, fallbackReg),
    [targets]
  );
  /** holder page key for a van id: the person on it (ganger first), else the spare van */
  const keyForVan = useCallback(
    (vehicleId: string | null | undefined) => allTargets.find((t) => t.vehicleId && t.vehicleId === vehicleId)?.key ?? null,
    [allTargets]
  );

  /** people whose van was changed in Employee / Vehicle Management: their kit didn't move */
  const vanChanges = useMemo(() => vanChangesToCheck(employees, personVans), [employees, personVans]);

  return {
    employees, vehicles, checklist, kitTypes, setKitTypes, auditors, targets, allTargets, auditTargets,
    vanLabel, keyForVan, personVans, vanChanges, loaded, error, reload,
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
