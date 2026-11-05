import { useState } from 'react';
import { Sheet, Field, ErrorNote } from './ui';
import { btn, inputCls, TEST_MODE } from './styles';
import { addKit, createKitType } from '../../../../lib/siteAuditService';
import { AuditTarget, ServiceExpiryState, autoExpiry } from '../../../../lib/siteAuditLogic';
import { Auditor, KitType } from '../../../../lib/supabase';
import { ActorPicker } from './ActorPicker';
import { useActor } from './useActor';
import { TargetPicker } from './TargetPicker';
import { ServiceExpiryFields } from './ServiceExpiryFields';

export interface NewKitLine {
  kitTypeId: string;
  typeName: string;
  plantNo: string | null;
  serviceDate: string | null;
  expiryDate: string | null;
  expiryManual: boolean;
}

type Where = 'on_van' | 'spare' | 'away_for_service';

/**
 * mode "page": full details, saved straight to Kit & Plant.
 * mode "audit": adds a line to the audit; saved to Kit & Plant when the audit is submitted.
 */
export function AddKitSheet({
  mode,
  kitTypes,
  targets,
  auditors = [],
  vanReg,
  defaultHolderKey,
  defaultWhere = 'on_van',
  onClose,
  onSaved,
  onAddLine,
  onTypeCreated,
}: {
  mode: 'page' | 'audit';
  kitTypes: KitType[];
  /** every holder: gangers, other staff, spare vans */
  targets: AuditTarget[];
  auditors?: Auditor[];
  vanReg?: string | null;
  /** pre-pick this holder (person:<id> / van:<id>) */
  defaultHolderKey?: string | null;
  /** e.g. 'spare' from the Yard Lockup tab */
  defaultWhere?: Where;
  onClose: () => void;
  onSaved?: () => void;
  onAddLine?: (line: NewKitLine) => void;
  onTypeCreated?: (t: KitType) => void;
}) {
  const [typeId, setTypeId] = useState(kitTypes[0]?.id ?? '');
  const [newType, setNewType] = useState('');
  const [newMonths, setNewMonths] = useState('');
  const [plantNo, setPlantNo] = useState('');
  const [dates, setDates] = useState<ServiceExpiryState>({ serviceDate: null, expiry: null, expiryManual: false });
  const [where, setWhere] = useState<Where>(defaultWhere);
  const [holderKeyValue, setHolderKey] = useState(defaultHolderKey ?? '');
  const { actorId, setActorId } = useActor(auditors);
  const [company, setCompany] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const months =
    typeId === '__new' ? (Number(newMonths) > 0 ? Number(newMonths) : null) : kitTypes.find((t) => t.id === typeId)?.service_interval_months ?? null;
  const holder = targets.find((t) => t.key === holderKeyValue);

  const changeType = (id: string) => {
    setTypeId(id);
    const m = id === '__new' ? null : kitTypes.find((t) => t.id === id)?.service_interval_months ?? null;
    if (!dates.expiryManual) setDates({ ...dates, expiry: autoExpiry(dates.serviceDate, m) ?? dates.expiry });
  };

  const save = async () => {
    setError(null);
    if (typeId === '__new' && !newType.trim()) return setError('Type the name of the new kit type.');
    if (typeId === '__new' && newMonths && !(Number(newMonths) >= 1 && Number(newMonths) <= 240)) return setError('Service interval must be between 1 and 240 months.');
    if (mode === 'page' && where === 'on_van' && !holder) return setError('Pick who holds this kit.');
    if (mode === 'page' && !actorId) return setError('Pick who’s doing this.');
    setSaving(true);
    try {
      let type = kitTypes.find((t) => t.id === typeId);
      if (typeId === '__new') {
        type = await createKitType(newType, months);
        onTypeCreated?.(type);
      }
      if (!type) throw new Error('Pick a kit type.');
      if (mode === 'audit') {
        onAddLine?.({
          kitTypeId: type.id,
          typeName: type.name,
          plantNo: plantNo.trim() || null,
          serviceDate: dates.serviceDate,
          expiryDate: dates.expiry,
          expiryManual: dates.expiryManual,
        });
        return;
      }
      await addKit({
        kitTypeId: type.id,
        plantNo: plantNo.trim() || null,
        serviceDate: dates.serviceDate,
        expiryDate: dates.expiry,
        status: where,
        holderEmployeeId: where === 'on_van' && holder?.kind === 'person' ? holder.personId : null,
        vehicleId: where === 'on_van' && holder?.kind === 'spare_van' ? holder.vehicleId : null,
        serviceCompany: where === 'away_for_service' ? company.trim() || null : null,
        notes: notes.trim() || null,
        isTest: TEST_MODE,
        actorId: actorId || null,
      });
      onSaved?.();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not add the kit.';
      setError(msg.includes('kit_items_plant_no_active_uidx') ? 'That plant no is already on the Kit & Plant list.' : msg);
      setSaving(false);
    }
  };

  return (
    <Sheet
      title={mode === 'audit' ? 'Add kit to van' : 'Add kit'}
      subtitle={mode === 'audit' ? `${vanReg ?? ''} · saved to Kit & Plant when you submit` : 'Kit can be added with or without an audit'}
      onClose={onClose}
      footer={
        <>
          <button type="button" className={btn.secondary} onClick={onClose}>Cancel</button>
          <button type="button" className={btn.primary} onClick={save} disabled={saving}>
            {saving ? 'Saving…' : mode === 'audit' ? 'Add to audit' : 'Save kit'}
          </button>
        </>
      }
    >
      {mode === 'page' && <ActorPicker auditors={auditors} value={actorId} onChange={setActorId} />}
      <Field label="Kit type">
        {(id) => (
          <select id={id} className={inputCls} value={typeId} onChange={(e) => changeType(e.target.value)}>
            {kitTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            <option value="__new">+ New kit type…</option>
          </select>
        )}
      </Field>
      {typeId === '__new' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="New kit type name">
            {(id) => <input id={id} className={inputCls} value={newType} onChange={(e) => setNewType(e.target.value)} placeholder="e.g. Water pump" />}
          </Field>
          <Field label="Service every … months (optional)">
            {(id) => <input id={id} inputMode="numeric" className={inputCls} value={newMonths} onChange={(e) => setNewMonths(e.target.value.replace(/\D/g, ''))} placeholder="e.g. 12" />}
          </Field>
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field label="Plant no">{(id) => <input id={id} className={inputCls} value={plantNo} onChange={(e) => setPlantNo(e.target.value)} />}</Field>
        <ServiceExpiryFields state={dates} onChange={setDates} months={months} />
      </div>

      {mode === 'page' && (
        <>
          <fieldset>
            <legend className="block text-xs font-semibold text-slate-600 mb-2">Where is it?</legend>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {([
                ['on_van', 'Held by someone'],
                ['spare', 'Yard Lockup'],
                ['away_for_service', 'Away for service'],
              ] as [Where, string][]).map(([v, l]) => (
                <label key={v} className={`flex items-center gap-2 min-h-[44px] px-3 rounded-lg border cursor-pointer text-sm font-medium ${where === v ? 'border-blue-500 bg-blue-50 text-slate-900' : 'border-slate-200 text-slate-700 hover:bg-slate-50'}`}>
                  <input type="radio" name="where" checked={where === v} onChange={() => setWhere(v)} className="h-4 w-4" />
                  {l}
                </label>
              ))}
            </div>
          </fieldset>
          {where === 'on_van' && <TargetPicker label="Who holds it? (person or spare van)" targets={targets} value={holderKeyValue} onChange={setHolderKey} />}
          {where === 'away_for_service' && (
            <Field label="Service company (optional)">
              {(id) => <input id={id} className={inputCls} value={company} onChange={(e) => setCompany(e.target.value)} />}
            </Field>
          )}
          <Field label="Notes (optional)">
            {(id) => <textarea id={id} rows={2} className={`${inputCls} py-2`} value={notes} onChange={(e) => setNotes(e.target.value)} />}
          </Field>
        </>
      )}
      <ErrorNote message={error} />
    </Sheet>
  );
}
