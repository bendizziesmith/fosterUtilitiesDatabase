import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Users, Truck, ClipboardPlus, Plus, History, Ban, Check, ShieldCheck, Wrench, ArrowRight } from 'lucide-react';
import { LoadingSpinner } from '../../../../components/LoadingSpinner';
import {
  listKit, listPpeForVan, lastAudit, listVanHistory, loadTeam, listVanKitLists, setVanCarried,
} from '../../../../lib/siteAuditService';
import { TeamMember } from '../../../../lib/siteAuditLogic';
import { AuditPpeItem, KitItemOverview, KitRecentUpdate, KitVanKitListRow, SiteAuditSummary, KitType } from '../../../../lib/supabase';
import { useAuditRef, useFileDeletions } from './useAuditRef';
import { UpdateItemSheet, UpdateTarget } from './UpdateItemSheet';
import { SwapKitSheet } from './SwapKitSheet';
import { AddKitSheet } from './AddKitSheet';
import { FileLink } from './FileLink';
import { kitUpdateTarget, monthsForType, ppeUpdateTarget } from './updateTargets';
import { CountBadge, ErrorNote, ExpiryPill, TestModeBanner, TestTag } from './ui';
import { btn, card, formatDate, formatDateTime, ACTION_LABEL, TEST_MODE } from './styles';

