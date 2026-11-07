import React, { useId, useMemo, useRef, useState } from 'react';
import { Search, X, Users, Truck } from 'lucide-react';
import { searchTargets, AuditTarget } from '../../../../lib/siteAuditLogic';

/**
 * Searchable picker for a gang or van: type a ganger's name or a reg. Gangs
 * first, then other vans. Results list sits in the page flow (not a floating
 * popup) so it works inside bottom sheets on a phone. Rows are 44px+.
 */
export function TargetPicker({
  label,
  targets,
  value,
  onChange,
  vansOnly = false,
  excludeVehicleId,
  placeholder = 'Type a name or a reg…',
  disabled,
}: {
  label: string;
  targets: AuditTarget[];
  value: string;
  onChange: (key: string) => void;
  vansOnly?: boolean;
  excludeVehicleId?: string | null;
  placeholder?: string;
  disabled?: boolean;
}) {
  const id = useId();
  const listId = `${id}-list`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const selected = targets.find((t) => t.key === value);
  const results = useMemo(
    () => searchTargets(targets, query, { vansOnly }).filter((t) => !excludeVehicleId || t.vehicleId !== excludeVehicleId),
    [targets, query, vansOnly, excludeVehicleId]
  );

  const pick = (t: AuditTarget) => {
    // let go of the search box first: it's about to be removed, and a removed box sends no "focus left"
    // signal, so the phone keyboard (and the hidden sheet buttons) would stay stuck (7 Nov 2026)
    inputRef.current?.blur();
    onChange(t.key);
    setQuery('');
    setOpen(false);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter' && open && results[active]) {
      e.preventDefault();
      pick(results[active]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const firstStaff = results.findIndex((t) => t.kind === 'person' && !t.isGanger);
  const firstVan = results.findIndex((t) => t.kind === 'spare_van');
  const header = (text: string) => (
    <li role="presentation" className="px-3 pt-2 pb-1 text-xs font-bold text-slate-600 uppercase tracking-wider bg-slate-50">{text}</li>
  );

  return (
    <div>
      <label htmlFor={id} className="block text-xs font-semibold text-slate-600 mb-1">{label}</label>
      {selected && !open ? (
        <div className="flex gap-2">
          <button
            type="button"
            id={id}
            disabled={disabled}
            onClick={() => {
              setOpen(true);
              setActive(0);
              setTimeout(() => inputRef.current?.focus(), 0);
            }}
            className="flex-1 min-h-[44px] px-3 rounded-lg border border-slate-300 bg-white text-left text-base sm:text-sm font-semibold text-slate-900 flex items-center gap-2 cursor-pointer hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {selected.kind === 'person' ? <Users className="h-4 w-4 text-slate-600" /> : <Truck className="h-4 w-4 text-slate-600" />}
            <span className="truncate">{selected.label}</span>
            <span className="ml-auto text-xs font-medium text-blue-700">Change</span>
          </button>
        </div>
      ) : (
        <>
          <div className="relative">
            <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
            <input
              ref={inputRef}
              id={id}
              role="combobox"
              aria-expanded={open}
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={open && results[active] ? `${listId}-${active}` : undefined}
              autoComplete="off"
              disabled={disabled}
              value={query}
              placeholder={placeholder}
              onFocus={() => setOpen(true)}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
                setOpen(true);
              }}
              onKeyDown={onKey}
              className="w-full min-h-[48px] sm:min-h-[44px] pl-9 pr-10 rounded-lg border border-slate-300 bg-white text-base sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {(query || selected) && (
              <button
                type="button"
                aria-label="Close search"
                onClick={() => {
                  setQuery('');
                  setOpen(false);
                }}
                className="absolute right-1 top-1/2 -translate-y-1/2 p-2.5 rounded-lg text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          {open && (
            <ul id={listId} role="listbox" aria-label={label} className="mt-1 max-h-72 overflow-y-auto overscroll-contain rounded-lg border border-slate-200 bg-white divide-y divide-slate-100">
              {results.length === 0 && <li className="px-3 py-3 text-sm text-slate-600">No one matches “{query}”.</li>}
              {results.map((t, i) => (
                <React.Fragment key={t.key}>
                  {i === 0 && t.isGanger && header('Gangers')}
                  {i === firstStaff && header('Other staff')}
                  {i === firstVan && header('Spare vans')}
                  <li
                    id={`${listId}-${i}`}
                    role="option"
                    aria-selected={t.key === value}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pick(t)}
                    onMouseEnter={() => setActive(i)}
                    className={`min-h-[44px] px-3 flex items-center gap-2 text-sm cursor-pointer ${i === active ? 'bg-blue-50 text-slate-900' : 'text-slate-800'} ${t.key === value ? 'font-semibold' : ''}`}
                  >
                    {t.kind === 'person' ? <Users className="h-4 w-4 text-slate-400 flex-shrink-0" /> : <Truck className="h-4 w-4 text-slate-400 flex-shrink-0" />}
                    {t.label}
                  </li>
                </React.Fragment>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
