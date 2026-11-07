import { useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, Truck, Warehouse, User, PackagePlus } from 'lucide-react';
import { Sheet, ErrorNote } from './ui';
import { btn, inputCls, TEST_MODE } from './styles';
import { TargetPicker } from './TargetPicker';
import { AuditTarget } from '../../../../lib/siteAuditLogic';
import { planVanChange, vanModeOptions, kitOnHandText, occupiedWarning, vanShortfall, bestSpare, takeMoves, takeSummary, MixChoice, TakeChoice, VanChangeMode, VanKit } from '../../../../lib/vanChange';
import { spareOptions, todayISO } from '../../../../lib/siteAuditLogic';
import { TakeSpareLine, TakeOtherButton, TakeState } from './TakeSpare';
import { changeVan } from '../../../../lib/vanChangeService';
import { Auditor, KitItemOverview, KitType } from '../../../../lib/supabase';
import { ActorPicker } from './ActorPicker';
import { useActor } from './useActor';
import { StaffRow } from '../../../../lib/siteAuditService';

const kitLabel = (k: VanKit) => `${k.type_name}${k.plant_no ? ` ${k.plant_no}` : ''}`;
const radio = (on: boolean) =>
  `flex items-start gap-3 min-h-[44px] p-3 rounded-lg border cursor-pointer ${on ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:bg-slate-50'}`;

/**
 * Change a person's van and decide where the kit goes.
 * Step 1 new van · Step 2 how the kit moves · Step 3 summary.
 * In test mode the kit moves happen (test kit only) but employees is NOT written.
 */
