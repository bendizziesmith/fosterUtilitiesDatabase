import { useEffect, useRef, useState } from 'react';
import { Paperclip } from 'lucide-react';
import { Sheet, Field, ErrorNote, ExpiryPill } from './ui';
import { btn, inputCls } from './styles';
import { updateAttentionItem, uploadAuditFile } from '../../../../lib/siteAuditService';
import { todayISO, autoExpiry, applyExpiry, AuditTarget, ServiceExpiryState } from '../../../../lib/siteAuditLogic';
import { ServiceExpiryFields } from './ServiceExpiryFields';
import { DestinationFields, ReplacementFields, SwapNoteAndPreview } from './SwapFields';
import { useSwapForm, SwapItem } from './useSwapForm';
import { ActorPicker } from './ActorPicker';
import { useActor } from './useActor';
import { Auditor } from '../../../../lib/supabase';

export interface UpdateTarget {
  source: 'kit' | 'ppe';
  itemId: string;
  itemName: string;
  plantNo: string | null;
  where: string;
  serviceDate: string | null;
  expiryDate: string | null;
  /** kit on a van: can be swapped with a spare from here */
  swapItem?: SwapItem | null;
  /** service interval in months (kit type, or Hard hats 36) */
  months?: number | null;
  /** label of the date the interval counts from, e.g. "Date on hat" */
  dateLabel?: string | null;
}

type What = 'reserviced' | 'replaced' | 'swap';

