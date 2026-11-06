import { useCallback, useEffect, useMemo, useState } from 'react';
import { Minus, Plus, Search, ChevronDown, Send } from 'lucide-react';
import { LoadingSpinner } from '../../../../components/LoadingSpinner';
import { listLockup, adjustLockupChecked, setLockupNote, setLockupLowAt, LockupRow } from '../../../../lib/lockupService';
import { LOCKUP_SECTIONS, LockupSection, LockupSort, sortLockup, isLowStock } from '../../../../lib/lockupLogic';
import { Auditor, KitItemOverview } from '../../../../lib/supabase';
import { AuditTarget } from '../../../../lib/siteAuditLogic';
import { ActorPicker } from './ActorPicker';
import { useActor } from './useActor';
import { IssueSheet } from './LockupSheets';
import { ExpiryPill, ErrorNote, Field, Sheet, TestTag } from './ui';
import { btn, card, inputCls, formatDate } from './styles';

type SectionKey = LockupSection | 'kit';

/**
 * Yard Lockup: everything in the lockup, in audit-sheet order
 * (PPE → Health & safety → Kit → Other). Stock lines are counted; Kit is the
 * plant-numbered items whose status is Yard Lockup.
 */
export function LockupView({ auditors, people, plantKit, onPlantAction }: {
  auditors: Auditor[];
  /** people kit can be issued to: gangers first, then other staff */
  people: AuditTarget[];
  /** kit_items with status 'spare' */
  plantKit: KitItemOverview[];
  onPlantAction: (k: KitItemOverview, action: 'update' | 'assign' | 'delete') => void;
}) {
  const [lines, setLines] = useState<LockupRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<LockupSort>('sheet');
  const [closed, setClosed] = useState<Set<SectionKey>>(new Set());
  const [lowOnly, setLowOnly] = useState(false);
  const [busyLine, setBusyLine] = useState<string | null>(null);
  /** a count changed before "Who's doing this?" was picked: ask, then do it */
  const [asking, setAsking] = useState<{ line: LockupRow; delta: number } | null>(null);
  const [issuing, setIssuing] = useState<LockupRow | null>(null);
  const { actorId, setActorId } = useActor(auditors);

  const load = useCallback(async () => {
    try {
      setLines(await listLockup());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the Yard Lockup.');
      setLines([]);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const term = q.trim().toLowerCase();
  const lowCount = (lines ?? []).filter((l) => isLowStock(l.quantity, l.low_at)).length;
  const shown = useMemo(
    () => sortLockup(
      (lines ?? []).filter((l) => (!lowOnly || isLowStock(l.quantity, l.low_at)) && (!term || [l.name, l.note].some((v) => v?.toLowerCase().includes(term)))),
      sort
    ),
    [lines, term, sort, lowOnly]
  );
  const kitShown = useMemo(() => {
    if (lowOnly) return [];
    const f = plantKit.filter((k) => !term || [k.type_name, k.plant_no].some((v) => v?.toLowerCase().includes(term)));
    return [...f].sort((a, b) => a.type_sort - b.type_sort || (a.plant_no ?? '').localeCompare(b.plant_no ?? '', undefined, { numeric: true }));
  }, [plantKit, term, lowOnly]);

  const count = (s: SectionKey) => (s === 'kit' ? kitShown.length : shown.filter((l) => l.section === s).length);
  const toggle = (s: SectionKey) => setClosed((c) => {
    const n = new Set(c);
    if (n.has(s)) n.delete(s); else n.add(s);
    return n;
  });
  const jump = (s: SectionKey) => {
    setClosed((c) => { const n = new Set(c); n.delete(s); return n; });
    document.getElementById(`lockup-${s}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const bump = async (l: LockupRow, delta: number, who: string | null = actorId) => {
    setError(null);
    if (!who) return setAsking({ line: l, delta });
    setBusyLine(l.id);
    try {
      const qty = await adjustLockupChecked(l, delta, who);
      setLines((ls) => (ls ?? []).map((x) => (x.id === l.id ? { ...x, quantity: qty } : x)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not change the count.');
    } finally {
      setBusyLine(null);
    }
  };

  const saveLowAt = async (l: LockupRow, raw: string) => {
    const v = raw.trim() === '' ? null : Number(raw);
    if (v === (l.low_at ?? null)) return;
    setError(null);
    try {
      await setLockupLowAt(l.id, v);
      setLines((ls) => (ls ?? []).map((x) => (x.id === l.id ? { ...x, low_at: v } : x)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save “Low at”.');
    }
  };

  const saveNote = async (l: LockupRow, note: string) => {
    if ((l.note ?? '') === note.trim()) return;
    try {
      await setLockupNote(l.id, note);
      setLines((ls) => (ls ?? []).map((x) => (x.id === l.id ? { ...x, note: note.trim() || null } : x)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the note.');
    }
  };

  if (lines === null) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      <ErrorNote message={error} />
      {flash && <p role="status" className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">{flash}</p>}

      {/* sticky: section chips + search + sort */}
      <div className="sticky top-0 z-30 -mx-4 sm:mx-0 px-4 sm:px-0 py-2 bg-slate-50/95 backdrop-blur border-b border-slate-200 sm:border-0 space-y-2">
        <nav aria-label="Lockup sections" className="flex gap-2 overflow-x-auto pb-1">
          {LOCKUP_SECTIONS.map((s) => (
            <button key={s.key} type="button" onClick={() => jump(s.key)}
              className="flex-shrink-0 min-h-[44px] px-4 rounded-full border border-slate-300 bg-white text-sm font-semibold text-slate-800 hover:bg-slate-100 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
              {s.title} <span className="text-slate-600 font-normal">{count(s.key)}</span>
            </button>
          ))}
          <button type="button" aria-pressed={lowOnly} onClick={() => setLowOnly(!lowOnly)}
            className={`flex-shrink-0 min-h-[44px] px-4 rounded-full border text-sm font-semibold cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ${lowOnly ? 'bg-amber-700 border-amber-700 text-white' : 'bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100'}`}>
            Low stock ({lowCount})
          </button>
        </nav>
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_14rem] gap-2">
          <div className="relative">
            <label htmlFor="lockup-search" className="sr-only">Search the Yard Lockup</label>
            <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
            <input id="lockup-search" className={`${inputCls} pl-9`} placeholder="Search the Yard Lockup" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <label className="sr-only" htmlFor="lockup-sort">Sort</label>
          <select id="lockup-sort" className={inputCls} value={sort} onChange={(e) => setSort(e.target.value as LockupSort)}>
            <option value="sheet">Audit sheet order</option>
            <option value="name">Name</option>
            <option value="quantity">Quantity, lowest first</option>
          </select>
        </div>
      </div>

      {LOCKUP_SECTIONS.map((s) => {
        const open = !closed.has(s.key);
        return (
          <section key={s.key} id={`lockup-${s.key}`} className={`${card} scroll-mt-40`} aria-labelledby={`lockup-h-${s.key}`}>
            <button type="button" onClick={() => toggle(s.key)} aria-expanded={open}
              className="w-full min-h-[52px] px-4 sm:px-5 flex items-center justify-between gap-2 border-b border-slate-200 cursor-pointer hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500">
              <span id={`lockup-h-${s.key}`} className="text-base font-bold text-slate-900">
                {s.title} <span className="text-sm font-normal text-slate-600">· {count(s.key)} {s.key === 'kit' ? 'items' : 'lines'}</span>
              </span>
              <ChevronDown className={`h-5 w-5 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>
            {open && (s.key === 'kit' ? (
              kitShown.length === 0 ? <p className="px-5 py-5 text-base sm:text-sm text-slate-600">No plant kit in the Yard Lockup.</p> : (
                <ul className="divide-y divide-slate-200">
                  {kitShown.map((k) => (
                    <li key={k.id} className="px-4 sm:px-5 py-3 flex flex-col md:flex-row md:items-center gap-2 md:gap-4">
                      <div className="md:w-56 min-w-0">
                        <p className="text-base sm:text-sm font-bold text-slate-900 flex items-center gap-2">{k.type_name}<TestTag show={k.is_test} /></p>
                        <p className="text-xs text-slate-600">{k.plant_no ?? 'No plant no'} · expiry {formatDate(k.expiry_date)}</p>
                      </div>
                      <div className="md:flex-1"><ExpiryPill expiry={k.expiry_date} /></div>
                      <div className="flex gap-2">
                        <button type="button" className={`${btn.small} flex-1 md:flex-none`} onClick={() => onPlantAction(k, 'update')}>Update</button>
                        <button type="button" className={`${btn.small} flex-1 md:flex-none`} onClick={() => onPlantAction(k, 'assign')}>Assign</button>
                        <button type="button" className={`${btn.smallDelete} flex-1 md:flex-none`} onClick={() => onPlantAction(k, 'delete')}>Delete</button>
                      </div>
                    </li>
                  ))}
                </ul>
              )
            ) : (
              (() => {
                const rows = shown.filter((l) => l.section === s.key);
                if (!rows.length) return <p className="px-5 py-5 text-base sm:text-sm text-slate-600">{lowOnly ? 'Nothing low here.' : term ? 'Nothing matches.' : 'Nothing counted here yet. Use “Add to lockup”.'}</p>;
                return (
                  <ul className="divide-y divide-slate-200">
                    {rows.map((l) => (
                      <li key={l.id} className={`px-4 sm:px-5 py-3 grid grid-cols-1 lg:grid-cols-[minmax(10rem,1fr)_auto_6.5rem_minmax(10rem,1fr)_auto] gap-3 items-center ${isLowStock(l.quantity, l.low_at) ? 'bg-amber-50' : ''}`}>
                        <div className="min-w-0">
                          <p className="text-base sm:text-sm font-bold text-slate-900 flex flex-wrap items-center gap-2">
                            {l.name}<TestTag show={l.is_test} />
                            {isLowStock(l.quantity, l.low_at) && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border bg-amber-100 text-amber-800 border-amber-200">Low stock</span>
                            )}
                          </p>
                          {l.expected_qty && <p className="text-xs text-slate-600">{l.expected_qty}</p>}
                        </div>
                        <div className="flex items-center gap-2" role="group" aria-label={`${l.name} count`}>
                          <button type="button" aria-label={`One fewer ${l.name}`} disabled={busyLine === l.id || l.quantity < 1} onClick={() => bump(l, -1)}
                            className="min-h-[44px] min-w-[44px] rounded-lg border border-slate-300 bg-white text-slate-700 flex items-center justify-center hover:bg-slate-50 disabled:opacity-40 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                            <Minus className="h-4 w-4" />
                          </button>
                          <span className={`min-w-[3rem] text-center text-lg font-bold ${l.quantity === 0 ? 'text-red-700' : 'text-slate-900'}`} aria-live="polite">{l.quantity}</span>
                          <button type="button" aria-label={`One more ${l.name}`} disabled={busyLine === l.id} onClick={() => bump(l, 1)}
                            className="min-h-[44px] min-w-[44px] rounded-lg border border-slate-300 bg-white text-slate-700 flex items-center justify-center hover:bg-slate-50 disabled:opacity-40 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                            <Plus className="h-4 w-4" />
                          </button>
                        </div>
                        <Field label="Low at" hint="Blank = no warning">
                          {(id) => (
                            <input id={id} inputMode="numeric" className={inputCls} defaultValue={l.low_at ?? ''} placeholder="—"
                              onChange={(e) => { e.target.value = e.target.value.replace(/\D/g, ''); }}
                              onBlur={(e) => saveLowAt(l, e.target.value)} />
                          )}
                        </Field>
                        <Field label="Note">
                          {(id) => <input id={id} className={inputCls} defaultValue={l.note ?? ''} placeholder="e.g. sizes" onBlur={(e) => saveNote(l, e.target.value)} />}
                        </Field>
                        <button type="button" className={btn.secondary} disabled={l.quantity < 1} onClick={() => setIssuing(l)}>
                          <Send className="h-4 w-4" />Issue to
                        </button>
                      </li>
                    ))}
                  </ul>
                );
              })()
            ))}
          </section>
        );
      })}

      {asking && (
        <Sheet title="Who’s doing this?" subtitle="Every count is logged with a name." onClose={() => setAsking(null)}
          footer={
            <>
              <button type="button" className={btn.secondary} onClick={() => setAsking(null)}>Cancel</button>
              <button type="button" className={btn.primary} disabled={!actorId} onClick={() => { const a = asking; setAsking(null); bump(a.line, a.delta, actorId); }}>
                {asking.delta > 0 ? `Add ${asking.delta}` : `Take ${-asking.delta} out`}
              </button>
            </>
          }>
          <ActorPicker auditors={auditors} value={actorId} onChange={setActorId} />
        </Sheet>
      )}
      {issuing && (
        <IssueSheet line={issuing} people={people} auditors={auditors} onClose={() => setIssuing(null)}
          onSaved={(m) => { setIssuing(null); setFlash(m); load(); }} />
      )}
    </div>
  );
}
