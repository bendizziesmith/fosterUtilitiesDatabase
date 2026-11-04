import { useEffect, useMemo, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { Sheet, Field, ErrorNote, ExpiryPill } from './ui';
import { btn, inputCls } from './styles';
import { listKit, swapKit, VanRow } from '../../../../lib/siteAuditService';
import { previewSwap, todayISO, SwapDestination, SwapReplacement } from '../../../../lib/siteAuditLogic';
import { KitItemOverview } from '../../../../lib/supabase';

type Dest = 'away_for_service' | 'spare' | 'on_van' | 'removed';

export function SwapKitSheet({
  item,
  vehicles,
  onClose,
  onSaved,
}: {
  item: Pick<KitItemOverview, 'id' | 'kit_type_id' | 'type_name' | 'plant_no' | 'vehicle_id' | 'vehicle_reg'>;
  vehicles: VanRow[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [spares, setSpares] = useState<KitItemOverview[] | null>(null);
  const [dest, setDest] = useState<Dest>('away_for_service');
  const [company, setCompany] = useState('');
  const [destVan, setDestVan] = useState('');
  const [repl, setRepl] = useState<string>(''); // spare id | 'new' | 'none'
  const [newPlant, setNewPlant] = useState('');
  const [newService, setNewService] = useState(todayISO());
  const [newExpiry, setNewExpiry] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listKit()
      .then((all) => {
        const s = all.filter((k) => k.status === 'spare' && k.kit_type_id === item.kit_type_id);
        setSpares(s);
        setRepl(s.length ? s[0].id : 'new');
      })
      .catch((e) => setError(e.message));
  }, [item.kit_type_id]);

  const otherVans = vehicles.filter((v) => v.id !== item.vehicle_id);
  const label = item.plant_no || item.type_name;

  const preview = useMemo(() => {
    const d: SwapDestination =
      dest === 'away_for_service'
        ? { destination: dest, serviceCompany: company }
        : dest === 'on_van'
          ? { destination: dest, vanReg: otherVans.find((v) => v.id === destVan)?.registration_number ?? 'another van' }
          : { destination: dest };
    const spare = spares?.find((s) => s.id === repl);
    const r: SwapReplacement = spare
      ? { mode: 'spare', plantNo: spare.plant_no }
      : repl === 'new'
        ? { mode: 'new', plantNo: newPlant.trim() || null }
        : { mode: 'none' };
    return previewSwap({ plant_no: item.plant_no, type_name: item.type_name, vehicle_reg: item.vehicle_reg }, d, r);
  }, [dest, company, destVan, repl, newPlant, spares, item, otherVans]);

  const save = async () => {
    if (dest === 'on_van' && !destVan) return setError('Pick the van it is going to.');
    if (!repl) return setError('Choose what goes on the van instead.');
    setSaving(true);
    setError(null);
    try {
      const isSpare = repl !== 'new' && repl !== 'none';
      await swapKit({
        itemId: item.id,
        destination: dest,
        destVehicleId: dest === 'on_van' ? destVan : null,
        serviceCompany: dest === 'away_for_service' ? company.trim() || null : null,
        replacement: isSpare ? 'spare' : (repl as 'new' | 'none'),
        spareId: isSpare ? repl : null,
        newPlantNo: repl === 'new' ? newPlant.trim() || null : null,
        newServiceDate: repl === 'new' ? newService || null : null,
        newExpiryDate: repl === 'new' ? newExpiry || null : null,
        note: note.trim() || null,
      });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the swap.');
      setSaving(false);
    }
  };

  const radio = (checked: boolean) =>
    `flex items-start gap-3 min-h-[44px] p-3 rounded-lg border cursor-pointer ${checked ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:bg-slate-50'}`;

  const destOptions: { value: Dest; label: string }[] = [
    { value: 'away_for_service', label: 'Away for service' },
    { value: 'spare', label: 'Back to yard as spare' },
    { value: 'on_van', label: 'Another van' },
    { value: 'removed', label: 'Scrapped / remove' },
  ];

  return (
    <Sheet
      title={`Swap ${item.type_name}`}
      subtitle={`${label} · ${item.vehicle_reg ?? ''}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className={btn.secondary} onClick={onClose}>Cancel</button>
          <button type="button" className={btn.primary} onClick={save} disabled={saving || spares === null}>
            {saving ? 'Saving…' : 'Save swap'}
          </button>
        </>
      }
    >
      <fieldset>
        <legend className="text-sm font-bold text-slate-900 mb-2">1. Where is {label} going?</legend>
        <div className="space-y-2">
          {destOptions.map((o) => (
            <div key={o.value}>
              <label className={radio(dest === o.value)}>
                <input type="radio" name="dest" checked={dest === o.value} onChange={() => setDest(o.value)} className="mt-1 h-4 w-4" />
                <span className="text-sm font-semibold text-slate-900">{o.label}</span>
              </label>
              {dest === 'away_for_service' && o.value === 'away_for_service' && (
                <Field label="Service company (optional)" className="mt-2 ml-7">
                  {(id) => <input id={id} className={inputCls} value={company} onChange={(e) => setCompany(e.target.value)} />}
                </Field>
              )}
              {dest === 'on_van' && o.value === 'on_van' && (
                <Field label="Which van?" className="mt-2 ml-7">
                  {(id) => (
                    <select id={id} className={inputCls} value={destVan} onChange={(e) => setDestVan(e.target.value)}>
                      <option value="">Pick a van…</option>
                      {otherVans.map((v) => <option key={v.id} value={v.id}>{v.registration_number}</option>)}
                    </select>
                  )}
                </Field>
              )}
            </div>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-sm font-bold text-slate-900 mb-2">2. What goes on the van instead?</legend>
        {spares === null ? (
          <p className="text-sm text-slate-500">Looking for spares…</p>
        ) : (
          <div className="space-y-2">
            {spares.length === 0 && (
              <p className="text-xs text-slate-600">No spare {item.type_name} in the yard.</p>
            )}
            {spares.map((s) => (
              <label key={s.id} className={radio(repl === s.id)}>
                <input type="radio" name="repl" checked={repl === s.id} onChange={() => setRepl(s.id)} className="mt-1 h-4 w-4" />
                <span className="flex-1 flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-slate-900">{s.plant_no || 'No plant no'}</span>
                  <span className="text-xs text-slate-600">Spare · expiry {s.expiry_date ?? 'N/A'}</span>
                  <ExpiryPill expiry={s.expiry_date} />
                </span>
              </label>
            ))}
            <label className={radio(repl === 'new')}>
              <input type="radio" name="repl" checked={repl === 'new'} onChange={() => setRepl('new')} className="mt-1 h-4 w-4" />
              <span className="text-sm font-semibold text-slate-900">+ Add a new {item.type_name}</span>
            </label>
            {repl === 'new' && (
              <div className="ml-7 grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Field label="Plant no">{(id) => <input id={id} className={inputCls} value={newPlant} onChange={(e) => setNewPlant(e.target.value)} />}</Field>
                <Field label="Service date">{(id) => <input id={id} type="date" className={inputCls} value={newService} onChange={(e) => setNewService(e.target.value)} />}</Field>
                <Field label="Expiry">{(id) => <input id={id} type="date" className={inputCls} value={newExpiry} onChange={(e) => setNewExpiry(e.target.value)} />}</Field>
              </div>
            )}
            <label className={radio(repl === 'none')}>
              <input type="radio" name="repl" checked={repl === 'none'} onChange={() => setRepl('none')} className="mt-1 h-4 w-4" />
              <span className="text-sm font-semibold text-slate-900">Nothing for now</span>
            </label>
          </div>
        )}
      </fieldset>

      <Field label="Note (optional)">
        {(id) => <textarea id={id} rows={2} className={`${inputCls} py-2`} value={note} onChange={(e) => setNote(e.target.value)} />}
      </Field>

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3" aria-live="polite">
        <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">Result</p>
        <p className="flex items-center gap-2 text-sm text-slate-800"><ArrowRight className="h-4 w-4 text-slate-400 flex-shrink-0" />{preview.outgoing}</p>
        <p className="flex items-center gap-2 text-sm text-slate-800 mt-1"><ArrowRight className="h-4 w-4 text-slate-400 flex-shrink-0" />{preview.incoming}</p>
      </div>
      <ErrorNote message={error} />
    </Sheet>
  );
}