export function UpdateItemSheet({
  target,
  targets,
  auditors,
  onClose,
  onSaved,
}: {
  target: UpdateTarget;
  targets: AuditTarget[];
  auditors: Auditor[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isPpe = target.source === 'ppe';
  const months = target.months ?? null;
  const [what, setWhat] = useState<What>(isPpe ? 'replaced' : 'reserviced');
  const startDate = isPpe ? null : todayISO();
  const [dates, setDates] = useState<ServiceExpiryState>({
    serviceDate: startDate,
    expiry: autoExpiry(startDate, months),
    expiryManual: false,
  });
  const [plantNo, setPlantNo] = useState(target.plantNo ?? '');
  const [note, setNote] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const swapSave = useRef<((actorId: string | null) => Promise<void>) | null>(null);
  const { actorId, setActorId } = useActor(auditors);

  const options: { value: What; label: string; hint: string }[] = isPpe
    ? [{ value: 'replaced', label: 'Replaced with new', hint: 'New PPE issued, enter the new expiry' }]
    : [
        { value: 'reserviced', label: 'Re-serviced', hint: 'Same item, new service and expiry dates' },
        { value: 'replaced', label: 'Replaced with new', hint: 'Change the plant no if it differs' },
        ...(target.swapItem
          ? [{ value: 'swap' as What, label: 'Swap with one from Yard Lockup', hint: 'Pick one from the Yard Lockup (or add a new one), then say where this one goes' }]
          : []),
      ];

  const save = async () => {
    setError(null);
    if (!actorId) {
      setError('Pick who’s doing this.');
      return;
    }
    if (what === 'swap') {
      setSaving(true);
      try {
        await swapSave.current?.(actorId);
        onSaved();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not save the swap.');
        setSaving(false);
      }
      return;
    }
    if (!dates.expiry) {
      setError('Enter the new expiry date.');
      return;
    }
    setSaving(true);
    try {
      const certificatePath = file ? await uploadAuditFile(file, 'certificates') : null;
      const hatNote = isPpe && dates.serviceDate && target.dateLabel ? `${target.dateLabel}: ${dates.serviceDate}` : null;
      await updateAttentionItem({
        source: target.source,
        itemId: target.itemId,
        action: what,
        serviceDate: isPpe ? null : dates.serviceDate,
        expiryDate: dates.expiry,
        plantNo: isPpe ? null : plantNo.trim() || null,
        certificatePath,
        note: [hatNote, note.trim()].filter(Boolean).join(' · ') || null,
        actorId,
      });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the update.');
      setSaving(false);
    }
  };

  return (
    <Sheet
      title={`Update ${target.itemName}`}
      subtitle={[target.plantNo, target.where].filter(Boolean).join(' · ')}
      onClose={onClose}
      footer={
        <>
          <button type="button" className={btn.secondary} onClick={onClose}>Cancel</button>
          <button type="button" className={btn.primary} onClick={save} disabled={saving}>
            {saving ? 'Saving…' : what === 'swap' ? 'Save swap' : 'Save update'}
          </button>
        </>
      }
    >
      <div className="flex items-center gap-2 text-xs text-slate-600">
        <span>Current expiry:</span>
        <ExpiryPill expiry={target.expiryDate} />
      </div>

      <ActorPicker auditors={auditors} value={actorId} onChange={setActorId} />

      <fieldset>
        <legend className="block text-xs font-semibold text-slate-600 mb-2">What happened?</legend>
        <div className="space-y-2">
          {options.map((o) => (
            <label
              key={o.value}
              className={`flex items-start gap-3 min-h-[44px] p-3 rounded-lg border cursor-pointer ${what === o.value ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:bg-slate-50'}`}
            >
              <input type="radio" name="what" value={o.value} checked={what === o.value} onChange={() => setWhat(o.value)} className="mt-1 h-4 w-4" />
              <span>
                <span className="block text-base sm:text-sm font-semibold text-slate-900">{o.label}</span>
                <span className="block text-xs text-slate-600">{o.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {what === 'swap' && target.swapItem ? (
        <InlineSwap item={target.swapItem} targets={targets} months={months} register={(fn) => (swapSave.current = fn)} />
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {isPpe && !months ? (
              <Field label="New expiry date">
                {(id) => <input id={id} type="date" className={inputCls} value={dates.expiry ?? ''} onChange={(e) => setDates(applyExpiry(dates, e.target.value || null))} />}
              </Field>
            ) : (
              <ServiceExpiryFields state={dates} onChange={setDates} months={months}
                serviceLabel={target.dateLabel ?? 'Service date'} expiryLabel="New expiry date" />
            )}
          </div>
          {!isPpe && (
            <Field label="Plant no" hint={what === 'replaced' ? 'Change it if the new item has a different number' : undefined}>
              {(id) => <input id={id} className={inputCls} value={plantNo} onChange={(e) => setPlantNo(e.target.value)} />}
            </Field>
          )}
          <Field label="Certificate or photo (optional)">
            {(id) => (
              <label htmlFor={id} className={`${btn.secondary} w-full`}>
                <Paperclip className="h-4 w-4" />
                <span className="truncate">{file ? file.name : 'Attach file'}</span>
                <input id={id} type="file" accept="image/*,application/pdf" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              </label>
            )}
          </Field>
          <Field label="Note (optional)">
            {(id) => <textarea id={id} rows={2} className={`${inputCls} py-2`} value={note} onChange={(e) => setNote(e.target.value)} />}
          </Field>
        </>
      )}
      <ErrorNote message={error} />
    </Sheet>
  );
}

/** Update → "Swap with a spare": pick the replacement first, then where the old one goes. */
function InlineSwap({ item, targets, months, register }: {
  item: SwapItem;
  targets: AuditTarget[];
  months: number | null;
  register: (fn: (actorId: string | null) => Promise<void>) => void;
}) {
  const f = useSwapForm(item, targets);
  useEffect(() => register(f.save), [f.save, register]);
  const label = item.plant_no || item.type_name;
  return (
    <>
      <ReplacementFields f={f} months={months} title={`${item.type_name} in the Yard Lockup`} />
      <DestinationFields f={f} title={`Where does ${label} go?`} />
      <SwapNoteAndPreview f={f} />
      <ErrorNote message={f.loadError} />
    </>
  );
}
