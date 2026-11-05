import { useMemo, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { Sheet, Field, ErrorNote } from './ui';
import { btn, inputCls, TEST_MODE } from './styles';
import { ActorPicker } from './ActorPicker';
import { useActor } from './useActor';
import { TargetPicker } from './TargetPicker';
import { Auditor, KitItemOverview } from '../../../../lib/supabase';
import { AuditTarget, holderLabel } from '../../../../lib/siteAuditLogic';
import { OffRoadDest, planOffRoad } from '../../../../lib/fleetLogic';
import { takeOutOfVan, vanOffRoad, vanBackOnRoad, deletePlant, deleteAudit, VanStatusRow } from '../../../../lib/fleetService';
import { moveKit } from '../../../../lib/siteAuditService';

const kitName = (k: Pick<KitItemOverview, 'type_name' | 'plant_no'>) => `${k.type_name}${k.plant_no ? ` ${k.plant_no}` : ''}`;
const radio = (on: boolean) =>
  `flex items-start gap-3 min-h-[44px] p-3 rounded-lg border cursor-pointer ${on ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:bg-slate-50'}`;

// ---------------------------------------------------------------- take out of van

/** The van becomes a spare van; all the person's kit, PPE dates and not-carried list stay with it. */
export function TakeOutSheet({ person, vanLabel, vehicleId, kitCount, auditors, onClose, onDone }: {
  person: { id: string; name: string }; vanLabel: string; vehicleId: string; kitCount: number;
  auditors: Auditor[]; onClose: () => void; onDone: (msg: string) => void;
}) {
  const { actorId, setActorId } = useActor(auditors);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reg = vanLabel.split(' · ').pop() ?? vanLabel;
  const save = async () => {
    if (!actorId) return setError('Pick who’s doing this.');
    setBusy(true);
    setError(null);
    try {
      const r = await takeOutOfVan({ personId: person.id, vehicleId, note: null, testMode: TEST_MODE, actorId });
      onDone(r.vanSaved
        ? `${person.name} is off the van. ${reg} is now a spare van and keeps the kit.`
        : `Kit now stays with ${reg} as spare-van kit. Van change not saved in test mode: ${person.name} still shows on the van until this goes live.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not take them out of the van.');
      setBusy(false);
    }
  };
  return (
    <Sheet title={`Take ${person.name} out of the van?`} subtitle={vanLabel} onClose={onClose}
      footer={<><button type="button" className={btn.secondary} onClick={onClose}>Cancel</button><button type="button" className={btn.danger} disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Take out of van'}</button></>}>
      <ActorPicker auditors={auditors} value={actorId} onChange={setActorId} />
      <p className="text-sm text-slate-700">
        {reg} becomes a <strong>spare van</strong>. All {kitCount} kit item{kitCount === 1 ? '' : 's'} {person.name} holds stay in it as
        spare-van kit (“{reg} · spare van”), with their PPE dates and not-carried list. Every move is logged.
      </p>
      {TEST_MODE && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Test mode: the kit moves are saved (test kit only), but {person.name}’s van is not changed in Employee Management. Van change not saved in test mode.
        </p>
      )}
      <ErrorNote message={error} />
    </Sheet>
  );
}

// ---------------------------------------------------------------- where does it go (shared)

type DestKind = '' | 'spare' | 'away_for_service' | 'holder';

function DestinationPicker({ value, onChange, targets, excludeKey, allowBlank, label }: {
  value: { kind: DestKind; company: string; holderKey: string };
  onChange: (v: { kind: DestKind; company: string; holderKey: string }) => void;
  targets: AuditTarget[]; excludeKey?: string | null; allowBlank?: string; label: string;
}) {
  return (
    <div className="space-y-2">
      <Field label={label}>
        {(id) => (
          <select id={id} className={inputCls} value={value.kind} onChange={(e) => onChange({ ...value, kind: e.target.value as DestKind })}>
            {allowBlank !== undefined && <option value="">{allowBlank}</option>}
            <option value="spare">Yard Lockup</option>
            <option value="away_for_service">Away for service</option>
            <option value="holder">Another person or spare van…</option>
          </select>
        )}
      </Field>
      {value.kind === 'away_for_service' && (
        <Field label="Service company (optional)">{(id) => <input id={id} className={inputCls} value={value.company} onChange={(e) => onChange({ ...value, company: e.target.value })} />}</Field>
      )}
      {value.kind === 'holder' && (
        <TargetPicker label="Who gets it?" targets={targets.filter((t) => t.key !== excludeKey)} value={value.holderKey} onChange={(k) => onChange({ ...value, holderKey: k })} />
      )}
    </div>
  );
}

function toDest(v: { kind: DestKind; company: string; holderKey: string }, targets: AuditTarget[]): OffRoadDest | null {
  if (v.kind === 'spare') return { kind: 'spare' };
  if (v.kind === 'away_for_service') return { kind: 'away_for_service', serviceCompany: v.company };
  if (v.kind === 'holder') {
    const t = targets.find((x) => x.key === v.holderKey);
    if (!t) return null;
    return { kind: 'holder', holderEmployeeId: t.kind === 'person' ? t.personId : null, vehicleId: t.kind === 'spare_van' ? t.vehicleId : null };
  }
  return null;
}

function destText(d: OffRoadDest | null, targets: AuditTarget[]) {
  if (!d) return 'Not chosen yet';
  if (d.kind === 'spare') return 'Yard Lockup';
  if (d.kind === 'away_for_service') return `Away for service${d.serviceCompany ? ` · ${d.serviceCompany}` : ''}`;
  const t = targets.find((x) => (d.holderEmployeeId ? x.personId === d.holderEmployeeId : x.kind === 'spare_van' && x.vehicleId === d.vehicleId));
  return t?.label ?? 'Someone else';
}

const blankDest = { kind: '' as DestKind, company: '', holderKey: '' };

// ---------------------------------------------------------------- van off the road

const REASONS: { value: VanStatusRow['reason']; label: string }[] = [
  { value: 'broken_down', label: 'Broken down' },
  { value: 'leaving_fleet', label: 'Leaving the fleet' },
  { value: 'other', label: 'Other' },
];

/** Van off the road: why, and where each piece of kit goes. The van is then left out of pickers and audits. */
export function OffRoadSheet({ vehicleId, vanLabel, kit, targets, auditors, onClose, onDone }: {
  vehicleId: string; vanLabel: string; kit: KitItemOverview[]; targets: AuditTarget[];
  auditors: Auditor[]; onClose: () => void; onDone: (msg: string) => void;
}) {
  const { actorId, setActorId } = useActor(auditors);
  const [step, setStep] = useState<1 | 2>(1);
  const [reason, setReason] = useState<VanStatusRow['reason']>('broken_down');
  const [note, setNote] = useState('');
  const [all, setAll] = useState({ ...blankDest, kind: 'spare' as DestKind });
  const [per, setPer] = useState<Record<string, { kind: DestKind; company: string; holderKey: string }>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const others = targets.filter((t) => t.vehicleId !== vehicleId);

  const perDest = useMemo(() => {
    const out: Record<string, OffRoadDest> = {};
    for (const [id, v] of Object.entries(per)) {
      const d = toDest(v, others);
      if (v.kind && d) out[id] = d;
    }
    return out;
  }, [per, others]);
  const allDest = toDest(all, others);
  const plan = planOffRoad(kit, allDest, perDest);

  const save = async () => {
    setError(null);
    if (!actorId) return setError('Pick who’s doing this.');
    if (plan.missing.length) return setError('Choose where every item goes first.');
    setBusy(true);
    try {
      await vanOffRoad({ vehicleId, reason, note: note.trim() || null, moves: plan.moves, isTest: TEST_MODE, actorId });
      onDone(`${vanLabel} is off the road. ${kit.length} kit item${kit.length === 1 ? '' : 's'} moved.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not take the van off the road.');
      setBusy(false);
    }
  };

  return (
    <Sheet title="Van off the road" subtitle={`${vanLabel} · step ${step} of 2`} onClose={onClose}
      footer={<>
        {step === 2 ? <button type="button" className={btn.secondary} onClick={() => setStep(1)}>Back</button> : <button type="button" className={btn.secondary} onClick={onClose}>Cancel</button>}
        {step === 1
          ? <button type="button" className={btn.primary} onClick={() => setStep(2)}>Next: summary</button>
          : <button type="button" className={btn.danger} disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Take off the road'}</button>}
      </>}>
      {step === 1 ? (
        <>
          <ActorPicker auditors={auditors} value={actorId} onChange={setActorId} />
          <fieldset>
            <legend className="block text-xs font-semibold text-slate-600 mb-2">Why?</legend>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {REASONS.map((r) => (
                <label key={r.value} className={radio(reason === r.value)}>
                  <input type="radio" name="reason" checked={reason === r.value} onChange={() => setReason(r.value)} className="mt-1 h-4 w-4" />
                  <span className="text-sm font-semibold text-slate-900">{r.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <Field label="Note (optional)">{(id) => <input id={id} className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. gearbox, sold" />}</Field>
          {kit.length === 0 ? (
            <p className="text-sm text-slate-600">No kit on this van.</p>
          ) : (
            <>
              <DestinationPicker label={`All ${kit.length} items to…`} value={all} onChange={setAll} targets={others} />
              <fieldset>
                <legend className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">Or item by item</legend>
                <ul className="space-y-3">
                  {kit.map((k) => (
                    <li key={k.id} className="rounded-lg border border-slate-200 p-3">
                      <p className="text-sm font-semibold text-slate-900 mb-2">{kitName(k)} <span className="font-normal text-slate-500">· {holderLabel(k)}</span></p>
                      <DestinationPicker label="Goes to" value={per[k.id] ?? blankDest} onChange={(v) => setPer({ ...per, [k.id]: v })}
                        targets={others} allowBlank="Same as “all items”" />
                    </li>
                  ))}
                </ul>
              </fieldset>
            </>
          )}
        </>
      ) : (
        <>
          <p className="text-sm text-slate-700">{vanLabel} will show as <strong>Off the road</strong> ({REASONS.find((r) => r.value === reason)?.label.toLowerCase()}{note.trim() ? `: ${note.trim()}` : ''}) and be left out of pickers and audit lists until it’s back on the road.</p>
          <ul className="rounded-lg border border-slate-200 divide-y divide-slate-100">
            {kit.map((k) => (
              <li key={k.id} className="px-3 py-2 text-sm text-slate-800 flex items-center gap-2">
                <span className="font-semibold">{kitName(k)}</span>
                <ArrowRight className="h-4 w-4 text-slate-400 flex-shrink-0" />
                <span className={perDest[k.id] ?? allDest ? '' : 'text-red-700 font-semibold'}>{destText(perDest[k.id] ?? allDest, others)}</span>
              </li>
            ))}
            {kit.length === 0 && <li className="px-3 py-2 text-sm text-slate-600">No kit to move.</li>}
          </ul>
          {plan.missing.length > 0 && <p className="text-sm text-red-700">{plan.missing.length} item(s) still need somewhere to go.</p>}
        </>
      )}
      <ErrorNote message={error} />
    </Sheet>
  );
}

// ---------------------------------------------------------------- find a home (van deleted / holder unknown)

export function HomeSheet({ item, targets, auditors, onClose, onDone }: {
  item: { id: string; item_name: string; plant_no: string | null }; targets: AuditTarget[];
  auditors: Auditor[]; onClose: () => void; onDone: () => void;
}) {
  const { actorId, setActorId } = useActor(auditors);
  const [dest, setDest] = useState({ ...blankDest, kind: 'spare' as DestKind });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    setError(null);
    if (!actorId) return setError('Pick who’s doing this.');
    const d = toDest(dest, targets);
    if (!d) return setError('Pick where it goes.');
    setBusy(true);
    try {
      await moveKit({
        itemId: item.id,
        status: d.kind === 'holder' ? 'on_van' : d.kind,
        holderEmployeeId: d.kind === 'holder' ? d.holderEmployeeId : null,
        vehicleId: d.kind === 'holder' ? d.vehicleId : null,
        serviceCompany: d.kind === 'away_for_service' ? d.serviceCompany?.trim() || null : null,
        note: 'Found a home',
        actorId,
      });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not move it.');
      setBusy(false);
    }
  };
  return (
    <Sheet title={`Find a home: ${item.item_name}${item.plant_no ? ` ${item.plant_no}` : ''}`} subtitle="Its holder or van is no longer on record" onClose={onClose}
      footer={<><button type="button" className={btn.secondary} onClick={onClose}>Cancel</button><button type="button" className={btn.primary} disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button></>}>
      <ActorPicker auditors={auditors} value={actorId} onChange={setActorId} />
      <DestinationPicker label="Where does it go?" value={dest} onChange={setDest} targets={targets} />
      <ErrorNote message={error} />
    </Sheet>
  );
}

// ---------------------------------------------------------------- delete plant completely

export function DeletePlantSheet({ item, auditors, onClose, onDone }: {
  item: Pick<KitItemOverview, 'id' | 'type_name' | 'plant_no'>; auditors: Auditor[]; onClose: () => void; onDone: () => void;
}) {
  const { actorId, setActorId } = useActor(auditors);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const expected = item.plant_no ?? item.type_name;
  const matches = typed.trim().toLowerCase() === expected.trim().toLowerCase();
  const save = async () => {
    setError(null);
    if (!actorId) return setError('Pick who’s doing this.');
    if (!matches) return setError(`Type ${expected} exactly to confirm.`);
    setBusy(true);
    try {
      await deletePlant(item.id, typed, actorId);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete it.');
      setBusy(false);
    }
  };
  return (
    <Sheet title={`Delete ${kitName(item)} completely?`} subtitle="Gone from Kit & Plant, gang / van pages, Needs attention and search" onClose={onClose}
      footer={<><button type="button" className={btn.secondary} onClick={onClose}>Keep it</button><button type="button" className={btn.danger} disabled={busy || !matches} onClick={save}>{busy ? 'Deleting…' : 'Delete completely'}</button></>}>
      <ActorPicker auditors={auditors} value={actorId} onChange={setActorId} />
      <p className="text-sm text-slate-700">Its kit history and certificates are deleted too. Past audits keep only their own line of text (e.g. “{kitName(item)}”). If it’s needed again, add it back with “+ Add kit”. To keep a record of scrapped kit, use “Scrapped (keep record)” instead.</p>
      <Field label={`Type ${expected} to confirm`}>{(id) => <input id={id} className={inputCls} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />}</Field>
      <ErrorNote message={error} />
    </Sheet>
  );
}

// ---------------------------------------------------------------- delete audit

export function DeleteAuditSheet({ auditId, label, auditors, onClose, onDone }: {
  auditId: string; label: string; auditors: Auditor[]; onClose: () => void; onDone: () => void;
}) {
  const { actorId, setActorId } = useActor(auditors);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    setError(null);
    if (!actorId) return setError('Pick who’s doing this.');
    if (!reason.trim()) return setError('Give a reason.');
    setBusy(true);
    try {
      await deleteAudit(auditId, reason.trim(), actorId);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete the audit.');
      setBusy(false);
    }
  };
  return (
    <Sheet title="Delete this audit?" subtitle={label} onClose={onClose}
      footer={<><button type="button" className={btn.secondary} onClick={onClose}>Keep it</button><button type="button" className={btn.danger} disabled={busy} onClick={save}>{busy ? 'Deleting…' : 'Delete audit'}</button></>}>
      <ActorPicker auditors={auditors} value={actorId} onChange={setActorId} />
      <p className="text-sm text-slate-700">The audit, its lines, team list and photos are removed. Kit already on the Kit &amp; Plant list stays where it is. The audit schedule goes back to the previous audit.</p>
      <Field label="Reason">{(id) => <input id={id} className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. done for the wrong gang" />}</Field>
      <ErrorNote message={error} />
    </Sheet>
  );
}

// ---------------------------------------------------------------- back on the road

export function BackOnRoadSheet({ vehicleId, vanLabel, auditors, onClose, onDone }: {
  vehicleId: string; vanLabel: string; auditors: Auditor[]; onClose: () => void; onDone: () => void;
}) {
  const { actorId, setActorId } = useActor(auditors);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    setError(null);
    if (!actorId) return setError('Pick who’s doing this.');
    setBusy(true);
    try {
      await vanBackOnRoad(vehicleId, actorId);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not put the van back on the road.');
      setBusy(false);
    }
  };
  return (
    <Sheet title={`${vanLabel} back on the road?`} subtitle="It shows again in pickers and audit lists" onClose={onClose}
      footer={<><button type="button" className={btn.secondary} onClick={onClose}>Cancel</button><button type="button" className={btn.primary} disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Back on the road'}</button></>}>
      <ActorPicker auditors={auditors} value={actorId} onChange={setActorId} />
      <ErrorNote message={error} />
    </Sheet>
  );
}
