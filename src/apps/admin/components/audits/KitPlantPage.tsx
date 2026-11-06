import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Search, Truck, Wrench, ChevronRight, ArrowLeft, Users, X, PackagePlus } from 'lucide-react';
import { LoadingSpinner } from '../../../../components/LoadingSpinner';
import { listKit, moveKit, listAttention } from '../../../../lib/siteAuditService';
import { listLockup, LockupRow } from '../../../../lib/lockupService';
import { lowStockLines } from '../../../../lib/lockupLogic';
import { kitPageTiles } from '../../../../lib/dashboardLogic';
import { sortAttention, AttentionRow } from '../../../../lib/siteAuditLogic';
import { NeedsAttention } from './NeedsAttention';
import { searchTargets, sortKit, summariseKitByType, summariseKitByHolder, holderKey, holderLabel, AuditTarget, KitSort } from '../../../../lib/siteAuditLogic';
import { Auditor } from '../../../../lib/supabase';
import { ActorPicker } from './ActorPicker';
import { useActor } from './useActor';
import { KitItemOverview } from '../../../../lib/supabase';
import { AddKitSheet } from './AddKitSheet';
import { LockupView } from './LockupView';
import { AddLockupSheet } from './LockupSheets';
import { DeletePlantSheet } from './FleetSheets';
import { UpdateItemSheet, UpdateTarget } from './UpdateItemSheet';
import { SwapKitSheet } from './SwapKitSheet';
import { TargetPicker } from './TargetPicker';
import { useAuditRef } from './useAuditRef';
import { kitUpdateTarget, kitWhere, monthsForType } from './updateTargets';
import { Field, Sheet, ExpiryPill, ErrorNote, TestModeBanner, TestTag, CountBadge, StatTiles } from './ui';
import { DownloadMenu } from './DownloadMenu';
import { downloadByHolder, downloadLockup, downloadPlantRegister } from '../../../../lib/auditDownloads';
import { whoName } from '../../../../lib/siteAuditLogic';
import { btn, card, inputCls, formatDate } from './styles';

type Filter = 'all' | 'on_van' | 'spare' | 'away_for_service' | 'attention';
const PAGE = 25;

const SOURCE_LABEL: Record<string, string> = { audit: 'audit', swap: 'swap', update: 'update', added: 'added', moved: 'moved' };
function lastSeen(k: KitItemOverview) {
  if (!k.last_seen_at) return '—';
  return `${formatDate(k.last_seen_at.slice(0, 10))} · ${SOURCE_LABEL[k.last_seen_source ?? ''] ?? ''}`;
}

const tabCls = (on: boolean) =>
  `min-h-[44px] px-3 rounded-md text-sm sm:text-xs font-semibold cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${on ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`;

