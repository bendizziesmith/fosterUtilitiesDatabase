import { useState } from 'react';
import { Sheet, Field, ErrorNote } from './ui';
import { btn, inputCls, TEST_MODE } from './styles';
import { addKit, createKitType, VanRow } from '../../../../lib/siteAuditService';
import { KitType } from '../../../../lib/supabase';

export interface NewKitLine {
  kitTypeId: string;
  typeName: string;
  plantNo: string | null;
  serviceDate: string | null;
  expiryDate: string | null;
}

type Where = 'on_van' | 'spare' | 'away_for_service';

/**
 * mode "page": full details, saved straight to Kit & Plant.
 * mode "audit": adds a line to the audit; it is saved to Kit & Plant when the audit is submitted.
 */
export function AddKitSheet({
  mode,
  kitTypes,
  vehicles,
  vanReg,
  onClose,
  onSaved,
  onAddLine,
  onTypeCreated,
}: {
  mode: 'page' | 'audit';
  kitTypes: KitType[];
  vehicles: VanRow[];
  vanReg?: string | null;
  onClose: () => void;
  onSaved?: () => void;
  onAddLine?: (line: NewKitLine) => void;
  onTypeCreated?: (t: KitType) => void;
}) {
  const [typeId, setTypeId] = useState(kitTypes[0]?.id ?? '');
  const [newType, setNewType] = useState('');
  const [plantNo, setPlantNo] = useState('');
  const [serviceDate, setServiceDate] = useState('');
  const [expiry, setExpiry] = useState('');
  const [where, setWhere] = useState<Where>('on_van');
  const [vanId, setVanId] = useState('');
  const [company, setCompany] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setError(null);
    if (typeId === '__new' && !newType.trim()) return setError('Type the name of the new kit type.');
    if (mode === 'page' && where === 'on_van' && !vanId) return setError('Pick the van this kit is on.');
    setSaving(true);
    try {
      let type = kitTypes.find((t) => t.id === typeId);
      if (typeId === '__new') {
        type = await createKitType(newType);
        onTypeCreated?.(type);
      }
      if (!type) throw new Error('Pick a kit type.');
      if (mode === 'audit') {
        onAddLine?.({
          kitTypeId: type.id,
          typeName: type.name,
          plantNo: plantNo.trim() || null,
          serviceDate: serviceDate || null,
          expiryDate: expiry || null,
        });
        return;
      }
      await addKit({
        kitTypeId: type.id,
        plantNo: plantNo.trim() || null,
        serviceDate: serviceDate || null,
        expiryDate: expiry || null,
        status: where,
        vehicleId: where === 'on_van' ? vanId : null,
        serviceCompany: where === 'away_for_service' ? company.trim() || null : null,
        notes: notes.trim() || null,
        isTest: TEST_MODE,
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
      <Field label="Kit type">
        {(id) => (
          <select id={id} className={inputCls} value={typeId} onChange={(e) => setTypeId(e.target.value)}>
            {kitTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            <option value="__new">+ New kit type…</option>
          </select>
        )}
      </Field>
      {typeId === '__new' && (
        <Field label="New kit type name">
          {(id) => <input id={id} className={inputCls} value={newType} onChange={(e) => setNewType(e.target.value)} placeholder="e.g. Water pump" />}
        </Field>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field label="Plant no">{(id) => <input id={id} className={inputCls} value={plantNo} onChange={(e) => setPlantNo(e.target.value)} />}</Field>
        <Field label="Service date">{(id) => <input id={id} type="date" className={inputCls} value={serviceDate} onChange={(e) => setServiceDate(e.target.value)} />}</Field>
        <Field label="Expiry">{(id) => <input id={id} type="date" className={inputCls} value={expiry} onChange={(e) => setExpiry(e.target.value)} />}</Field>
      </div>

      {mode === 'page' && (
        <>
          <fieldset>
            <legend className="block text-xs font-semibold text-slate-600 mb-2">Where is it?</legend>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {([
                ['on_van', 'On a van'],
                ['spare', 'Spare in yard'],
                ['away_for_service', 'Away for service'],
              ] as [Where, string][]).map(([v, l]) => (
                <label key={v} className={`flex items-center gap-2 min-h-[44px] px-3 rounded-lg border cursor-pointer text-sm font-medium ${where === v ? 'border-blue-500 bg-blue-50 text-slate-900' : 'border-slate-200 text-slate-700 hover:bg-slate-50'}`}>
                  <input type="radio" name="where" checked={where === v} onChange={() => setWhere(v)} className="h-4 w-4" />
                  {l}
                </label>
              ))}
            </div>
          </fieldset>
          {where === 'on_van' && (
            <Field label="Van">
              {(id) => (
                <select id={id} className={inputCls} value={vanId} onChange={(e) => setVanId(e.target.value)}>
                  <option value="">Pick a van…</option>
                  {vehicles.map((v) => <option key={v.id} value={v.id}>{v.registration_number}</option>)}
                </select>
              )}
            </Field>
          )}
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