export const GangVanView: React.FC = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const key = params.get('key') ?? '';
  const ref = useAuditRef();
  const { deletions, reload: reloadDeletions } = useFileDeletions();
  const target = ref.allTargets.find((t) => t.key === key);
  const vehicleId = target?.vehicleId ?? null;

  const [members, setMembers] = useState<TeamMember[]>([]);
  const [kit, setKit] = useState<KitItemOverview[] | null>(null);
  const [ppe, setPpe] = useState<AuditPpeItem[]>([]);
  const [lists, setLists] = useState<KitVanKitListRow[]>([]);
  const [last, setLast] = useState<SiteAuditSummary | null>(null);
  const [history, setHistory] = useState<KitRecentUpdate[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState<UpdateTarget | null>(null);
  const [swapping, setSwapping] = useState<KitItemOverview | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    if (!target) return;
    setError(null);
    try {
      const ganger = target.gangerId ? ref.employees.find((e) => e.id === target.gangerId) ?? null : null;
      const [team, allKit, ppeRows, vkl, lastA, hist] = await Promise.all([
        loadTeam(ganger, ref.employees),
        vehicleId ? listKit() : Promise.resolve([] as KitItemOverview[]),
        vehicleId ? listPpeForVan(vehicleId) : Promise.resolve([] as AuditPpeItem[]),
        vehicleId ? listVanKitLists() : Promise.resolve([] as KitVanKitListRow[]),
        lastAudit({ gangerId: target.gangerId, vehicleId }),
        vehicleId ? listVanHistory(vehicleId) : Promise.resolve([] as KitRecentUpdate[]),
      ]);
      setMembers(team);
      setKit(allKit.filter((k) => k.status === 'on_van' && k.vehicle_id === vehicleId));
      setPpe(ppeRows);
      setLists(vkl.filter((l) => l.vehicle_id === vehicleId));
      setLast(lastA);
      setHistory(hist);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load this gang / van.');
      setKit([]);
    }
  }, [target, vehicleId, ref.employees]);

  useEffect(() => {
    load();
  }, [load]);

  const done = () => {
    setUpdating(null);
    setSwapping(null);
    setAdding(false);
    load();
  };

  if (!ref.loaded) return <LoadingSpinner />;
  if (!target) return <ErrorNote message="That gang or van wasn’t found. It may have been removed from Vehicle Management." />;

  const notCarried = new Set(lists.filter((l) => !l.carried).map((l) => l.kit_type_id));
  const expired = (kit ?? []).filter((k) => k.expiry_status === 'expired').length;
  const dueSoon = (kit ?? []).filter((k) => k.expiry_status === 'due_soon').length;

  return (
    <div className="space-y-5 max-w-5xl mx-auto">
      <TestModeBanner />
      <ErrorNote message={error ?? ref.error} />

      <section className={`${card} p-4 sm:p-5`}>
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              {target.gangerId ? <Users className="h-5 w-5 text-slate-500" /> : <Truck className="h-5 w-5 text-slate-500" />}
              {target.label}
            </h2>
            <dl className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
              <div><dt className="text-xs font-semibold text-slate-500">Ganger</dt><dd className="text-slate-900 font-medium">{target.gangerName ?? 'None (standalone van)'}</dd></div>
              <div><dt className="text-xs font-semibold text-slate-500">Van reg</dt><dd className="text-slate-900 font-medium">{target.reg ?? 'No van assigned'}</dd></div>
              <div>
                <dt className="text-xs font-semibold text-slate-500">Last audit</dt>
                <dd>
                  {last ? (
                    <button type="button" onClick={() => navigate(`/audits/detail?id=${last.id}`)} className="inline-flex items-center gap-1 min-h-[44px] sm:min-h-0 text-sm font-semibold text-blue-700 hover:underline cursor-pointer">
                      {formatDate(last.audit_date)}<ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  ) : <span className="text-slate-600">No audit yet</span>}
                </dd>
              </div>
              <div className="sm:col-span-3">
                <dt className="text-xs font-semibold text-slate-500">This week’s members</dt>
                <dd className="text-slate-900">{members.map((m) => m.name).join(', ') || '—'}</dd>
              </div>
            </dl>
          </div>
          <div className="flex flex-col sm:items-end gap-2 sm:flex-shrink-0">
            <button type="button" className={btn.primary} onClick={() => navigate(`/audits/new?target=${encodeURIComponent(target.key)}`)}>
              <ClipboardPlus className="h-4 w-4" />New audit for this {target.gangerId ? 'gang' : 'van'}
            </button>
            {vehicleId && (
              <button type="button" className={btn.secondary} onClick={() => setAdding(true)}>
                <Plus className="h-4 w-4" />Add kit to this van
              </button>
            )}
          </div>
        </div>
        {vehicleId && (
          <div className="flex flex-wrap gap-2 mt-4">
            <CountBadge n={kit?.length ?? 0} label="kit items" tone="slate" />
            {expired > 0 && <CountBadge n={expired} label="expired" tone="red" />}
            {dueSoon > 0 && <CountBadge n={dueSoon} label="due soon" tone="amber" />}
          </div>
        )}
      </section>

      {!vehicleId ? (
        <p className={`${card} p-5 text-sm text-slate-600`}>This gang has no van assigned, so it has no kit. Assign a van in Vehicle Management.</p>
      ) : (
        <>
          <section className={card} aria-labelledby="gv-kit">
            <div className="px-4 sm:px-5 py-3 border-b border-slate-200 flex items-center gap-2">
              <Wrench className="h-5 w-5 text-violet-600" />
              <h2 id="gv-kit" className="text-base font-bold text-slate-900">Kit on this van</h2>
            </div>
            {kit === null ? <LoadingSpinner /> : kit.length === 0 ? (
              <p className="px-5 py-6 text-sm text-slate-600">No kit recorded on this van yet.</p>
            ) : (
              <ul className="divide-y divide-slate-200">
                {kit.map((k) => (
                  <li key={k.id} className="px-4 sm:px-5 py-3 flex flex-col md:flex-row md:items-center gap-2 md:gap-4">
                    <div className="md:w-48 min-w-0">
                      <p className="text-sm font-bold text-slate-900 flex items-center gap-2">{k.type_name}<TestTag show={k.is_test} /></p>
                      <p className="text-xs text-slate-600">{k.plant_no ?? 'No plant no'}</p>
                    </div>
                    <p className="text-xs text-slate-600 md:w-40">Service {formatDate(k.service_date)}</p>
                    <p className="text-xs text-slate-600 md:w-40">Expiry {formatDate(k.expiry_date)}</p>
                    <div className="md:flex-1"><ExpiryPill expiry={k.expiry_date} /></div>
                    <div className="flex gap-2">
                      <button type="button" className={`${btn.small} flex-1 md:flex-none`} onClick={() => setUpdating(kitUpdateTarget(k, ref.kitTypes, ref.vanLabel))}>Update</button>
                      <button type="button" className={`${btn.small} flex-1 md:flex-none`} onClick={() => setSwapping(k)}>Swap</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className={card} aria-labelledby="gv-ppe">
            <div className="px-4 sm:px-5 py-3 border-b border-slate-200 flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-blue-600" />
              <h2 id="gv-ppe" className="text-base font-bold text-slate-900">PPE expiry dates</h2>
              <span className="text-xs text-slate-500">from the latest audit</span>
            </div>
            {ppe.filter((p) => p.expiry_date).length === 0 ? (
              <p className="px-5 py-6 text-sm text-slate-600">No PPE expiry dates recorded.</p>
            ) : (
              <ul className="divide-y divide-slate-200">
                {ppe.filter((p) => p.expiry_date).map((p) => (
                  <li key={p.id} className="px-4 sm:px-5 py-3 flex flex-wrap items-center gap-3">
                    <span className="text-sm font-semibold text-slate-900 flex items-center gap-2 min-w-[8rem]">{p.item_name}<TestTag show={p.is_test} /></span>
                    <span className="text-xs text-slate-600">Expiry {formatDate(p.expiry_date)}</span>
                    <ExpiryPill expiry={p.expiry_date} />
                    <button type="button" className={`${btn.small} ml-auto`} onClick={() => setUpdating(ppeUpdateTarget(p, ref.checklist, ref.vanLabel))}>Update</button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <VanKitList vehicleId={vehicleId} kitTypes={ref.kitTypes} notCarried={notCarried} onChanged={load} onError={setError} />

          <section className={card} aria-labelledby="gv-hist">
            <div className="px-4 sm:px-5 py-3 border-b border-slate-200 flex items-center gap-2">
              <History className="h-5 w-5 text-slate-500" />
              <h2 id="gv-hist" className="text-base font-bold text-slate-900">Recent kit history</h2>
            </div>
            {history.length === 0 ? (
              <p className="px-5 py-6 text-sm text-slate-600">Nothing yet.</p>
            ) : (
              <ul className="divide-y divide-slate-200">
                {history.map((h) => (
                  <li key={h.id} className="px-4 sm:px-5 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                    <div className="min-w-0">
                      <p className="text-sm text-slate-900 flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{h.item_name}</span>
                        {h.plant_no && <span className="text-slate-600">{h.plant_no}</span>}
                        <span className="text-slate-600">· {ACTION_LABEL[h.action] ?? h.action}</span>
                        <TestTag show={h.is_test} />
                      </p>
                      {h.note && <p className="text-xs text-slate-600 mt-0.5">{h.note}</p>}
                      {h.certificate_path && <FileLink path={h.certificate_path} kind="Certificate" deletions={deletions} onDeleted={reloadDeletions} />}
                    </div>
                    <p className="text-xs text-slate-500 whitespace-nowrap">{h.by_name ?? 'Unknown'} · {formatDateTime(h.created_at)}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      {updating && <UpdateItemSheet target={updating} targets={ref.allTargets} onClose={() => setUpdating(null)} onSaved={done} />}
      {swapping && (
        <SwapKitSheet item={swapping} targets={ref.allTargets} months={monthsForType(ref.kitTypes, swapping.kit_type_id)} onClose={() => setSwapping(null)} onSaved={done} />
      )}
      {adding && (
        <AddKitSheet mode="page" kitTypes={ref.kitTypes} targets={ref.allTargets} defaultVehicleId={vehicleId}
          onClose={() => setAdding(false)} onSaved={done} onTypeCreated={(t) => ref.setKitTypes((ts) => [...ts, t])} />
      )}
    </div>
  );
};

/** Which kit types this van carries. "Not carried" is not a fail; it shows greyed in the audit. */
function VanKitList({ vehicleId, kitTypes, notCarried, onChanged, onError }: {
  vehicleId: string; kitTypes: KitType[]; notCarried: Set<string>; onChanged: () => void; onError: (m: string | null) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const toggle = async (t: KitType) => {
    setBusy(t.id);
    onError(null);
    try {
      await setVanCarried(vehicleId, t.id, notCarried.has(t.id), TEST_MODE);
      onChanged();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Could not update the van kit list.');
    } finally {
      setBusy(null);
    }
  };
  return (
    <section className={card} aria-labelledby="gv-vkl">
      <div className="px-4 sm:px-5 py-3 border-b border-slate-200">
        <h2 id="gv-vkl" className="text-base font-bold text-slate-900">Van kit list</h2>
        <p className="text-xs text-slate-600">Tap to switch. “Not carried” is not a fail; it shows greyed in the audit.</p>
      </div>
      <ul className="p-4 sm:p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
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
    </section>
  );
}
