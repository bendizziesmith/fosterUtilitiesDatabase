import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Search, Truck, Warehouse, Wrench, AlertTriangle, Clock, Ban, Check } from 'lucide-react';
import { LoadingSpinner } from '../../../../components/LoadingSpinner';
import {
  listKit,
  listVanKitLists,
  loadAuditReferenceData,
  moveKit,
  setVanCarried,
  VanRow,
  StaffRow,
} from '../../../../lib/siteAuditService';
import { groupKitForPhone } from '../../../../lib/siteAuditLogic';
import { KitItemOverview, KitType, KitVanKitListRow } from '../../../../lib/supabase';
import { AddKitSheet } from './AddKitSheet';
import { UpdateItemSheet, UpdateTarget } from './UpdateItemSheet';
import { SwapKitSheet } from './SwapKitSheet';
import { Field, Sheet, ExpiryPill, ErrorNote, TestModeBanner, TestTag } from './ui';
import { btn, card, inputCls, formatDate, TEST_MODE } from './styles';

type Filter = 'all' | 'on_van' | 'spare' | 'away_for_service' | 'attention';

const SOURCE_LABEL: Record<string, string> = {
  audit: 'audit', swap: 'swap', update: 'update', added: 'added', moved: 'moved',
};

function assignedTo(k: KitItemOverview) {
  if (k.status === 'on_van') return k.ganger_name ? `${k.ganger_name} · ${k.vehicle_reg ?? ''}` : k.vehicle_reg ?? 'Van';
  if (k.status === 'spare') return 'Spare · Yard';
  if (k.status === 'away_for_service') return `Away for service${k.service_company ? ` · ${k.service_company}` : ''}`;
  return 'Removed';
}

function lastSeen(k: KitItemOverview) {
  if (!k.last_seen_at) return '—';
  return `${formatDate(k.last_seen_at.slice(0, 10))} · ${SOURCE_LABEL[k.last_seen_source ?? ''] ?? ''}`;
}

