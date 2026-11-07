import { useState } from 'react';
import { Check, PackagePlus, X, Plus, Search, Ban } from 'lucide-react';
import { ExpiryPill, Field } from './ui';
import { btn, inputCls } from './styles';
import { ServiceExpiryFields } from './ServiceExpiryFields';
import { ServiceExpiryState } from '../../../../lib/siteAuditLogic';

export type SpareOpt = { id: string; plant_no: string | null; expiry_date: string | null; where: string };
export type TakeMode = 'take' | 'leave' | 'new';
export interface TakeState { mode: TakeMode; itemId: string | null; picking: boolean; plant: string; dates: ServiceExpiryState }

const seg = (on: boolean) =>
  `inline-flex items-center justify-center gap-1.5 min-h-[48px] sm:min-h-[44px] px-3 rounded-lg border-2 text-sm font-semibold cursor-pointer transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
    on ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-300 text-slate-800 hover:bg-slate-50'}`;

/**
 * One "Anything missing?" line: the best spare already picked, with Take this one / Pick another /
 * Leave it; the grouped list (Yard Lockup / On spare vans) opens inline; no spares → add a new one.
 */
export function TakeSpareLine({ title, typeName, groups, state, onChange, months, onRemove }: {
  title: string;
  typeName: string;
  groups: { lockup: SpareOpt[]; spareVans: SpareOpt[] };
  state: TakeState;
  onChange: (s: TakeState) => void;
  months: number | null | undefined;
  onRemove?: () => void;
}) {
  const all = [...groups.lockup, ...groups.spareVans];
  const chosen = all.find((o) => o.id === state.itemId) ?? null;
  const none = all.length === 0;
  return (
    <li className="rounded-lg border border-slate-200 bg-white p-3 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-base sm:text-sm font-bold text-slate-900">{title}</p>
        {onRemove && (
          <button type="button" onClick={onRemove} aria-label={`Remove ${typeName}`}
            className="flex-shrink-0 min-w-[44px] min-h-[44px] -m-2 flex items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {none ? (
        <>
          <p className="text-base sm:text-sm text-slate-700">No spare {typeName}s. Add a new one?</p>
          <div className="grid grid-cols-2 gap-2" role="group" aria-label={`${typeName}: what to do`}>
            <button type="button" className={seg(state.mode === 'new')} aria-pressed={state.mode === 'new'} onClick={() => onChange({ ...state, mode: 'new' })}>
              <PackagePlus className="h-4 w-4" aria-hidden="true" />Add a new one
            </button>
            <button type="button" className={seg(state.mode === 'leave')} aria-pressed={state.mode === 'leave'} onClick={() => onChange({ ...state, mode: 'leave' })}>
              <Ban className="h-4 w-4" aria-hidden="true" />Leave it
            </button>
          </div>
          {state.mode === 'new' && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label="Plant no">{(id) => <input id={id} className={inputCls} value={state.plant} autoCapitalize="characters" onChange={(e) => onChange({ ...state, plant: e.target.value })} />}</Field>
              <ServiceExpiryFields state={state.dates} onChange={(d) => onChange({ ...state, dates: d })} months={months} />
            </div>
          )}
        </>
      ) : (
        <>
          {chosen ? (
            <div className={`flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 ${state.mode === 'take' ? 'border-blue-200 bg-blue-50' : 'border-slate-200 bg-slate-50'}`}>
              {state.mode === 'take' && <Check className="h-4 w-4 text-blue-700" aria-hidden="true" strokeWidth={3} />}
              <span className="text-base sm:text-sm font-semibold text-slate-900">{chosen.plant_no || 'No plant no'}</span>
              <span className="text-sm text-slate-700">{chosen.where}</span>
              <ExpiryPill expiry={chosen.expiry_date} />
            </div>
          ) : (
            <p className="text-base sm:text-sm text-amber-800 font-semibold">Nothing in date. Pick one, or leave it.</p>
          )}
          <div className="grid grid-cols-3 gap-2" role="group" aria-label={`${typeName}: what to do`}>
            <button type="button" className={seg(state.mode === 'take' && !state.picking)} aria-pressed={state.mode === 'take' && !state.picking} disabled={!chosen}
              onClick={() => onChange({ ...state, mode: 'take', picking: false })}>
              <Check className="h-4 w-4" aria-hidden="true" />Take this one
            </button>
            <button type="button" className={seg(state.picking)} aria-pressed={state.picking} aria-expanded={state.picking}
              onClick={() => onChange({ ...state, picking: !state.picking })}>
              <Search className="h-4 w-4" aria-hidden="true" />Pick another
            </button>
            <button type="button" className={seg(state.mode === 'leave' && !state.picking)} aria-pressed={state.mode === 'leave' && !state.picking}
              onClick={() => onChange({ ...state, mode: 'leave', picking: false })}>
              <Ban className="h-4 w-4" aria-hidden="true" />Leave it
            </button>
          </div>
          {state.picking && (
            <fieldset className="space-y-2">
              <legend className="sr-only">Pick a spare {typeName}</legend>
              {([['Yard Lockup', groups.lockup], ['On spare vans', groups.spareVans]] as const).map(([g, list]) => (
                <div key={g} className="space-y-2">
                  <p className="text-xs font-bold text-slate-600 uppercase tracking-wider">{g}</p>
                  {list.length === 0 && <p className="text-sm text-slate-600">None.</p>}
                  {list.map((o) => (
                    <label key={o.id} className={`flex items-center gap-3 min-h-[48px] px-3 rounded-lg border cursor-pointer ${state.itemId === o.id ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:bg-slate-50'}`}>
                      <input type="radio" name={`take-${typeName}`} checked={state.itemId === o.id} className="h-4 w-4"
                        onChange={() => onChange({ ...state, mode: 'take', itemId: o.id, picking: false })} />
                      <span className="flex-1 flex flex-wrap items-center gap-2">
                        <span className="text-base sm:text-sm font-semibold text-slate-900">{o.plant_no || 'No plant no'}</span>
                        <span className="text-xs text-slate-600">{o.where}</span>
                        <ExpiryPill expiry={o.expiry_date} />
                      </span>
                    </label>
                  ))}
                </div>
              ))}
            </fieldset>
          )}
        </>
      )}
    </li>
  );
}

/** "Take a spare" for any other kit type: choose the type, then the same line appears. */
export function TakeOtherButton({ types, onPick }: { types: { id: string; name: string }[]; onPick: (typeId: string) => void }) {
  const [open, setOpen] = useState(false);
  if (!types.length) return null;
  return open ? (
    <Field label="Which kit type?">
      {(id) => (
        <select id={id} className={inputCls} defaultValue="" onChange={(e) => { if (e.target.value) { onPick(e.target.value); setOpen(false); } }}>
          <option value="" disabled>Choose a kit type…</option>
          {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      )}
    </Field>
  ) : (
    <button type="button" className={`${btn.secondary} w-full sm:w-auto`} onClick={() => setOpen(true)}>
      <Plus className="h-4 w-4" aria-hidden="true" />Take a spare
    </button>
  );
}
