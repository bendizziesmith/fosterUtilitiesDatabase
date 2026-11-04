import { useState } from 'react';
import { Paperclip } from 'lucide-react';
import { Sheet, Field, ErrorNote, ExpiryPill } from './ui';
import { btn, inputCls } from './styles';
import { updateAttentionItem, uploadAuditFile } from '../../../../lib/siteAuditService';
import { todayISO } from '../../../../lib/siteAuditLogic';

export interface UpdateTarget {
  source: 'kit' | 'ppe';
  itemId: string;
  itemName: string;
  plantNo: string | null;
  where: string;
  serviceDate: string | null;
  expiryDate: string | null;
  /** kit on a van can be swapped from here */
  canSwap: boolean;
}

type What = 'reserviced' | 'replaced' | 'swap';

export function UpdateItemSheet({
  target,
  onClose,
  onSaved,
  onSwap,
}: {
  target: UpdateTarget;
  onClose: () => void;
  onSaved: () => void;
  onSwap?: () => void;
}) {
  const isPpe = target.source === 'ppe';
  const [what, setWhat] = useState<What>(isPpe ? 'replaced' : 'reserviced');
  const [serviceDate, setServiceDate] = useState(todayISO());
  const [expiry, setExpiry] = useState('');
  const [plantNo, setPlantNo] = useState(target.plantNo ?? '');
  const [note, setNote] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const options: { value: What; label: string; hint: string }[] = isPpe
    ? [{ value: 'replaced', label: 'Replaced with new', hint: 'New PPE issued, enter the new expiry' }]
    : [
        { value: 'reserviced', label: 'Re-serviced', hint: 'Same item, new service and expiry dates' },
        { value: 'replaced', label: 'Replaced with new', hint: 'Change the plant no if it differs' },
        ...(target.canSwap && onSwap
          ? [{ value: 'swap' as What, label: 'Swap with a spare', hint: 'Take it off the van and put another on' }]
          : []),
      ];

  const save = async () => {
    if (what === 'swap') {
      onSwap?.();
      return;
    }
    if (!expiry) {
      setError('Enter the new expiry date.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const certificatePath = file ? await uploadAuditFile(file, 'certificates') : null;
      await updateAttentionItem({
        source: target.source,
        itemId: target.itemId,
        action: what,
        serviceDate: isPpe ? null : serviceDate || null,
        expiryDate: expiry,
        plantNo: isPpe ? null : plantNo.trim() || null,
        certificatePath,
        note: note.trim() || null,
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
            {what === 'swap' ? 'Next: swap' : saving ? 'Saving…' : 'Save update'}
          </button>
        </>
      }
    >
      <div className="flex items-center gap-2 text-xs text-slate-600">
        <span>Current expiry:</span>
        <ExpiryPill expiry={target.expiryDate} />
      </div>

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
                <span className="block text-sm font-semibold text-slate-900">{o.label}</span>
                <span className="block text-xs text-slate-600">{o.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {what !== 'swap' && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {!isPpe && (
              <Field label="Service date">
                {(id) => <input id={id} type="date" className={inputCls} value={serviceDate} onChange={(e) => setServiceDate(e.target.value)} />}
              </Field>
            )}
            <Field label="New expiry date">
              {(id) => <input id={id} type="date" className={inputCls} value={expiry} onChange={(e) => setExpiry(e.target.value)} required />}
            </Field>
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
