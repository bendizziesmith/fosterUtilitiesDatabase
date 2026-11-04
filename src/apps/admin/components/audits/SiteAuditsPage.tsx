import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardPlus, ClipboardList, Wrench, ArrowRight, AlertTriangle, CheckCircle2, History } from 'lucide-react';
import { LoadingSpinner } from '../../../../components/LoadingSpinner';
import { listAttention, listRecentUpdates, listKit } from '../../../../lib/siteAuditService';
import { AttentionRow, AttentionTab, filterAttention, sortAttention, formatExpiryStatus } from '../../../../lib/siteAuditLogic';
import { KitItemOverview, KitRecentUpdate } from '../../../../lib/supabase';
import { UpdateItemSheet, UpdateTarget } from './UpdateItemSheet';
import { SwapKitSheet } from './SwapKitSheet';
import { FileLink } from './FileLink';
import { useAuditRef, useFileDeletions } from './useAuditRef';
import { kitUpdateTarget, monthsForType, ppeUpdateTarget } from './updateTargets';
import { ErrorNote, TestModeBanner, TestTag } from './ui';
import { btn, card, formatDate, formatDateTime, ACTION_LABEL } from './styles';

function StatusText({ r }: { r: AttentionRow }) {
  const expired = r.expiry_status === 'expired';
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border whitespace-nowrap ${expired ? 'bg-red-50 text-red-700 border-red-200' : 'bg-amber-50 text-amber-800 border-amber-200'}`}>
      {expired ? 'Expired · ' : ''}{formatExpiryStatus(r.days_left)}
    </span>
  );
}

export const SiteAuditsPage: React.FC = () => {
  const navigate = useNavigate();
  const [rows, setRows] = useState<AttentionRow[] | null>(null);
  const [recent, setRecent] = useState<KitRecentUpdate[]>([]);
  const [kit, setKit] = useState<KitItemOverview[]>([]);
  const ref = useAuditRef();
  const { deletions, reload: reloadDeletions } = useFileDeletions();
  const [tab, setTab] = useState<AttentionTab>('all');
  const [updating, setUpdating] = useState<UpdateTarget | null>(null);
  const [swapping, setSwapping] = useState<KitItemOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [a, r, k] = await Promise.all([listAttention(), listRecentUpdates(8), listKit()]);
      setRows(sortAttention(a));
      setRecent(r);
      setKit(k);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load audits.');
      setRows([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const kitFor = (r: AttentionRow) => (r.source === 'kit' ? kit.find((k) => k.id === r.item_id) ?? null : null);
  const where = (r: AttentionRow) =>
    r.source === 'kit' && r.kit_status === 'spare' ? 'Spare · Yard' : ref.vanLabel(r.vehicle_id, r.vehicle_reg);
  const vanKey = (r: AttentionRow) => (r.source === 'kit' && r.kit_status === 'spare' ? null : ref.keyForVan(r.vehicle_id));
  const whereCell = (r: AttentionRow) => {
    const key = vanKey(r);
    return key ? (
      <button type="button" onClick={() => navigate(`/kit/van?key=${encodeURIComponent(key)}`)} className="text-left font-medium text-blue-700 hover:underline cursor-pointer min-h-[44px] sm:min-h-[36px] rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">{where(r)}</button>
    ) : (
      <span>{where(r)}</span>
    );
  };
  const openUpdate = (r: AttentionRow) => {
    const k = kitFor(r);
    if (r.source === 'kit' && k) setUpdating(kitUpdateTarget(k, ref.kitTypes, ref.vanLabel));
    else setUpdating(ppeUpdateTarget({ id: r.item_id, item_name: r.item_name, expiry_date: r.expiry_date, vehicle_id: r.vehicle_id, vehicle_reg: r.vehicle_reg }, ref.checklist, ref.vanLabel));
  };
  const done = () => {
    setUpdating(null);
    setSwapping(null);
    load();
  };

  const visible = rows ? filterAttention(rows, tab) : [];
  const counts = {
    all: rows?.length ?? 0,
    expired: rows?.filter((r) => r.expiry_status === 'expired').length ?? 0,
    due: rows?.filter((r) => r.expiry_status === 'due_soon').length ?? 0,
  };

  const links = [
    { title: 'New audit', sub: 'Audit a gang or van on site', icon: ClipboardPlus, path: '/audits/new', primary: true },
    { title: 'Audit records', sub: 'Every audit, newest first', icon: ClipboardList, path: '/audits/records' },
    { title: 'Kit & Plant list', sub: 'All kit and where it is', icon: Wrench, path: '/kit' },
  ];

  return (
    <div className="space-y-6">
      <TestModeBanner />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {links.map((l) => {
          const Icon = l.icon;
          return (
            <button
              key={l.path}
              type="button"
              onClick={() => navigate(l.path)}
              className={`group rounded-xl p-4 text-left min-h-[64px] transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${l.primary ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm' : 'bg-white border border-slate-200 hover:border-blue-300 hover:shadow-md'}`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${l.primary ? 'bg-white/20' : 'bg-blue-50'}`}>
                    <Icon className={`h-5 w-5 ${l.primary ? 'text-white' : 'text-blue-600'}`} />
                  </div>
                  <div>
                    <h3 className={`text-sm font-bold ${l.primary ? 'text-white' : 'text-slate-900'}`}>{l.title}</h3>
                    <p className={`text-xs mt-0.5 ${l.primary ? 'text-blue-100' : 'text-slate-500'}`}>{l.sub}</p>
                  </div>
                </div>
                <ArrowRight className={`h-4 w-4 ${l.primary ? 'text-white' : 'text-slate-300 group-hover:text-blue-500'}`} />
              </div>
            </button>
          );
        })}
      </div>

      <ErrorNote message={error} />

      <section className={card} aria-labelledby="attention-h">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 sm:px-5 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            <h2 id="attention-h" className="text-base font-bold text-slate-900">Needs attention</h2>
            <span className="text-xs text-slate-500">Kit and PPE expired or due within 30 days</span>
          </div>
          <div role="tablist" aria-label="Filter" className="flex gap-1 bg-slate-100 p-1 rounded-lg self-start">
            {([
              ['all', `All (${counts.all})`],
              ['expired', `Expired (${counts.expired})`],
              ['due', `Due within 30 days (${counts.due})`],
            ] as [AttentionTab, string][]).map(([v, l]) => (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={tab === v}
                onClick={() => setTab(v)}
                className={`min-h-[40px] px-3 rounded-md text-xs font-semibold cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${tab === v ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>

        {rows === null ? (
          <LoadingSpinner />
        ) : visible.length === 0 ? (
          <div className="flex items-center gap-2 px-5 py-8 text-sm text-slate-600">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            Nothing {tab === 'expired' ? 'expired' : tab === 'due' ? 'due within 30 days' : 'needs attention'}.
          </div>
        ) : (
          <>
            {/* desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200">
                    <th className="px-5 py-3">Item</th>
                    <th className="px-3 py-3">Section</th>
                    <th className="px-3 py-3">Plant no</th>
                    <th className="px-3 py-3">Gang / van</th>
                    <th className="px-3 py-3">Expiry</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-5 py-3 text-right"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {visible.map((r) => (
                    <tr key={`${r.source}:${r.item_id}`}>
                      <td className="px-5 py-3 font-semibold text-slate-900">
                        <span className="inline-flex items-center gap-2">{r.item_name}<TestTag show={r.is_test} /></span>
                      </td>
                      <td className="px-3 py-3 text-slate-700">{r.source === 'kit' ? 'Kit' : 'PPE'}</td>
                      <td className="px-3 py-3 text-slate-700">{r.plant_no ?? '—'}</td>
                      <td className="px-3 py-3 text-slate-700">{whereCell(r)}</td>
                      <td className="px-3 py-3 text-slate-700 whitespace-nowrap">{formatDate(r.expiry_date)}</td>
                      <td className="px-3 py-3"><StatusText r={r} /></td>
                      <td className="px-5 py-3">
                        <div className="flex justify-end gap-2">
                          <button type="button" className={btn.small} onClick={() => openUpdate(r)}>Update</button>
                          {r.source === 'kit' && r.kit_status === 'on_van' && (
                            <button type="button" className={btn.small} onClick={() => setSwapping(kitFor(r))}>Swap</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* phone cards */}
            <ul className="md:hidden divide-y divide-slate-200">
              {visible.map((r) => (
                <li key={`${r.source}:${r.item_id}`} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-900 flex items-center gap-2">
                        {r.item_name}
                        <span className="text-xs font-semibold text-slate-500">{r.source === 'kit' ? 'Kit' : 'PPE'}</span>
                        <TestTag show={r.is_test} />
                      </p>
                      <p className="text-xs text-slate-600 mt-0.5">{r.plant_no && <>{r.plant_no} · </>}{whereCell(r)}</p>
                      <p className="text-xs text-slate-600 mt-0.5">Expiry {formatDate(r.expiry_date)}</p>
                    </div>
                    <StatusText r={r} />
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button type="button" className={`${btn.small} flex-1`} onClick={() => openUpdate(r)}>Update</button>
                    {r.source === 'kit' && r.kit_status === 'on_van' && (
                      <button type="button" className={`${btn.small} flex-1`} onClick={() => setSwapping(kitFor(r))}>Swap</button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className={card} aria-labelledby="recent-h">
        <div className="flex items-center gap-2 px-4 sm:px-5 py-4 border-b border-slate-200">
          <History className="h-5 w-5 text-slate-500" />
          <h2 id="recent-h" className="text-base font-bold text-slate-900">Recently updated</h2>
        </div>
        {recent.length === 0 ? (
          <p className="px-5 py-6 text-sm text-slate-600">No updates yet.</p>
        ) : (
          <ul className="divide-y divide-slate-200">
            {recent.map((u) => (
              <li key={u.id} className="px-4 sm:px-5 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                <div className="min-w-0">
                  <p className="text-sm text-slate-900 flex flex-wrap items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
                    <span className="font-semibold">{u.item_name ?? 'Item'}</span>
                    {u.plant_no && <span className="text-slate-600">{u.plant_no}</span>}
                    <span className="text-slate-600">· {ACTION_LABEL[u.action] ?? u.action}</span>
                    {u.vehicle_reg && <span className="text-slate-600">· {u.vehicle_reg}</span>}
                    <TestTag show={u.is_test} />
                  </p>
                  {u.note && <p className="text-xs text-slate-600 ml-6 mt-0.5">{u.note}</p>}
                  {u.certificate_path && <div className="ml-6"><FileLink path={u.certificate_path} kind="Certificate" deletions={deletions} onDeleted={reloadDeletions} /></div>}
                </div>
                <p className="text-xs text-slate-500 ml-6 sm:ml-0 whitespace-nowrap">{u.by_name ?? 'Unknown'} · {formatDateTime(u.created_at)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {updating && <UpdateItemSheet target={updating} targets={ref.allTargets} onClose={() => setUpdating(null)} onSaved={done} />}
      {swapping && (
        <SwapKitSheet item={swapping} targets={ref.allTargets} months={monthsForType(ref.kitTypes, swapping.kit_type_id)} onClose={() => setSwapping(null)} onSaved={done} />
      )}
    </div>
  );
};