export const KitPlantPage: React.FC = () => {
  const [kit, setKit] = useState<KitItemOverview[] | null>(null);
  const [lists, setLists] = useState<KitVanKitListRow[]>([]);
  const [vehicles, setVehicles] = useState<VanRow[]>([]);
  const [employees, setEmployees] = useState<StaffRow[]>([]);
  const [kitTypes, setKitTypes] = useState<KitType[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [error, setError] = useState<string | null>(null);

  const [adding, setAdding] = useState(false);
  const [updating, setUpdating] = useState<UpdateTarget | null>(null);
  const [swapping, setSwapping] = useState<KitItemOverview | null>(null);
  const [assigning, setAssigning] = useState<{ item: KitItemOverview; back: boolean } | null>(null);
  const [removing, setRemoving] = useState<KitItemOverview | null>(null);

  const load = useCallback(async () => {
    try {
      const [k, l, ref] = await Promise.all([listKit(), listVanKitLists(), loadAuditReferenceData()]);
      setKit(k);
      setLists(l);
      setVehicles(ref.vehicles);
      setEmployees(ref.employees);
      setKitTypes(ref.kitTypes);
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
    load();
  };

  const all = useMemo(() => kit ?? [], [kit]);
  const tiles = [
    { key: 'on_van' as Filter, label: 'On vans', n: all.filter((k) => k.status === 'on_van').length, icon: Truck, tone: 'text-blue-600 bg-blue-50' },
    { key: 'spare' as Filter, label: 'Spares in yard', n: all.filter((k) => k.status === 'spare').length, icon: Warehouse, tone: 'text-violet-600 bg-violet-50' },
    { key: 'away_for_service' as Filter, label: 'Away for service', n: all.filter((k) => k.status === 'away_for_service').length, icon: Wrench, tone: 'text-slate-600 bg-slate-100' },
    { key: 'attention' as Filter, label: 'Expired', n: all.filter((k) => k.expiry_status === 'expired' && k.status !== 'away_for_service').length, icon: AlertTriangle, tone: 'text-red-600 bg-red-50' },
    { key: 'attention' as Filter, label: 'Due within 30 days', n: all.filter((k) => k.expiry_status === 'due_soon' && k.status !== 'away_for_service').length, icon: Clock, tone: 'text-amber-600 bg-amber-50' },
  ];

  const visible = useMemo(() => {
    const term = q.trim().toLowerCase();
    return all.filter((k) => {
      if (filter === 'attention' && !(k.expiry_status === 'expired' || k.expiry_status === 'due_soon')) return false;
      if (filter !== 'all' && filter !== 'attention' && k.status !== filter) return false;
      if (!term) return true;
      return [k.type_name, k.plant_no, k.vehicle_reg, k.ganger_name].some((v) => v?.toLowerCase().includes(term));
    });
  }, [all, filter, q]);

  const openUpdate = (k: KitItemOverview) =>
    setUpdating({
      source: 'kit', itemId: k.id, itemName: k.type_name, plantNo: k.plant_no, where: assignedTo(k),
      serviceDate: k.service_date, expiryDate: k.expiry_date, canSwap: k.status === 'on_van',
    });

  const actions = (k: KitItemOverview, full = false) => {
    const cls = `${btn.small} ${full ? 'flex-1' : ''}`;
    return (
      <>
        {k.status !== 'away_for_service' && <button type="button" className={cls} onClick={() => openUpdate(k)}>Update</button>}
        {k.status === 'on_van' && <button type="button" className={cls} onClick={() => setSwapping(k)}>Swap</button>}
        {k.status === 'spare' && <button type="button" className={cls} onClick={() => setAssigning({ item: k, back: false })}>Assign to van</button>}
        {k.status === 'away_for_service' && <button type="button" className={cls} onClick={() => setAssigning({ item: k, back: true })}>Back from service</button>}
        {k.status !== 'on_van' && <button type="button" className={cls} onClick={() => setRemoving(k)}>Remove</button>}
      </>
    );
  };

  if (kit === null) return <LoadingSpinner />;

  return (
    <div className="space-y-5">
      <TestModeBanner />
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p className="text-sm text-slate-600">Every item of kit and where it is. Audits add kit here automatically.</p>
        <button type="button" className={btn.primary} onClick={() => setAdding(true)}>
          <Plus className="h-4 w-4" />Add kit
        </button>
      </div>

      <ErrorNote message={error} />

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {tiles.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.label}
              type="button"
              onClick={() => setFilter(t.key)}
              className={`${card} p-3 text-left min-h-[72px] hover:border-slate-300 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500`}
            >
              <div className="flex items-center gap-2">
                <span className={`p-1.5 rounded-lg ${t.tone}`}><Icon className="h-4 w-4" /></span>
                <span className="text-xl font-bold text-slate-900">{t.n}</span>
              </div>
              <p className="text-xs font-semibold text-slate-600 mt-1">{t.label}</p>
            </button>
          );
        })}
      </div>

      <section className={card}>
        <div className="px-4 sm:px-5 py-3 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center gap-3 justify-between">
          <div role="tablist" aria-label="Filter kit" className="flex flex-wrap gap-1 bg-slate-100 p-1 rounded-lg self-start">
            {([
              ['all', 'All'],
              ['on_van', 'On vans'],
              ['spare', 'Spares'],
              ['away_for_service', 'Away for service'],
              ['attention', 'Expired or due'],
            ] as [Filter, string][]).map(([v, l]) => (
              <button key={v} type="button" role="tab" aria-selected={filter === v} onClick={() => setFilter(v)}
                className={`min-h-[40px] px-3 rounded-md text-xs font-semibold cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${filter === v ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>
                {l}
              </button>
            ))}
          </div>
          <div className="relative lg:w-72">
            <label htmlFor="kit-search" className="sr-only">Search by item, plant no or van</label>
            <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input id="kit-search" className={`${inputCls} pl-9`} placeholder="Search item, plant no or van" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>

        {visible.length === 0 ? (
          <p className="px-5 py-8 text-sm text-slate-600">{all.length === 0 ? 'No kit recorded yet. Add kit, or submit an audit.' : 'No kit matches.'}</p>
        ) : (
          <>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200">
                    <th className="px-5 py-3">Item</th>
                    <th className="px-3 py-3">Plant no</th>
                    <th className="px-3 py-3">Assigned to</th>
                    <th className="px-3 py-3">Service</th>
                    <th className="px-3 py-3">Expiry</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-3 py-3">Last seen</th>
                    <th className="px-5 py-3 text-right"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {visible.map((k) => (
                    <tr key={k.id}>
                      <td className="px-5 py-3 font-semibold text-slate-900"><span className="inline-flex items-center gap-2">{k.type_name}<TestTag show={k.is_test} /></span></td>
                      <td className="px-3 py-3 text-slate-700">{k.plant_no ?? '—'}</td>
                      <td className="px-3 py-3 text-slate-700">{assignedTo(k)}</td>
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
            <div className="md:hidden">
              {groupKitForPhone(visible).map((g) => (
                <div key={g.title}>
                  <h3 className="px-4 pt-4 pb-1 text-xs font-bold text-slate-500 uppercase tracking-wider">{g.title}</h3>
                  <ul className="divide-y divide-slate-200">
                    {g.items.map((k) => (
                      <li key={k.id} className="px-4 py-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-slate-900 flex items-center gap-2">{k.type_name}<TestTag show={k.is_test} /></p>
                            <p className="text-xs text-slate-600 mt-0.5">{k.plant_no ?? 'No plant no'} · expiry {formatDate(k.expiry_date)}</p>
                            <p className="text-xs text-slate-500 mt-0.5">Last seen {lastSeen(k)}</p>
                          </div>
                          <ExpiryPill expiry={k.expiry_date} />
                        </div>
                        <div className="flex gap-2 mt-3">{actions(k, true)}</div>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      <VanKitLists vehicles={vehicles} employees={employees} kitTypes={kitTypes} lists={lists} onChanged={load} onError={setError} />

      {adding && (
        <AddKitSheet mode="page" kitTypes={kitTypes} vehicles={vehicles} onClose={() => setAdding(false)} onSaved={done}
          onTypeCreated={(t) => setKitTypes((ts) => [...ts, t])} />
      )}
      {updating && (
        <UpdateItemSheet target={updating} onClose={() => setUpdating(null)} onSaved={done}
          onSwap={() => {
            const k = all.find((x) => x.id === updating.itemId) ?? null;
            setUpdating(null);
            setSwapping(k);
          }} />
      )}
      {swapping && <SwapKitSheet item={swapping} vehicles={vehicles} onClose={() => setSwapping(null)} onSaved={done} />}
      {assigning && <AssignSheet {...assigning} vehicles={vehicles} onClose={() => setAssigning(null)} onSaved={done} />}
      {removing && <RemoveSheet item={removing} onClose={() => setRemoving(null)} onSaved={done} />}
    </div>
  );
};

function AssignSheet({ item, back, vehicles, onClose, onSaved }: { item: KitItemOverview; back: boolean; vehicles: VanRow[]; onClose: () => void; onSaved: () => void }) {
  const [to, setTo] = useState<'spare' | 'on_van'>(back ? 'spare' : 'on_van');
  const [van, setVan] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    if (to === 'on_van' && !van) return setError('Pick a van.');
    setBusy(true);
    try {
      await moveKit(item.id, to, to === 'on_van' ? van : null, null, note.trim() || null);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
      setBusy(false);
    }
  };
  return (
    <Sheet title={back ? `Back from service: ${item.type_name}` : `Assign ${item.type_name} to a van`} subtitle={item.plant_no ?? undefined} onClose={onClose}
      footer={<><button type="button" className={btn.secondary} onClick={onClose}>Cancel</button><button type="button" className={btn.primary} disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button></>}>
      {back && (
        <fieldset>
          <legend className="block text-xs font-semibold text-slate-600 mb-2">Where does it go now?</legend>
          <div className="grid grid-cols-2 gap-2">
            {([['spare', 'Spare in yard'], ['on_van', 'Onto a van']] as const).map(([v, l]) => (
              <label key={v} className={`flex items-center gap-2 min-h-[44px] px-3 rounded-lg border cursor-pointer text-sm font-medium ${to === v ? 'border-blue-500 bg-blue-50' : 'border-slate-200'}`}>
                <input type="radio" checked={to === v} onChange={() => setTo(v)} className="h-4 w-4" />{l}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {to === 'on_van' && (
        <Field label="Van">
          {(id) => (
            <select id={id} className={inputCls} value={van} onChange={(e) => setVan(e.target.value)}>
              <option value="">Pick a van…</option>
              {vehicles.map((v) => <option key={v.id} value={v.id}>{v.registration_number}</option>)}
            </select>
          )}
        </Field>
      )}
      <Field label="Note (optional)">{(id) => <input id={id} className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
      <ErrorNote message={error} />
    </Sheet>
  );
}

function RemoveSheet({ item, onClose, onSaved }: { item: KitItemOverview; onClose: () => void; onSaved: () => void }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Sheet title={`Remove ${item.type_name} ${item.plant_no ?? ''}?`} subtitle="It leaves the Kit & Plant list. Its history is kept." onClose={onClose}
      footer={<>
        <button type="button" className={btn.secondary} onClick={onClose}>Keep it</button>
        <button type="button" className={btn.danger} disabled={busy} onClick={async () => {
          setBusy(true);
          try {
            await moveKit(item.id, 'removed', null, null, note.trim() || null);
            onSaved();
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not remove.');
            setBusy(false);
          }
        }}>{busy ? 'Removing…' : 'Remove kit'}</button>
      </>}>
      <Field label="Reason (optional)">{(id) => <input id={id} className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Scrapped, beyond repair" />}</Field>
      <ErrorNote message={error} />
    </Sheet>
  );
}

/** Which kit types each van carries / doesn't carry. Also set from the audit. */
function VanKitLists({ vehicles, employees, kitTypes, lists, onChanged, onError }: {
  vehicles: VanRow[]; employees: StaffRow[]; kitTypes: KitType[]; lists: KitVanKitListRow[];
  onChanged: () => void; onError: (m: string | null) => void;
}) {
  const [vanId, setVanId] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const van = vehicles.find((v) => v.id === vanId);
  const ganger = employees.find((e) => e.role === 'Ganger' && e.assigned_vehicle_id === vanId);
  const notCarried = new Set(lists.filter((l) => l.vehicle_id === vanId && !l.carried).map((l) => l.kit_type_id));

  const toggle = async (t: KitType) => {
    setBusy(t.id);
    onError(null);
    try {
      await setVanCarried(vanId, t.id, notCarried.has(t.id), TEST_MODE);
      onChanged();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Could not update the van kit list.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className={card} aria-labelledby="vkl-h">
      <div className="px-4 sm:px-5 py-3 border-b border-slate-200">
        <h2 id="vkl-h" className="text-base font-bold text-slate-900">Van kit lists</h2>
        <p className="text-xs text-slate-600">Which kit each van carries. “Not carried” is not a fail; it shows greyed in the audit.</p>
      </div>
      <div className="p-4 sm:p-5 space-y-4">
        <Field label="Van" className="sm:max-w-xs">
          {(id) => (
            <select id={id} className={inputCls} value={vanId} onChange={(e) => setVanId(e.target.value)}>
              <option value="">Pick a van…</option>
              {vehicles.map((v) => <option key={v.id} value={v.id}>{v.registration_number}</option>)}
            </select>
          )}
        </Field>
        {van && (
          <>
            <p className="text-sm text-slate-700">{ganger ? `${ganger.full_name} · ` : ''}{van.registration_number}</p>
            <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
              {kitTypes.map((t) => {
                const carried = !notCarried.has(t.id);
                return (
                  <li key={t.id}>
                    <button type="button" aria-pressed={carried} disabled={busy === t.id} onClick={() => toggle(t)}
                      className={`w-full min-h-[44px] px-3 rounded-lg border text-sm font-medium flex items-center justify-between gap-2 cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${carried ? 'border-green-200 bg-green-50 text-green-800' : 'border-slate-200 bg-slate-50 text-slate-500'}`}>
                      <span>{t.name}</span>
                      <span className="inline-flex items-center gap-1 text-xs font-semibold">
                        {carried ? <><Check className="h-3.5 w-3.5" />Carried</> : <><Ban className="h-3.5 w-3.5" />Not carried</>}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}

