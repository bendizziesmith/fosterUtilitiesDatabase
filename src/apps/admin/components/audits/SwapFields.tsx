import { ArrowRight } from 'lucide-react';
import { Field, ExpiryPill } from './ui';
import { inputCls } from './styles';
import { TargetPicker } from './TargetPicker';
import { ServiceExpiryFields } from './ServiceExpiryFields';
import type { Dest, SwapForm } from './useSwapForm';

const radio = (checked: boolean) =>
  `flex items-start gap-3 min-h-[44px] p-3 rounded-lg border cursor-pointer ${checked ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:bg-slate-50'}`;

export function ReplacementFields({ f, months, title }: { f: SwapForm; months: number | null | undefined; title: string }) {
  return (
    <fieldset>
      <legend className="text-sm font-bold text-slate-900 mb-2">{title}</legend>
      {f.spares === null ? (
        <p className="text-sm text-slate-500">Looking for spares…</p>
      ) : (
        <div className="space-y-2">
          {f.spares.length === 0 && <p className="text-xs text-slate-600">No spare {f.item.type_name} in the yard.</p>}
          {f.spares.map((s) => (
            <label key={s.id} className={radio(f.repl === s.id)}>
              <input type="radio" name="repl" checked={f.repl === s.id} onChange={() => f.setRepl(s.id)} className="mt-1 h-4 w-4" />
              <span className="flex-1 flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-slate-900">{s.plant_no || 'No plant no'}</span>
                <span className="text-xs text-slate-600">Spare · expiry {s.expiry_date ?? 'N/A'}</span>
                <ExpiryPill expiry={s.expiry_date} />
              </span>
            </label>
          ))}
          <label className={radio(f.repl === 'new')}>
            <input type="radio" name="repl" checked={f.repl === 'new'} onChange={() => f.setRepl('new')} className="mt-1 h-4 w-4" />
            <span className="text-sm font-semibold text-slate-900">+ Add a new {f.item.type_name}</span>
          </label>
          {f.repl === 'new' && (
            <div className="ml-7 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label="Plant no">{(id) => <input id={id} className={inputCls} value={f.newPlant} onChange={(e) => f.setNewPlant(e.target.value)} />}</Field>
              <ServiceExpiryFields state={f.dates} onChange={f.setDates} months={months} />
            </div>
          )}
          <label className={radio(f.repl === 'none')}>
            <input type="radio" name="repl" checked={f.repl === 'none'} onChange={() => f.setRepl('none')} className="mt-1 h-4 w-4" />
            <span className="text-sm font-semibold text-slate-900">Nothing for now</span>
          </label>
        </div>
      )}
    </fieldset>
  );
}

export function DestinationFields({ f, title }: { f: SwapForm; title: string }) {
  const options: { value: Dest; label: string }[] = [
    { value: 'away_for_service', label: 'Away for service' },
    { value: 'spare', label: 'Back to yard as spare' },
    { value: 'on_van', label: 'Another van' },
    { value: 'removed', label: 'Scrapped / remove' },
  ];
  return (
    <fieldset>
      <legend className="text-sm font-bold text-slate-900 mb-2">{title}</legend>
      <div className="space-y-2">
        {options.map((o) => (
          <div key={o.value}>
            <label className={radio(f.dest === o.value)}>
              <input type="radio" name="dest" checked={f.dest === o.value} onChange={() => f.setDest(o.value)} className="mt-1 h-4 w-4" />
              <span className="text-sm font-semibold text-slate-900">{o.label}</span>
            </label>
            {f.dest === 'away_for_service' && o.value === 'away_for_service' && (
              <Field label="Service company (optional)" className="mt-2 ml-7">
                {(id) => <input id={id} className={inputCls} value={f.company} onChange={(e) => f.setCompany(e.target.value)} />}
              </Field>
            )}
            {f.dest === 'on_van' && o.value === 'on_van' && (
              <div className="mt-2 ml-7">
                <TargetPicker label="Which van?" targets={f.targets} value={f.destKey} onChange={f.setDestKey} vansOnly excludeVehicleId={f.item.vehicle_id} />
              </div>
            )}
          </div>
        ))}
      </div>
    </fieldset>
  );
}

export function SwapNoteAndPreview({ f }: { f: SwapForm }) {
  return (
    <>
      <Field label="Note (optional)">
        {(id) => <textarea id={id} rows={2} className={`${inputCls} py-2`} value={f.note} onChange={(e) => f.setNote(e.target.value)} />}
      </Field>
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3" aria-live="polite">
        <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">Result</p>
        <p className="flex items-center gap-2 text-sm text-slate-800"><ArrowRight className="h-4 w-4 text-slate-400 flex-shrink-0" />{f.preview.outgoing}</p>
        <p className="flex items-center gap-2 text-sm text-slate-800 mt-1"><ArrowRight className="h-4 w-4 text-slate-400 flex-shrink-0" />{f.preview.incoming}</p>
      </div>
    </>
  );
}
