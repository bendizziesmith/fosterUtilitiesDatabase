import { useCallback, useEffect, useMemo, useState } from 'react';
import { Minus, Plus, Search, ChevronDown, Send } from 'lucide-react';
import { LoadingSpinner } from '../../../../components/LoadingSpinner';
import { listLockup, adjustLockupChecked, setLockupNote, setLockupLowAt, LockupRow } from '../../../../lib/lockupService';
import { LOCKUP_SECTIONS, LockupSection, LockupSort, sortLockup, lowStockLines } from '../../../../lib/lockupLogic';
import { groupLockupLines, lockupGroupKey, LockupGroup } from '../../../../lib/hsDatesLogic';
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
export function LockupView({ auditors, people, plantKit, onPlantAction, onChanged }: {
  auditors: Auditor[];
  /** people kit can be issued to: gangers first, then other staff */
  people: AuditTarget[];
  /** kit_items with status 'spare' */
  plantKit: KitItemOverview[];
  onPlantAction: (k: KitItemOverview, action: 'update' | 'assign' | 'delete') => void;
  /** after an issue: Needs attention and low stock on the page reload */
  onChanged?: () => void;
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
  const [issuing, setIssuing] = useState<{ line: LockupRow; lines?: LockupRow[] } | null>(null);
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
  // low stock adds up every line of an item (dated H&S items have one line per expiry)
  const lowKeys = useMemo(() => new Set(lowStockLines(lines ?? []).map(lockupGroupKey)), [lines]);
  const lowCount = lowKeys.size;
  const shown = useMemo(
    () => sortLockup(
      (lines ?? []).filter((l) => (!lowOnly || lowKeys.has(lockupGroupKey(l))) && (!term || [l.name, l.note].some((v) => v?.toLowerCase().includes(term)))),
      sort
    ),
    [lines, term, sort, lowOnly, lowKeys]
  );
  const kitShown = useMemo(() => {
    if (lowOnly) return [];
    const f = plantKit.filter((k) => !term || [k.type_name, k.plant_no].some((v) => v?.toLowerCase().includes(term)));
    return [...f].sort((a, b) => a.type_sort - b.type_sort || (a.plant_no ?? '').localeCompare(b.plant_no ?? '', undefined, { numeric: true }));
  }, [plantKit, term, lowOnly]);

  const groups = useMemo(() => groupLockupLines(shown), [shown]);
  const count = (s: SectionKey) => (s === 'kit' ? kitShown.length : groups.filter((g) => g.section === s).length);
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

  const saveLowAt = async (g: LockupGroup<LockupRow>, raw: string) => {
    const v = raw.trim() === '' ? null : Number(raw);
    if (v === (g.low_at ?? null) && g.lines.every((l) => (l.low_at ?? null) === v)) return;
    setError(null);
    const ids = g.lines.map((l) => l.id);
    try {
      await setLockupLowAt(ids, v);
      setLines((ls) => (ls ?? []).map((x) => (ids.includes(x.id) ? { ...x, low_at: v } : x)));
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
                const rows = groups.filter((g) => g.section === s.key);
                if (!rows.length) return <p className="px-5 py-5 text-base sm:text-sm text-slate-600">{lowOnly ? 'Nothing low here.' : term ? 'Nothing matches.' : 'Nothing counted here yet. Use “Add to lockup”.'}</p>;
                return (
                  <ul className="divide-y divide-slate-200">
                    {rows.map((g) => {
                      const low = lowKeys.has(g.key);
                      const l = g.lines[0];
                      const lowAt = (
                        <Field label="Low at" hint={g.dateKind ? 'All lines added up' : 'Blank = no warning'}>
                          {(id) => (
                            <input id={id} inputMode="numeric" className={inputCls} defaultValue={g.low_at ?? ''} placeholder="—"
                              onChange={(e) => { e.target.value = e.target.value.replace(/\D/g, ''); }}
                              onBlur={(e) => saveLowAt(g, e.target.value)} />
                          )}
                        </Field>
                      );
                      const title = (
                        <div className="min-w-0">
                          <p className="text-base sm:text-sm font-bold text-slate-900 flex flex-wrap items-center gap-2">
                            {g.name}<TestTag show={l.is_test} />
                            {low && <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border bg-amber-100 text-amber-800 border-amber-200">Low stock</span>}
                          </p>
                          {l.expected_qty && <p className="text-xs text-slate-600">{l.expected_qty}</p>}
                          {g.dateKind && <p className="text-sm text-slate-700">{g.total} in total</p>}
                        </div>
                      );
                      if (g.dateKind) {
                        const inStock = g.lines.filter((x) => x.quantity > 0);
                        return (
                          <li key={g.key} className={`px-4 sm:px-5 py-3 space-y-3 ${low ? 'bg-amber-50' : ''}`}>
                            <div className="grid grid-cols-1 lg:grid-cols-[minmax(10rem,1fr)_6.5rem_auto] gap-3 items-center">
                              {title}
                              {lowAt}
                              <button type="button" className={btn.secondary} disabled={g.total < 1} onClick={() => setIssuing({ line: l, lines: g.lines })}>
                                <Send className="h-4 w-4" />Issue to
                              </button>
                            </div>
                            {inStock.length === 0 ? (
                              <p className="text-sm text-slate-600">None in stock. Use “Add to lockup” with the dates.</p>
                            ) : (
                              <ul className="rounded-lg border border-slate-200 bg-white divide-y divide-slate-200" aria-label={`${g.name} by expiry`}>
                                {inStock.map((x) => (
                                  <li key={x.id} className="px-3 py-2 flex flex-wrap items-center gap-x-3 gap-y-2">
                                    <div className="flex-1 min-w-[10rem]">
                                      <p className="text-base sm:text-sm font-semibold text-slate-900">
                                        {x.expiry_date ? `Expires ${formatDate(x.expiry_date)}` : 'No dates'}
                                      </p>
                                      {g.dateKind === 'tested' && x.tested_date && <p className="text-xs text-slate-600">Tested {formatDate(x.tested_date)}</p>}
                                    </div>
                                    <ExpiryPill expiry={x.expiry_date} />
                                    <Count line={x} busy={busyLine === x.id} onBump={(d) => bump(x, d)} />
                                  </li>
                                ))}
                              </ul>
                            )}
                          </li>
                        );
                      }
                      return (
                        <li key={g.key} className={`px-4 sm:px-5 py-3 grid grid-cols-1 lg:grid-cols-[minmax(10rem,1fr)_auto_6.5rem_minmax(10rem,1fr)_auto] gap-3 items-center ${low ? 'bg-amber-50' : ''}`}>
                          {title}
                          <Count line={l} busy={busyLine === l.id} onBump={(d) => bump(l, d)} />
                          {lowAt}
                          <Field label="Note">
                            {(id) => <input id={id} className={inputCls} defaultValue={l.note ?? ''} placeholder="e.g. sizes" onBlur={(e) => saveNote(l, e.target.value)} />}
                          </Field>
                          <button type="button" className={btn.secondary} disabled={l.quantity < 1} onClick={() => setIssuing({ line: l })}>
                            <Send className="h-4 w-4" />Issue to
                          </button>
                        </li>
                      );
                    })}
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
        <IssueSheet line={issuing.line} lines={issuing.lines} people={people} auditors={auditors} onClose={() => setIssuing(null)}
          onSaved={(m) => { setIssuing(null); setFlash(m); load(); onChanged?.(); }} />
      )}
    </div>
  );
}

/** − count + for one lockup line (never below 0). */
function Count({ line, busy, onBump }: { line: LockupRow; busy: boolean; onBump: (delta: number) => void }) {
  const label = line.expiry_date ? `${line.name} expiring ${formatDate(line.expiry_date)}` : line.name;
  return (
    <div className="flex items-center gap-2" role="group" aria-label={`${label} count`}>
      <button type="button" aria-label={`One fewer ${label}`} disabled={busy || line.quantity < 1} onClick={() => onBump(-1)}
        className="min-h-[44px] min-w-[44px] rounded-lg border border-slate-300 bg-white text-slate-700 flex items-center justify-center hover:bg-slate-50 disabled:opacity-40 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
        <Minus className="h-4 w-4" />
      </button>
      <span className={`min-w-[3rem] text-center text-lg font-bold ${line.quantity === 0 ? 'text-red-700' : 'text-slate-900'}`} aria-live="polite">{line.quantity}</span>
      <button type="button" aria-label={`One more ${label}`} disabled={busy} onClick={() => onBump(1)}
        className="min-h-[44px] min-w-[44px] rounded-lg border border-slate-300 bg-white text-slate-700 flex items-center justify-center hover:bg-slate-50 disabled:opacity-40 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}