export function ChangeVanSheet({
  person,
  oldVehicleId,
  presetNewVehicleId,
  assignmentAlreadyDone = false,
  targets,
  employees,
  allKit,
  kitTypes = [],
  notCarriedTypeIds = [],
  vanLabel,
  auditors,
  onClose,
  onDone,
}: {
  person: { id: string; name: string };
  oldVehicleId: string | null;
  /** van already changed in Employee / Vehicle Management: start at step 2 */
  presetNewVehicleId?: string | null;
  assignmentAlreadyDone?: boolean;
  targets: AuditTarget[];
  employees: StaffRow[];
  allKit: KitItemOverview[];
  /** for "Take a spare" of any type, and the auto expiry of a new item */
  kitTypes?: KitType[];
  /** kit types marked "not carried" for this person: never "missing" */
  notCarriedTypeIds?: string[];
  vanLabel: (id: string | null, reg?: string | null) => string;
  auditors: Auditor[];
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [step, setStep] = useState(presetNewVehicleId ? 2 : 1);
  const [newKey, setNewKey] = useState(() => targets.find((t) => t.vehicleId && t.vehicleId === presetNewVehicleId)?.key ?? '');
  const [mode, setMode] = useState<VanChangeMode>(oldVehicleId ? 'take_all' : 'use_new');
  const [mix, setMix] = useState<Record<string, MixChoice>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { actorId, setActorId } = useActor(auditors);

  const newVehicleId = targets.find((t) => t.key === newKey)?.vehicleId ?? null;
  // kit belongs to the person; the new van brings only its spare-van kit
  const oldKit = useMemo<VanKit[]>(
    () => allKit.filter((k) => k.status === 'on_van' && k.holder_employee_id === person.id),
    [allKit, person.id]
  );
  const newKit = useMemo<VanKit[]>(
    () => (newVehicleId ? allKit.filter((k) => k.status === 'on_van' && k.holder_kind === 'spare_van' && k.spare_vehicle_id === newVehicleId) : []),
    [allKit, newVehicleId]
  );
  const holdersOf = (vid: string | null) =>
    vid ? employees.filter((e) => e.assigned_vehicle_id === vid && e.id !== person.id).map((e) => e.full_name) : [];

  const plan = useMemo(
    () => planVanChange({ oldKit, newKit, mode, mix, hasOldVan: !!oldVehicleId }),
    [oldKit, newKit, mode, mix, oldVehicleId]
  );
  // ---------------------------------------------- "Anything missing?": spares taken in the same Save
  const [takeState, setTakeState] = useState<Record<string, TakeState>>({});
  const [extraTypes, setExtraTypes] = useState<string[]>([]);
  const shortfall = useMemo(
    () => vanShortfall({ oldKit, willHold: plan.willHold, notCarried: notCarriedTypeIds }),
    [oldKit, plan.willHold, notCarriedTypeIds]
  );
  const inPlan = useMemo(() => new Set([...oldKit, ...newKit].map((k) => k.id)), [oldKit, newKit]);
  const groupsFor = (typeId: string) => {
    const g = spareOptions(allKit, typeId, '');
    // never the kit this change already moves, nor kit on the old / new van itself
    const ok = (k: KitItemOverview) => !inPlan.has(k.id) && k.vehicle_id !== oldVehicleId && k.vehicle_id !== newVehicleId;
    return { lockup: g.lockup.filter(ok), spareVans: g.spareVans.filter(ok) };
  };
  const stateFor = (typeId: string): TakeState => {
    if (takeState[typeId]) return takeState[typeId];
    const best = bestSpare(groupsFor(typeId), todayISO());
    return { mode: best ? 'take' : 'leave', itemId: best?.id ?? null, picking: false, plant: '', dates: { serviceDate: null, expiry: null, expiryManual: false } };
  };
  const takeTypes = [
    ...shortfall,
    ...extraTypes.filter((t) => !shortfall.some((x) => x.kit_type_id === t)).map((t) => ({ kit_type_id: t, type_name: kitTypes.find((k) => k.id === t)?.name ?? 'Kit' })),
  ];
  const choices: TakeChoice[] = takeTypes.map(({ kit_type_id, type_name }) => {
    const st = stateFor(kit_type_id);
    const g = groupsFor(kit_type_id);
    const item = [...g.lockup, ...g.spareVans].find((o) => o.id === st.itemId);
    if (st.mode === 'take' && item) return { kit_type_id, type_name, kind: 'spare', itemId: item.id, plantNo: item.plant_no, from: item.where };
    if (st.mode === 'new') return { kit_type_id, type_name, kind: 'new', plantNo: st.plant, serviceDate: st.dates.serviceDate, expiry: st.dates.expiry };
    return { kit_type_id, type_name, kind: 'leave' };
  });
  const otherTypes = kitTypes.filter((t) => !takeTypes.some((x) => x.kit_type_id === t.id));

  const oldHolders = holdersOf(oldVehicleId);
  const newHolders = holdersOf(newVehicleId);
  const oldLabel = oldVehicleId ? vanLabel(oldVehicleId) : 'no van';
  const newLabel = newVehicleId ? vanLabel(newVehicleId) : '';
  const newReg = targets.find((t) => t.key === newKey)?.reg ?? newLabel;
  const onHand = kitOnHandText({ oldKit, newKit, newLabel: newReg });
  const warning = newVehicleId ? occupiedWarning(newReg, newHolders) : null;
  /** who is on the new van now: shown before step 2 (and on step 2 when the van was preset) */
  const occupied =
    warning ? (
      <div role="alert" className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
        <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
        <span>{warning}</span>
      </div>
    ) : null;

  const save = async () => {
    if (!newVehicleId) return;
    if (!actorId) {
      setError('Pick who’s doing this.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const r = await changeVan({
        personId: person.id,
        oldVehicleId,
        newVehicleId,
        moves: plan.moves,
        takes: takeMoves(choices),
        note: `Van change: ${person.name} ${oldLabel} → ${newLabel}`,
        testMode: TEST_MODE,
        assignmentAlreadyDone,
        actorId,
      });
      onDone(
        assignmentAlreadyDone
          ? 'Kit sorted for the new van.'
          : r.vanSaved
            ? `${person.name} is now on ${newLabel}. Kit moved.`
            : 'Van change not saved in test mode. It will save once this goes live. The kit moves were saved (test kit).'
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not change the van.');
      setSaving(false);
    }
  };

  const Footer = (
    <>
      {step > 1 && !(step === 2 && presetNewVehicleId) ? (
        <button type="button" className={btn.secondary} onClick={() => setStep(step - 1)}>Back</button>
      ) : (
        <button type="button" className={btn.secondary} onClick={onClose}>Cancel</button>
      )}
      {step < 3 ? (
        <button type="button" className={btn.primary} disabled={!newVehicleId} onClick={() => setStep(step + 1)}>Next</button>
      ) : (
        <button type="button" className={btn.primary} disabled={saving} onClick={save}>{saving ? 'Saving…' : assignmentAlreadyDone ? 'Save kit moves' : 'Change van'}</button>
      )}
    </>
  );

  const KitList = ({ items, empty }: { items: VanKit[]; empty: string }) =>
    items.length ? (
      <ul className="text-base sm:text-sm text-slate-800 space-y-0.5">{items.map((k) => <li key={k.id}>• {kitLabel(k)}</li>)}</ul>
    ) : (
      <p className="text-sm text-slate-600">{empty}</p>
    );

  return (
    <Sheet
      title={assignmentAlreadyDone ? `Van changed: check ${person.name}’s kit` : `Change van for ${person.name}`}
      subtitle={`Step ${step} of 3 · now on ${oldLabel}`}
      onClose={onClose}
      footer={Footer}
    >
      {step === 1 && (
        <>
          <ActorPicker auditors={auditors} value={actorId} onChange={setActorId} />
          <TargetPicker label="New van" targets={targets} value={newKey} onChange={setNewKey} vansOnly excludeVehicleId={oldVehicleId} />
          <p className="text-xs text-slate-600">{person.name}’s own kit goes with them. Next you choose what happens to it and to any spare-van kit in the new van.</p>
          {newVehicleId && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
              <p className="text-base sm:text-sm text-slate-800 flex items-center gap-2">
                <User className="h-4 w-4 text-slate-600" />
                {newHolders.length ? `Has it now: ${newHolders.join(', ')}` : 'Spare van (nobody assigned)'}
              </p>
              {occupied}
              <p className="text-xs font-semibold text-slate-600">Spare-van kit in this van</p>
              <KitList items={newKit} empty="No spare-van kit in this van." />
            </div>
          )}
        </>
      )}

      {step === 2 && (
        <>
          {occupied}
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-1" aria-live="polite">
            <p className="text-base sm:text-sm text-slate-800 flex items-start gap-2"><User className="h-4 w-4 mt-0.5 text-slate-600 flex-shrink-0" />{onHand.held}</p>
            <p className="text-base sm:text-sm text-slate-800 flex items-start gap-2"><Truck className="h-4 w-4 mt-0.5 text-slate-600 flex-shrink-0" />{onHand.newVan}</p>
          </div>
          <fieldset>
            <legend className="text-base sm:text-sm font-bold text-slate-900 mb-2">How does the kit move?</legend>
            <div className="space-y-2">
              {vanModeOptions(!!oldVehicleId).map((o) => (
                <label key={o.mode} className={radio(mode === o.mode)}>
                  <input type="radio" name="mode" checked={mode === o.mode} onChange={() => setMode(o.mode)} className="mt-1 h-4 w-4" />
                  <span><span className="block text-base sm:text-sm font-semibold text-slate-900">{o.title}</span>
                    <span className="block text-xs text-slate-600">
                      {o.mode === 'use_new' && oldVehicleId
                        ? `The kit they hold stays with ${oldLabel}${oldHolders.length ? ` (${oldHolders.join(', ')})` : ' as spare-van kit'}.`
                        : o.hint}
                    </span></span>
                </label>
              ))}
            </div>
          </fieldset>

          {mode === 'mix' && (
            <div className="space-y-4">
              {oldKit.length > 0 && (
                <MixList title={`${person.name}’s kit`} items={oldKit} mix={mix} setMix={setMix}
                  options={[['new_van', 'Move to new van'], ['old_van', 'Leave in old van'], ['spare', 'Back to Yard Lockup']]} fallback="new_van" />
              )}
              {newKit.length > 0 && (
                <MixList title={`Already in the new van (${newLabel})`} items={newKit} mix={mix} setMix={setMix}
                  options={oldVehicleId
                    ? [['keep', 'Keep (now theirs)'], ['old_van', 'Move to old van'], ['spare', 'Back to Yard Lockup']]
                    : [['keep', 'Keep (now theirs)'], ['spare', 'Back to Yard Lockup']]} fallback="keep" />
              )}
              {!oldKit.length && !newKit.length && <p className="text-base sm:text-sm text-slate-600">Neither van has any kit recorded.</p>}
            </div>
          )}

          <section aria-labelledby="missing-h" className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-3">
            <div>
              <h3 id="missing-h" className="text-base sm:text-sm font-bold text-slate-900">Anything missing?</h3>
              <p className="text-sm text-slate-600">
                {shortfall.length
                  ? 'Kit they had before but won’t have now. The best replacement is picked for you: in date, longest expiry, Yard Lockup first, then spare vans.'
                  : 'Nothing missing: they keep every kit type they had. You can still add kit from the Yard Lockup or a spare van.'}
              </p>
            </div>
            {takeTypes.length > 0 && (
              <ul className="space-y-2">
                {takeTypes.map(({ kit_type_id, type_name }) => (
                  <TakeSpareLine
                    key={kit_type_id}
                    title={shortfall.some((x) => x.kit_type_id === kit_type_id) ? `No ${type_name} on ${newLabel}` : `Take a spare: ${type_name}`}
                    typeName={type_name}
                    groups={groupsFor(kit_type_id)}
                    state={stateFor(kit_type_id)}
                    onChange={(st) => setTakeState((m) => ({ ...m, [kit_type_id]: st }))}
                    months={kitTypes.find((k) => k.id === kit_type_id)?.service_interval_months}
                    onRemove={shortfall.some((x) => x.kit_type_id === kit_type_id) ? undefined : () => setExtraTypes((xs) => xs.filter((x) => x !== kit_type_id))}
                  />
                ))}
              </ul>
            )}
            <TakeOtherButton types={otherTypes} onPick={(t) => setExtraTypes((xs) => [...xs, t])} />
          </section>
        </>
      )}

      {step === 3 && (
        <>
          {plan.duplicates.length > 0 && (
            <div role="alert" className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span>{person.name} would have two or more of: <strong>{plan.duplicates.join(', ')}</strong>. Go back to Mix to send one elsewhere, or carry on.</span>
            </div>
          )}
          <Summary icon={<User className="h-4 w-4 text-blue-600" />} title={`${person.name} will hold (${newLabel})`} items={plan.willHold} empty="No kit." />
          {oldVehicleId && (
            <Summary icon={<Truck className="h-4 w-4 text-slate-600" />}
              title={`Left in the old van (${oldLabel}) · ${oldHolders.length ? oldHolders.join(', ') : 'spare-van kit'}`}
              items={plan.leftInOld} empty="Nothing." />
          )}
          <Summary icon={<Warehouse className="h-4 w-4 text-violet-600" />} title="Back to the Yard Lockup" items={plan.toYard} empty="Nothing." />
          {choices.length > 0 && (
            <section className="rounded-lg border border-slate-200 p-3">
              <h3 className="text-base sm:text-sm font-bold text-slate-900 flex items-center gap-2 mb-1"><PackagePlus className="h-4 w-4 text-blue-600" />Spares for {person.name}</h3>
              <ul className="text-base sm:text-sm text-slate-800 space-y-0.5">{choices.map((c) => <li key={c.kit_type_id}>• {c.type_name}: {takeSummary(c)}</li>)}</ul>
            </section>
          )}
          {newHolders.length > 0 && !assignmentAlreadyDone && (
            <p className="text-xs text-slate-600">{newHolders.join(', ')} is also assigned to {newLabel}; that doesn’t change.</p>
          )}
          {TEST_MODE && !assignmentAlreadyDone && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Test mode: the kit moves are saved (test kit only), but {person.name}’s van is not changed. It will save once this goes live.
            </p>
          )}
        </>
      )}
      <ErrorNote message={error} />
    </Sheet>
  );
}

