import { useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, Truck, Warehouse, User } from 'lucide-react';
import { Sheet, ErrorNote } from './ui';
import { btn, inputCls, TEST_MODE } from './styles';
import { TargetPicker } from './TargetPicker';
import { AuditTarget } from '../../../../lib/siteAuditLogic';
import { planVanChange, MixChoice, VanChangeMode, VanKit } from '../../../../lib/vanChange';
import { changeVan } from '../../../../lib/vanChangeService';
import { Auditor, KitItemOverview } from '../../../../lib/supabase';
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
  const oldHolders = holdersOf(oldVehicleId);
  const newHolders = holdersOf(newVehicleId);
  const oldLabel = oldVehicleId ? vanLabel(oldVehicleId) : 'no van';
  const newLabel = newVehicleId ? vanLabel(newVehicleId) : '';

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
      <ul className="text-sm text-slate-800 space-y-0.5">{items.map((k) => <li key={k.id}>• {kitLabel(k)}</li>)}</ul>
    ) : (
      <p className="text-sm text-slate-500">{empty}</p>
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
              <p className="text-sm text-slate-800 flex items-center gap-2">
                <User className="h-4 w-4 text-slate-500" />
                {newHolders.length ? `Has it now: ${newHolders.join(', ')}` : 'Spare van (nobody assigned)'}
              </p>
              <p className="text-xs font-semibold text-slate-600">Spare-van kit in this van</p>
              <KitList items={newKit} empty="No spare-van kit in this van." />
            </div>
          )}
        </>
      )}

      {step === 2 && (
        <>
          <fieldset>
            <legend className="text-sm font-bold text-slate-900 mb-2">How does the kit move?</legend>
            <div className="space-y-2">
              {oldVehicleId && (
                <label className={radio(mode === 'take_all')}>
                  <input type="radio" name="mode" checked={mode === 'take_all'} onChange={() => setMode('take_all')} className="mt-1 h-4 w-4" />
                  <span><span className="block text-sm font-semibold text-slate-900">Take my kit with me</span>
                    <span className="block text-xs text-slate-600">Everything {person.name} holds goes with them (and any spare-van kit in the new van becomes theirs).</span></span>
                </label>
              )}
              <label className={radio(mode === 'use_new')}>
                <input type="radio" name="mode" checked={mode === 'use_new'} onChange={() => setMode('use_new')} className="mt-1 h-4 w-4" />
                <span><span className="block text-sm font-semibold text-slate-900">Use the kit already in the new van</span>
                  <span className="block text-xs text-slate-600">
                    {oldVehicleId ? `The old kit stays with ${oldLabel}${oldHolders.length ? ` (${oldHolders.join(', ')})` : ' as spare-van kit'}.` : 'Takes over the kit in the new van.'}
                  </span></span>
              </label>
              <label className={radio(mode === 'mix')}>
                <input type="radio" name="mode" checked={mode === 'mix'} onChange={() => setMode('mix')} className="mt-1 h-4 w-4" />
                <span><span className="block text-sm font-semibold text-slate-900">Mix</span>
                  <span className="block text-xs text-slate-600">Choose item by item.</span></span>
              </label>
            </div>
          </fieldset>

          {mode === 'mix' && (
            <div className="space-y-4">
              {oldKit.length > 0 && (
                <MixList title={`${person.name}’s kit`} items={oldKit} mix={mix} setMix={setMix}
                  options={[['new_van', 'Move to new van'], ['old_van', 'Leave in old van'], ['spare', 'Back to yard as spare']]} fallback="new_van" />
              )}
              {newKit.length > 0 && (
                <MixList title={`Already in the new van (${newLabel})`} items={newKit} mix={mix} setMix={setMix}
                  options={oldVehicleId
                    ? [['keep', 'Keep (now theirs)'], ['old_van', 'Move to old van'], ['spare', 'Back to yard']]
                    : [['keep', 'Keep (now theirs)'], ['spare', 'Back to yard']]} fallback="keep" />
              )}
              {!oldKit.length && !newKit.length && <p className="text-sm text-slate-600">Neither van has any kit recorded.</p>}
            </div>
          )}
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
            <Summary icon={<Truck className="h-4 w-4 text-slate-500" />}
              title={`Left in the old van (${oldLabel}) · ${oldHolders.length ? oldHolders.join(', ') : 'spare-van kit'}`}
              items={plan.leftInOld} empty="Nothing." />
          )}
          <Summary icon={<Warehouse className="h-4 w-4 text-violet-600" />} title="Back to the yard as spares" items={plan.toYard} empty="Nothing." />
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
            <label htmlFor={`mix-${k.id}`} className="text-sm font-semibold text-slate-900">{kitLabel(k)}</label>
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
      <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 mb-1">{icon}{title}</h3>
      {items.length ? (
        <ul className="text-sm text-slate-800 space-y-0.5">{items.map((k) => <li key={k.id}>• {kitLabel(k)}</li>)}</ul>
      ) : (
        <p className="text-sm text-slate-500">{empty}</p>
      )}
    </section>
  );
}