export const KitPlantPage: React.FC = () => {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const view = params.get('view') === 'van' ? 'van' : params.get('view') === 'lockup' ? 'lockup' : 'type';
  const typeId = params.get('type');
  const ref = useAuditRef();
  const { actor: downloadActor } = useActor(ref.auditors);

  const [kit, setKit] = useState<KitItemOverview[] | null>(null);
  const [attention, setAttention] = useState<AttentionRow[] | null>(null);
  const [lowStock, setLowStock] = useState<LockupRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [topQ, setTopQ] = useState('');
  const [adding, setAdding] = useState<false | 'any' | 'lockup'>(false);
  /** "Add to lockup" (stock counted by quantity); the Yard Lockup tab reloads after */
  const [addingStock, setAddingStock] = useState(false);
  const [lockupVersion, setLockupVersion] = useState(0);
  const [updating, setUpdating] = useState<UpdateTarget | null>(null);
  const [swapping, setSwapping] = useState<KitItemOverview | null>(null);
  const [assigning, setAssigning] = useState<{ item: KitItemOverview; back: boolean } | null>(null);
  const [removing, setRemoving] = useState<KitItemOverview | null>(null);
  const [deleting, setDeleting] = useState<KitItemOverview | null>(null);

  const load = useCallback(async () => {
    try {
      const [k, a, lockup] = await Promise.all([listKit(), listAttention(), listLockup().catch(() => [] as LockupRow[])]);
      setKit(k);
      setAttention(sortAttention(a));
      setLowStock(lowStockLines(lockup));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load kit.');
      setKit([]);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const done = () => {
    setAdding(false);
    setUpdating(null);
    setSwapping(null);
    setAssigning(null);
    setRemoving(null);
    setDeleting(null);
    load();
  };

  const { auditors } = ref;
  const all = useMemo(() => kit ?? [], [kit]);
  const labelled = useMemo(
    () => all.map((k) => ({ ...k, vehicle_label: k.status === 'on_van' ? holderLabel(k) : null })),
    [all]
  );
  /** the holder's page (person or spare van) */
  const openHolder = (k: KitItemOverview) => {
    const key = holderKey(k);
    if (key) navigate(`/kit/van?key=${encodeURIComponent(key)}`);
  };

  const tiles = kitPageTiles(all, attention ?? [], lowStock.length);

  // ---------------------------------------------------------- top search
  const q = topQ.trim().toLowerCase();
  const vanHits = q ? searchTargets(ref.allTargets, topQ).slice(0, 6) : [];
  const itemHits = q
    ? labelled.filter((k) => [k.type_name, k.plant_no, k.vehicle_label].some((v) => v?.toLowerCase().includes(q))).slice(0, 8)
    : [];

  if (kit === null || !ref.loaded) return <LoadingSpinner />;
  const who = whoName(downloadActor?.name);

  const type = typeId ? ref.kitTypes.find((t) => t.id === typeId) : undefined;

  return (
    <div className="space-y-5">
      <TestModeBanner />
      {/* phone: Add kit full width, then Add to lockup and Download side by side; computer: one row */}
      <div className="grid grid-cols-2 sm:flex sm:justify-end gap-2">
          <button type="button" className={`${btn.primary} col-span-2 sm:order-last`} onClick={() => setAdding('any')}>
            <Plus className="h-4 w-4" aria-hidden="true" />Add kit
          </button>
          <button type="button" className={btn.secondary} onClick={() => setAddingStock(true)}>
            <PackagePlus className="h-4 w-4" aria-hidden="true" />Add to lockup
          </button>
          <DownloadMenu choices={[
            { title: 'Full plant register', kind: 'pdf', hint: 'Every item by kit type: plant no, who / where, service, expiry, status', run: () => downloadPlantRegister('pdf', who) },
            { title: 'Full plant register', kind: 'csv', hint: 'The same, for a spreadsheet', run: () => downloadPlantRegister('csv', who) },
            { title: 'By person / spare van', kind: 'pdf', hint: 'One section each: their kit, PPE and H&S dates', run: () => downloadByHolder(who, (key) => ref.allTargets.find((t) => t.key === key)?.label ?? key) },
            { title: 'Yard Lockup stock', kind: 'pdf', hint: 'Counts and low-at levels', run: () => downloadLockup('pdf', who) },
            { title: 'Yard Lockup stock', kind: 'csv', hint: 'The same, for a spreadsheet', run: () => downloadLockup('csv', who) },
          ]} />
      </div>

      <ErrorNote message={error ?? ref.error} />

      <section className={`${card} p-3 sm:p-4`}>
        <label htmlFor="kit-top-search" className="sr-only">Search ganger, van, item or plant no</label>
        <div className="relative">
          <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
          <input id="kit-top-search" className={`${inputCls} pl-9 pr-10`} placeholder="Search ganger, van, item or plant no"
            value={topQ} onChange={(e) => setTopQ(e.target.value)} autoComplete="off" />
          {topQ && (
            <button type="button" aria-label="Clear search" onClick={() => setTopQ('')} className="absolute right-1 top-1/2 -translate-y-1/2 p-2.5 rounded-lg text-slate-600 hover:bg-slate-100 cursor-pointer">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        {q && (
          <div className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200">
            {vanHits.length === 0 && itemHits.length === 0 && <p className="px-3 py-3 text-sm text-slate-600">Nothing matches “{topQ}”.</p>}
            {vanHits.map((t) => (
              <button key={t.key} type="button" onClick={() => navigate(`/kit/van?key=${encodeURIComponent(t.key)}`)}
                className="w-full min-h-[44px] px-3 flex items-center gap-2 text-left text-sm text-slate-900 hover:bg-slate-50 cursor-pointer">
                {t.kind === 'person' ? <Users className="h-4 w-4 text-slate-400" /> : <Truck className="h-4 w-4 text-slate-400" />}
                <span className="font-semibold">{t.label}</span>
                <ChevronRight className="h-4 w-4 text-slate-400 ml-auto" />
              </button>
            ))}
            {itemHits.map((k) => (
              <button key={k.id} type="button"
                onClick={() => (holderKey(k) ? openHolder(k) : setParams({ type: k.kit_type_id, q: k.plant_no ?? '' }))}
                className="w-full min-h-[44px] px-3 flex items-center gap-2 text-left text-sm text-slate-900 hover:bg-slate-50 cursor-pointer">
                <Wrench className="h-4 w-4 text-slate-400" />
                <span className="font-semibold">{k.type_name}</span>
                <span className="text-slate-600">{k.plant_no ?? 'No plant no'} · {kitWhere(k)}</span>
                <ChevronRight className="h-4 w-4 text-slate-400 ml-auto" />
              </button>
            ))}
          </div>
        )}
      </section>

      <StatTiles tiles={tiles} />

      {!type && <NeedsAttention rows={attention} lowStock={lowStock} kit={all} refData={ref} onChanged={load} />}

      {type ? (
        <TypeItems
          key={`${type.id}:${params.get('q') ?? ''}`}
          typeName={type.name}
          months={type.service_interval_months}
          initialQuery={params.get('q') ?? ''}
          items={labelled.filter((k) => k.kit_type_id === type.id)}
          onBack={() => setParams({})}
          onOpenHolder={openHolder}
          onUpdate={(k) => setUpdating(kitUpdateTarget(k, ref.kitTypes))}
          onSwap={setSwapping}
          onAssign={(k, back) => setAssigning({ item: k, back })}
          onRemove={setRemoving}
          onDelete={setDeleting}
          where={(k) => kitWhere(k)}
        />
      ) : (
        <section className={card}>
          <div className="px-4 sm:px-5 py-3 border-b border-slate-200">
            <div role="tablist" aria-label="View" className="inline-flex flex-wrap gap-1 bg-slate-100 p-1 rounded-lg">
              <button type="button" role="tab" aria-selected={view === 'type'} className={tabCls(view === 'type')} onClick={() => setParams({})}>By kit type</button>
              <button type="button" role="tab" aria-selected={view === 'van'} className={tabCls(view === 'van')} onClick={() => setParams({ view: 'van' })}>By person / spare van</button>
              <button type="button" role="tab" aria-selected={view === 'lockup'} className={tabCls(view === 'lockup')} onClick={() => setParams({ view: 'lockup' })}>Yard Lockup</button>
            </div>
          </div>
          {view === 'lockup' ? (
            <div className="p-3 sm:p-4 bg-slate-50 rounded-b-xl">
              <LockupView
                key={lockupVersion}
                auditors={auditors}
                people={ref.allTargets.filter((t) => t.kind === 'person')}
                plantKit={all.filter((k) => k.status === 'spare')}
                onPlantAction={(k, a) => (a === 'update' ? setUpdating(kitUpdateTarget(k, ref.kitTypes)) : a === 'assign' ? setAssigning({ item: k, back: false }) : a === 'delete' ? setDeleting(k) : setRemoving(k))}
              />
            </div>
          ) : view === 'type' ? (
            <ByType rows={summariseKitByType(ref.kitTypes, all)} onOpen={(id) => setParams({ type: id })} />
          ) : (
            <ByVan
              rows={summariseKitByHolder(ref.allTargets, all).filter((r, i) => {
                const t = ref.allTargets[i];
                return r.items > 0 || t.isGanger || t.kind === 'spare_van' || !!t.vehicleId;
              })}
              changedPeople={new Set(ref.vanChanges.map((c) => c.employeeId))}
              onOpen={(key) => navigate(`/kit/van?key=${encodeURIComponent(key)}`)} />
          )}
        </section>
      )}

      {addingStock && (
        <AddLockupSheet checklist={ref.checklist} auditors={auditors} onClose={() => setAddingStock(false)}
          onSaved={() => { setAddingStock(false); setLockupVersion((v) => v + 1); load(); }}
          onPlantKit={() => { setAddingStock(false); setAdding('lockup'); }} />
      )}
      {adding && (
        <AddKitSheet mode="page" kitTypes={ref.kitTypes} targets={ref.allTargets} auditors={auditors} defaultWhere={adding === 'lockup' ? 'spare' : 'on_van'} onClose={() => setAdding(false)} onSaved={done}
          onTypeCreated={(t) => ref.setKitTypes((ts) => [...ts, t])} />
      )}
      {updating && <UpdateItemSheet target={updating} targets={ref.allTargets} auditors={auditors} onClose={() => setUpdating(null)} onSaved={done} />}
      {swapping && <SwapKitSheet item={swapping} targets={ref.allTargets} months={monthsForType(ref.kitTypes, swapping.kit_type_id)} auditors={auditors} onClose={() => setSwapping(null)} onSaved={done} />}
      {assigning && <AssignSheet {...assigning} targets={ref.allTargets} auditors={auditors} onClose={() => setAssigning(null)} onSaved={done} />}
      {removing && <RemoveSheet item={removing} auditors={auditors} onClose={() => setRemoving(null)} onSaved={done} />}
      {deleting && <DeletePlantSheet item={deleting} auditors={auditors} onClose={() => setDeleting(null)} onDone={done} />}
    </div>
  );
};

// ---------------------------------------------------------------- By kit type

function ByType({ rows, onOpen }: { rows: ReturnType<typeof summariseKitByType>; onOpen: (typeId: string) => void }) {
  return (
    <>
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-semibold text-slate-600 uppercase tracking-wider border-b border-slate-200">
              <th className="px-5 py-3">Kit type</th>
              <th className="px-3 py-3 text-right">Total</th>
              <th className="px-3 py-3 text-right">On vans</th>
              <th className="px-3 py-3 text-right">Yard Lockup</th>
              <th className="px-3 py-3 text-right">Away</th>
              <th className="px-3 py-3">Warnings</th>
              <th className="px-5 py-3"><span className="sr-only">Open</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {rows.map((r) => (
              <tr key={r.typeId} className="hover:bg-slate-50 cursor-pointer" onClick={() => onOpen(r.typeId)}>
                <td className="px-5 py-3 font-semibold text-slate-900">{r.name}</td>
                <td className="px-3 py-3 text-right text-slate-900 font-semibold">{r.total}</td>
                <td className="px-3 py-3 text-right text-slate-700">{r.onVans}</td>
                <td className="px-3 py-3 text-right text-slate-700">{r.spares}</td>
                <td className="px-3 py-3 text-right text-slate-700">{r.away}</td>
                <td className="px-3 py-3">
                  <span className="flex flex-wrap gap-1">
                    {r.expired > 0 && <CountBadge n={r.expired} label="expired" tone="red" />}
                    {r.dueSoon > 0 && <CountBadge n={r.dueSoon} label="due soon" tone="amber" />}
                    {!r.expired && !r.dueSoon && <span className="text-xs text-slate-600">None</span>}
                  </span>
                </td>
                <td className="px-5 py-3 text-right">
                  <button type="button" onClick={(e) => { e.stopPropagation(); onOpen(r.typeId); }} className="inline-flex items-center gap-1 min-h-[36px] px-2 rounded-lg text-xs font-semibold text-blue-700 hover:bg-blue-50 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                    View<ChevronRight className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="md:hidden divide-y divide-slate-200">
        {rows.map((r) => (
          <li key={r.typeId}>
            <button type="button" onClick={() => onOpen(r.typeId)} className="w-full text-left px-4 py-3 min-h-[64px] flex items-center justify-between gap-3 hover:bg-slate-50 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500">
              <span className="min-w-0">
                <span className="block text-base sm:text-sm font-bold text-slate-900">{r.name} <span className="font-normal text-slate-600">· {r.total}</span></span>
                <span className="block text-xs text-slate-600 mt-0.5">{r.onVans} on vans · {r.spares} in Yard Lockup · {r.away} away</span>
                {(r.expired > 0 || r.dueSoon > 0) && (
                  <span className="flex flex-wrap gap-1 mt-1.5">
                    {r.expired > 0 && <CountBadge n={r.expired} label="expired" tone="red" />}
                    {r.dueSoon > 0 && <CountBadge n={r.dueSoon} label="due soon" tone="amber" />}
                  </span>
                )}
              </span>
              <ChevronRight className="h-5 w-5 text-slate-400 flex-shrink-0" />
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

// ---------------------------------------------------------------- By gang / van

function ByVan({ rows, changedPeople, onOpen }: { rows: ReturnType<typeof summariseKitByHolder>; changedPeople: Set<string>; onOpen: (key: string) => void }) {
  return (
    <ul className="divide-y divide-slate-200">
      {rows.map((r) => (
        <li key={r.key}>
          <button type="button" onClick={() => onOpen(r.key)} className="w-full text-left px-4 sm:px-5 py-3 min-h-[56px] flex items-center justify-between gap-3 hover:bg-slate-50 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500">
            <span className="min-w-0 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
              <span className="text-base sm:text-sm font-bold text-slate-900">{r.label}</span>
              <span className="flex flex-wrap items-center gap-1">
                <CountBadge n={r.items} label={r.items === 1 ? 'item' : 'items'} tone="slate" />
                {r.expired > 0 && <CountBadge n={r.expired} label="expired" tone="red" />}
                {r.dueSoon > 0 && <CountBadge n={r.dueSoon} label="due soon" tone="amber" />}
                {r.personId && changedPeople.has(r.personId) && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border bg-amber-50 text-amber-800 border-amber-200">Van changed: check kit</span>
                )}
              </span>
            </span>
            <ChevronRight className="h-5 w-5 text-slate-400 flex-shrink-0" />
          </button>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------- one type's items

type Labelled = KitItemOverview & { vehicle_label: string | null };

function TypeItems({ typeName, months, initialQuery, items, onBack, onOpenHolder, onUpdate, onSwap, onAssign, onRemove, onDelete, where }: {
  typeName: string;
  months: number | null;
  initialQuery: string;
  items: Labelled[];
  onBack: () => void;
  onOpenHolder: (k: KitItemOverview) => void;
  onUpdate: (k: KitItemOverview) => void;
  onSwap: (k: KitItemOverview) => void;
  onAssign: (k: KitItemOverview, back: boolean) => void;
  onRemove: (k: KitItemOverview) => void;
  onDelete: (k: KitItemOverview) => void;
  where: (k: KitItemOverview) => string;
}) {
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState(initialQuery);
  const [sort, setSort] = useState<KitSort>('expiry');
  const [shown, setShown] = useState(PAGE);

  const visible = useMemo(() => {
    const term = q.trim().toLowerCase();
    const f = items.filter((k) => {
      if (filter === 'attention' && !(k.status !== 'away_for_service' && (k.expiry_status === 'expired' || k.expiry_status === 'due_soon'))) return false;
      if (filter !== 'all' && filter !== 'attention' && k.status !== filter) return false;
      return !term || [k.plant_no, k.vehicle_label, k.service_company].some((v) => v?.toLowerCase().includes(term));
    });
    return sortKit(f, sort);
  }, [items, filter, q, sort]);
  const page = visible.slice(0, shown);

  const actions = (k: KitItemOverview, full = false) => {
    const cls = `${btn.small} ${full ? 'flex-1' : ''}`;
    return (
      <>
        {k.status !== 'away_for_service' && <button type="button" className={cls} onClick={() => onUpdate(k)}>Update</button>}
        {k.status === 'on_van' && <button type="button" className={cls} onClick={() => onSwap(k)}>Swap</button>}
        {k.status === 'spare' && <button type="button" className={cls} onClick={() => onAssign(k, false)}>Assign to van</button>}
        {k.status === 'away_for_service' && <button type="button" className={cls} onClick={() => onAssign(k, true)}>Back from service</button>}
        {k.status !== 'on_van' && <button type="button" className={cls} onClick={() => onRemove(k)}>Scrapped (keep record)</button>}
        <button type="button" className={`${cls} text-red-700`} onClick={() => onDelete(k)}>Delete completely</button>
      </>
    );
  };
  const whereCell = (k: KitItemOverview) =>
    holderKey(k) ? (
      <button type="button" onClick={() => onOpenHolder(k)} className="text-left font-medium text-blue-700 hover:underline cursor-pointer min-h-[44px] sm:min-h-[36px] rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">{where(k)}</button>
    ) : (
      <span className="text-slate-700">{where(k)}</span>
    );

  return (
    <section className={card} aria-labelledby="type-h">
      <div className="px-4 sm:px-5 py-3 border-b border-slate-200 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={onBack} className="inline-flex items-center gap-1 min-h-[44px] px-2 -ml-2 rounded-lg text-sm font-semibold text-blue-700 hover:bg-blue-50 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
            <ArrowLeft className="h-4 w-4" />All kit types
          </button>
          <h2 id="type-h" className="text-base font-bold text-slate-900">{typeName}</h2>
          <span className="text-xs text-slate-600">{items.length} items{months ? ` · service every ${months} months` : ''}</span>
        </div>
        <div className="flex flex-col lg:flex-row lg:items-end gap-3 justify-between">
          <div role="tablist" aria-label="Filter" className="flex flex-wrap gap-1 bg-slate-100 p-1 rounded-lg self-start">
            {([
              ['all', 'All'], ['on_van', 'On vans'], ['spare', 'Yard Lockup'], ['away_for_service', 'Away'], ['attention', 'Expired or due'],
            ] as [Filter, string][]).map(([v, l]) => (
              <button key={v} type="button" role="tab" aria-selected={filter === v} className={tabCls(filter === v)} onClick={() => { setFilter(v); setShown(PAGE); }}>{l}</button>
            ))}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 lg:w-[30rem]">
            <Field label="Search plant no or van">
              {(id) => <input id={id} className={inputCls} value={q} onChange={(e) => { setQ(e.target.value); setShown(PAGE); }} placeholder="e.g. P-101 or Oliver" />}
            </Field>
            <Field label="Sort">
              {(id) => (
                <select id={id} className={inputCls} value={sort} onChange={(e) => setSort(e.target.value as KitSort)}>
                  <option value="expiry">Expiry, soonest first</option>
                  <option value="plant">Plant no</option>
                  <option value="van">Van</option>
                </select>
              )}
            </Field>
          </div>
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="px-5 py-8 text-base sm:text-sm text-slate-600">{items.length === 0 ? `No ${typeName} recorded yet.` : 'Nothing matches.'}</p>
      ) : (
        <>
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold text-slate-600 uppercase tracking-wider border-b border-slate-200">
                  <th className="px-5 py-3">Plant no</th>
                  <th className="px-3 py-3">Assigned to</th>
                  <th className="px-3 py-3">Service</th>
                  <th className="px-3 py-3">Expiry</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Last seen</th>
                  <th className="px-5 py-3 text-right"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {page.map((k) => (
                  <tr key={k.id}>
                    <td className="px-5 py-3 font-semibold text-slate-900"><span className="inline-flex items-center gap-2">{k.plant_no ?? '—'}<TestTag show={k.is_test} /></span></td>
                    <td className="px-3 py-3">{whereCell(k)}</td>
                    <td className="px-3 py-3 text-slate-700 whitespace-nowrap">{formatDate(k.service_date)}</td>
                    <td className="px-3 py-3 text-slate-700 whitespace-nowrap">{formatDate(k.expiry_date)}</td>
                    <td className="px-3 py-3"><ExpiryPill expiry={k.expiry_date} /></td>
                    <td className="px-3 py-3 text-xs text-slate-600 whitespace-nowrap">{lastSeen(k)}</td>
                    <td className="px-5 py-3"><div className="flex justify-end gap-2">{actions(k)}</div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="md:hidden divide-y divide-slate-200">
            {page.map((k) => (
              <li key={k.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-base sm:text-sm font-bold text-slate-900 flex items-center gap-2">{k.plant_no ?? 'No plant no'}<TestTag show={k.is_test} /></p>
                    <p className="text-xs mt-0.5">{whereCell(k)}</p>
                    <p className="text-xs text-slate-600 mt-0.5">Service {formatDate(k.service_date)} · expiry {formatDate(k.expiry_date)}</p>
                  </div>
                  <ExpiryPill expiry={k.expiry_date} />
                </div>
                <div className="flex gap-2 mt-3">{actions(k, true)}</div>
              </li>
            ))}
          </ul>
          <div className="px-4 sm:px-5 py-3 border-t border-slate-200 flex items-center justify-between gap-3">
            <p className="text-xs text-slate-600">Showing {page.length} of {visible.length}</p>
            {visible.length > shown && (
              <button type="button" className={btn.secondary} onClick={() => setShown(shown + PAGE)}>
                Show {Math.min(PAGE, visible.length - shown)} more
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- sheets

function AssignSheet({ item, back, targets, auditors, onClose, onSaved }: { item: KitItemOverview; back: boolean; targets: AuditTarget[]; auditors: Auditor[]; onClose: () => void; onSaved: () => void }) {
  const [to, setTo] = useState<'spare' | 'on_van'>(back ? 'spare' : 'on_van');
  const [holderKeyValue, setHolderKey] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { actorId, setActorId } = useActor(auditors);
  const holder = targets.find((t) => t.key === holderKeyValue);
  const save = async () => {
    if (!actorId) return setError('Pick who’s doing this.');
    if (to === 'on_van' && !holder) return setError('Pick who it goes to.');
    setBusy(true);
    try {
      await moveKit({
        itemId: item.id,
        status: to,
        holderEmployeeId: to === 'on_van' && holder?.kind === 'person' ? holder.personId : null,
        vehicleId: to === 'on_van' && holder?.kind === 'spare_van' ? holder.vehicleId : null,
        serviceCompany: null,
        note: note.trim() || null,
        actorId,
      });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
      setBusy(false);
    }
  };
  return (
    <Sheet title={back ? `Back from service: ${item.type_name}` : `Assign ${item.type_name}`} subtitle={item.plant_no ?? undefined} onClose={onClose}
      footer={<><button type="button" className={btn.secondary} onClick={onClose}>Cancel</button><button type="button" className={btn.primary} disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button></>}>
      <ActorPicker auditors={auditors} value={actorId} onChange={setActorId} />
      {back && (
        <fieldset>
          <legend className="block text-xs font-semibold text-slate-600 mb-2">Where does it go now?</legend>
          <div className="grid grid-cols-2 gap-2">
            {([['spare', 'Yard Lockup'], ['on_van', 'To someone']] as const).map(([v, l]) => (
              <label key={v} className={`flex items-center gap-2 min-h-[44px] px-3 rounded-lg border cursor-pointer text-sm font-medium ${to === v ? 'border-blue-500 bg-blue-50' : 'border-slate-200'}`}>
                <input type="radio" checked={to === v} onChange={() => setTo(v)} className="h-4 w-4" />{l}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {to === 'on_van' && <TargetPicker label="Who gets it? (person or spare van)" targets={targets} value={holderKeyValue} onChange={setHolderKey} />}
      <Field label="Note (optional)">{(id) => <input id={id} className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
      <ErrorNote message={error} />
    </Sheet>
  );
}

function RemoveSheet({ item, auditors, onClose, onSaved }: { item: KitItemOverview; auditors: Auditor[]; onClose: () => void; onSaved: () => void }) {
  const { actorId, setActorId } = useActor(auditors);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Sheet title={`Scrapped: ${item.type_name} ${item.plant_no ?? ''}`} subtitle="Scrapped (keep record): it leaves the Kit & Plant list, its history is kept. To remove it from every record, use “Delete completely”." onClose={onClose}
      footer={<>
        <button type="button" className={btn.secondary} onClick={onClose}>Keep it</button>
        <button type="button" className={btn.danger} disabled={busy} onClick={async () => {
          if (!actorId) return setError('Pick who’s doing this.');
          setBusy(true);
          try {
            await moveKit({ itemId: item.id, status: 'removed', holderEmployeeId: null, vehicleId: null, serviceCompany: null, note: note.trim() || null, actorId });
            onSaved();
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not remove.');
            setBusy(false);
          }
        }}>{busy ? 'Saving…' : 'Scrapped (keep record)'}</button>
      </>}>
      <ActorPicker auditors={auditors} value={actorId} onChange={setActorId} />
      <Field label="Reason (optional)">{(id) => <input id={id} className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Scrapped, beyond repair" />}</Field>
      <ErrorNote message={error} />
    </Sheet>
  );
}