function MixList({ title, items, mix, setMix, options, fallback }: {
  title: string; items: VanKit[]; mix: Record<string, MixChoice>; setMix: (m: Record<string, MixChoice>) => void;
  options: [MixChoice, string][]; fallback: MixChoice;
}) {
  return (
    <fieldset>
      <legend className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">{title}</legend>
      <ul className="space-y-2">
        {items.map((k) => (
          <li key={k.id} className="grid grid-cols-1 sm:grid-cols-2 gap-2 items-center">
            <label htmlFor={`mix-${k.id}`} className="text-base sm:text-sm font-semibold text-slate-900">{kitLabel(k)}</label>
            <select id={`mix-${k.id}`} className={inputCls} value={mix[k.id] ?? fallback} onChange={(e) => setMix({ ...mix, [k.id]: e.target.value as MixChoice })}>
              {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </li>
        ))}
      </ul>
    </fieldset>
  );
}

function Summary({ icon, title, items, empty }: { icon: ReactNode; title: string; items: VanKit[]; empty: string }) {
  return (
    <section className="rounded-lg border border-slate-200 p-3">
      <h3 className="text-base sm:text-sm font-bold text-slate-900 flex items-center gap-2 mb-1">{icon}{title}</h3>
      {items.length ? (
        <ul className="text-base sm:text-sm text-slate-800 space-y-0.5">{items.map((k) => <li key={k.id}>• {kitLabel(k)}</li>)}</ul>
      ) : (
        <p className="text-sm text-slate-600">{empty}</p>
      )}
    </section>
  );
}
