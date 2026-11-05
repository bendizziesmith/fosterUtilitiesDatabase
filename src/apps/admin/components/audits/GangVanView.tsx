import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Users, Truck, ClipboardPlus, Plus, History, Ban, Check, ShieldCheck, Wrench, ArrowRight, ArrowLeftRight, AlertTriangle, Info, Warehouse, Undo2, LogOut, CircleOff } from 'lucide-react';
import { LoadingSpinner } from '../../../../components/LoadingSpinner';
import { listKit, lastAudit, listHolderHistory, loadTeam, loadHolderRecord, setCarried, holderParams } from '../../../../lib/siteAuditService';
import { TeamMember, whoName } from '../../../../lib/siteAuditLogic';
import { AuditPpeItem, KitItemOverview, KitRecentUpdate, KitVanKitListRow, SiteAuditSummary, KitType } from '../../../../lib/supabase';
import { useAuditRef, useFileDeletions } from './useAuditRef';
import { UpdateItemSheet, UpdateTarget } from './UpdateItemSheet';
import { SwapKitSheet } from './SwapKitSheet';
import { AddKitSheet } from './AddKitSheet';
import { FileLink } from './FileLink';
import { ChangeVanSheet } from './ChangeVanSheet';
import { ReturnSheet } from './LockupSheets';
import { TakeOutSheet, OffRoadSheet, BackOnRoadSheet } from './FleetSheets';
import { AuditTarget } from '../../../../lib/siteAuditLogic';
import { listLockupMovements, listPersonIssues, LockupMovementRow, PersonIssue } from '../../../../lib/lockupService';
import { kitUpdateTarget, monthsForType, ppeUpdateTarget } from './updateTargets';
import { CountBadge, ErrorNote, ExpiryPill, TestModeBanner, TestTag } from './ui';
import { DownloadMenu } from './DownloadMenu';
import { downloadOneHolder } from '../../../../lib/auditDownloads';
import { useActor } from './useActor';
import { btn, card, formatDate, formatDateTime, ACTION_LABEL, TEST_MODE } from './styles';

/** Old links used gang:<id>; a gang page is now the ganger's page. */
const normaliseKey = (key: string) => (key.startsWith('gang:') ? `person:${key.slice(5)}` : key);

/** One page per holder: a person ("Dom Oliver · YE24 TNL") or a spare van ("WV72 OZL · spare van"). */
export const GangVanView: React.FC = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const key = normaliseKey(params.get('key') ?? '');
  const ref = useAuditRef();
  const { actor: downloadActor } = useActor(ref.auditors);
  const { deletions, reload: reloadDeletions } = useFileDeletions();
  // an off-the-road spare van is left out of the pickers, but its own page still opens
  const target = useMemo<AuditTarget | undefined>(() => {
    const found = ref.allTargets.find((t) => t.key === key);
    if (found) return found;
    const van = key.startsWith('van:') ? ref.vehicles.find((v) => v.id === key.slice(4)) : undefined;
    return van ? {
      key, label: `${van.registration_number} · spare van (off the road)`, kind: 'spare_van', personId: null, personName: null,
      isGanger: false, vehicleId: van.id, reg: van.registration_number, teamName: van.registration_number, offRoad: true,
    } : undefined;
  }, [ref.allTargets, ref.vehicles, key]);
  const person = target?.kind === 'person' ? ref.employees.find((e) => e.id === target.personId) ?? null : null;

  const [members, setMembers] = useState<TeamMember[]>([]);
  const [kit, setKit] = useState<KitItemOverview[] | null>(null);
  const [allKit, setAllKit] = useState<KitItemOverview[]>([]);
  const [ppe, setPpe] = useState<AuditPpeItem[]>([]);
  const [lists, setLists] = useState<KitVanKitListRow[]>([]);
  const [last, setLast] = useState<SiteAuditSummary | null>(null);
  const [history, setHistory] = useState<KitRecentUpdate[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState<UpdateTarget | null>(null);
  const [swapping, setSwapping] = useState<KitItemOverview | null>(null);
  const [adding, setAdding] = useState(false);
  const [changing, setChanging] = useState<'change' | 'check' | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [issues, setIssues] = useState<PersonIssue[]>([]);
  const [issueMoves, setIssueMoves] = useState<LockupMovementRow[]>([]);
  const [returning, setReturning] = useState<PersonIssue | null>(null);
  const [fleet, setFleet] = useState<'takeout' | 'offroad' | 'backon' | null>(null);

  const load = useCallback(async () => {
    if (!target) return;
    setError(null);
    try {
      const ganger = target.isGanger ? ref.employees.find((e) => e.id === target.personId) ?? null : null;
      const pid = target.kind === 'person' ? target.personId : null;
      const [team, record, everyKit, lastA, hist, held, moves] = await Promise.all([
        loadTeam(ganger, ref.employees),
        loadHolderRecord(target),
        listKit(),
        lastAudit(target),
        listHolderHistory(target),
        pid ? listPersonIssues(pid) : Promise.resolve([] as PersonIssue[]),
        pid ? listLockupMovements(pid) : Promise.resolve([] as LockupMovementRow[]),
      ]);
      setIssues(held);
      setIssueMoves(moves.filter((m) => m.kind === 'issued' || m.kind === 'returned').slice(0, 15));
      setMembers(team);
      setKit(record.heldKit);
      setPpe(record.ppe);
      setLists(record.notCarried);
      setAllKit(everyKit);
      setLast(lastA);
      setHistory(hist);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load this record.');
      setKit([]);
    }
  }, [target, ref.employees]);

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
  if (!target) return <ErrorNote message="That person or van wasn’t found. They may have been removed in Employee or Vehicle Management." />;

  const vanChange = person ? ref.vanChanges.find((c) => c.employeeId === person.id) ?? null : null;
  const offRoadRow = target.vehicleId ? ref.offRoadRows.find((r) => r.vehicle_id === target.vehicleId) ?? null : null;
  /** everything on this van: its spare-van kit and kit held by the people on it */
  const kitOnVan = target.vehicleId ? allKit.filter((k) => k.status === 'on_van' && k.vehicle_id === target.vehicleId) : [];
  const vanOnlyLabel = target.reg ? `${target.reg}` : '';
  const notCarried = new Set(lists.filter((l) => !l.carried).map((l) => l.kit_type_id));
  const expired = (kit ?? []).filter((k) => k.expiry_status === 'expired').length;
  const dueSoon = (kit ?? []).filter((k) => k.expiry_status === 'due_soon').length;

  return (
    <div className="space-y-5 max-w-5xl mx-auto">
      <TestModeBanner />
      <ErrorNote message={error ?? ref.error} />
      {flash && (
        <div role="status" className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
          <Info className="h-4 w-4 mt-0.5 flex-shrink-0" /><span>{flash}</span>
        </div>
      )}
      {offRoadRow && (
        <div role="status" className="flex flex-col sm:flex-row sm:items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <span className="flex items-start gap-2"><CircleOff className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span><strong>Off the road</strong> since {formatDate(offRoadRow.off_at.slice(0, 10))}: {offRoadRow.reason === 'broken_down' ? 'broken down' : offRoadRow.reason === 'leaving_fleet' ? 'leaving the fleet' : 'other'}{offRoadRow.note ? ` · ${offRoadRow.note}` : ''} ({whoName(offRoadRow.off_actor_name)})</span></span>
          <button type="button" className={`${btn.secondary} sm:ml-auto`} onClick={() => setFleet('backon')}>Back on the road</button>
        </div>
      )}
      {vanChange && (
        <div role="alert" className="flex flex-col sm:flex-row sm:items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <span className="flex items-start gap-2"><AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span><strong>Van changed: check kit.</strong> {person!.full_name} was on {vanChange.fromVehicleId ? ref.vanLabel(vanChange.fromVehicleId) : 'no van'} and is now on {target.reg}. Their kit went with them; check whether any should stay with the old van.</span></span>
          <button type="button" className={`${btn.secondary} sm:ml-auto`} onClick={() => setChanging('check')}>Check kit</button>
        </div>
      )}

      <section className={`${card} p-4 sm:p-5`}>
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              {target.kind === 'person' ? <Users className="h-5 w-5 text-slate-600" /> : <Truck className="h-5 w-5 text-slate-600" />}
              {target.label}
            </h2>
            <dl className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
              <div><dt className="text-xs font-semibold text-slate-600">{target.isGanger ? 'Ganger' : 'Holder'}</dt><dd className="text-slate-900 font-medium">{target.personName ?? 'Spare van (nobody assigned)'}</dd></div>
              <div><dt className="text-xs font-semibold text-slate-600">Van reg</dt><dd className="text-slate-900 font-medium">{target.reg ?? 'No van assigned'}</dd></div>
              <div>
                <dt className="text-xs font-semibold text-slate-600">Last audit</dt>
                <dd>
                  {last ? (
                    <button type="button" onClick={() => navigate(`/audits/detail?id=${last.id}`)} className="inline-flex items-center gap-1 min-h-[44px] sm:min-h-0 text-sm font-semibold text-blue-700 hover:underline cursor-pointer">
                      {formatDate(last.audit_date)} · {whoName(last.auditor_name)}<ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  ) : <span className="text-slate-600">No audit yet</span>}
                </dd>
              </div>
              {target.isGanger && (
                <div className="sm:col-span-3">
                  <dt className="text-xs font-semibold text-slate-600">This week’s members</dt>
                  <dd className="text-slate-900">{members.map((m) => m.name).join(', ') || '—'}</dd>
                </div>
              )}
            </dl>
          </div>
        </div>
        {/* one primary action, then short secondary ones in an even grid */}
        <div className="mt-4 pt-4 border-t border-slate-200 flex flex-col lg:flex-row lg:items-center gap-2">
          {(target.kind === 'spare_van' || target.vehicleId) && (
            <button type="button" className={`${btn.primary} lg:order-last lg:ml-auto`} onClick={() => navigate(`/audits/new?target=${encodeURIComponent(target.key)}`)}>
              <ClipboardPlus className="h-4 w-4" aria-hidden="true" />New audit
            </button>
          )}
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
            <button type="button" className={btn.secondary} onClick={() => setAdding(true)}>
              <Plus className="h-4 w-4" aria-hidden="true" />Add kit
            </button>
            <DownloadMenu choices={[{ title: 'Download', kind: 'pdf', run: () => downloadOneHolder(target.label, kit ?? [], ppe, whoName(downloadActor?.name)) }]} />
            {person && (
              <button type="button" className={btn.secondary} onClick={() => setChanging('change')}>
                <ArrowLeftRight className="h-4 w-4" aria-hidden="true" />Change van
              </button>
            )}
            {person && target.vehicleId && (
              <button type="button" className={btn.secondary} onClick={() => setFleet('takeout')}>
                <LogOut className="h-4 w-4" aria-hidden="true" />Take out of van
              </button>
            )}
            {target.vehicleId && !offRoadRow && (
              <button type="button" className={btn.secondary} onClick={() => setFleet('offroad')}>
                <CircleOff className="h-4 w-4" aria-hidden="true" />Off the road
              </button>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 mt-4">
          <CountBadge n={kit?.length ?? 0} label="kit items" tone="slate" />
          {expired > 0 && <CountBadge n={expired} label="expired" tone="red" />}
          {dueSoon > 0 && <CountBadge n={dueSoon} label="due soon" tone="amber" />}
        </div>
      </section>

      <section className={card} aria-labelledby="gv-kit">
        <div className="px-4 sm:px-5 py-3 border-b border-slate-200 flex items-center gap-2">
          <Wrench className="h-5 w-5 text-violet-600" />
          <h2 id="gv-kit" className="text-base font-bold text-slate-900">Kit {target.kind === 'person' ? `${target.personName} holds` : 'on this spare van'}</h2>
        </div>
        {kit === null ? <LoadingSpinner /> : kit.length === 0 ? (
          <p className="px-5 py-6 text-base sm:text-sm text-slate-600">No kit recorded yet.</p>
        ) : (
          <ul className="divide-y divide-slate-200">
            {kit.map((k) => (
              <li key={k.id} className="px-4 sm:px-5 py-3 flex flex-col md:flex-row md:items-center gap-2 md:gap-4">
                <div className="md:w-48 min-w-0">
                  <p className="text-base sm:text-sm font-bold text-slate-900 flex items-center gap-2">{k.type_name}<TestTag show={k.is_test} /></p>
                  <p className="text-xs text-slate-600">{k.plant_no ?? 'No plant no'}</p>
                </div>
                <p className="text-xs text-slate-600 md:w-40">Service {formatDate(k.service_date)}</p>
                <p className="text-xs text-slate-600 md:w-40">Expiry {formatDate(k.expiry_date)}</p>
                <div className="md:flex-1"><ExpiryPill expiry={k.expiry_date} /></div>
                <div className="flex gap-2">
                  <button type="button" className={`${btn.small} flex-1 md:flex-none`} onClick={() => setUpdating(kitUpdateTarget(k, ref.kitTypes))}>Update</button>
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
          <h2 id="gv-ppe" className="text-base font-bold text-slate-900">PPE and H&S expiry dates</h2>
          <span className="text-xs text-slate-600">from the latest audit or update</span>
        </div>
        {ppe.filter((p) => p.expiry_date).length === 0 ? (
          <p className="px-5 py-6 text-base sm:text-sm text-slate-600">No PPE or H&S expiry dates recorded.</p>
        ) : (
          <ul className="divide-y divide-slate-200">
            {ppe.filter((p) => p.expiry_date).map((p) => (
              <li key={p.id} className="px-4 sm:px-5 py-3 flex flex-wrap items-center gap-3">
                <span className="text-base sm:text-sm font-semibold text-slate-900 flex items-center gap-2 min-w-[8rem]">{p.item_name}<TestTag show={p.is_test} /></span>
                <span className="text-xs text-slate-600">Expiry {formatDate(p.expiry_date)}</span>
                <ExpiryPill expiry={p.expiry_date} />
                <button type="button" className={`${btn.small} ml-auto`} onClick={() => setUpdating(ppeUpdateTarget(p, target.label, ref.checklist))}>Update</button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {target.kind === 'person' && (
        <section className={card} aria-labelledby="gv-lockup">
          <div className="px-4 sm:px-5 py-3 border-b border-slate-200 flex items-center gap-2">
            <Warehouse className="h-5 w-5 text-violet-600" />
            <h2 id="gv-lockup" className="text-base font-bold text-slate-900">Issued from Yard Lockup</h2>
          </div>
          {issues.length === 0 && issueMoves.length === 0 ? (
            <p className="px-5 py-6 text-base sm:text-sm text-slate-600">Nothing issued from the Yard Lockup.</p>
          ) : (
            <>
              <ul className="divide-y divide-slate-200">
                {issues.map((i) => (
                  <li key={i.stock_id} className="px-4 sm:px-5 py-3 flex flex-wrap items-center gap-3">
                    <span className="text-base sm:text-sm font-semibold text-slate-900 flex items-center gap-2 min-w-[8rem]">{i.item_name}<TestTag show={i.is_test} /></span>
                    <span className="text-base sm:text-sm text-slate-700">Holds {i.quantity_held}</span>
                    {i.last_issued_at && <span className="text-xs text-slate-600">last issued {formatDate(i.last_issued_at.slice(0, 10))}</span>}
                    <button type="button" className={`${btn.small} ml-auto`} onClick={() => setReturning(i)}>
                      <Undo2 className="h-3.5 w-3.5" />Return to lockup
                    </button>
                  </li>
                ))}
              </ul>
              {issueMoves.length > 0 && (
                <ul className="border-t border-slate-200 divide-y divide-slate-100 bg-slate-50 rounded-b-xl">
                  {issueMoves.map((m) => (
                    <li key={m.id} className="px-4 sm:px-5 py-2 flex flex-col sm:flex-row sm:justify-between gap-1 text-xs text-slate-700">
                      <span>
                        <strong>{m.kind === 'issued' ? 'Issued' : 'Returned'}</strong> {m.quantity} × {m.item_name}
                        {m.date_on_hat && <> · date on hat {formatDate(m.date_on_hat)}</>}
                        {m.note && <> · {m.note}</>}
                      </span>
                      <span className="text-slate-600">{whoName(m.actor_name)} · {formatDateTime(m.created_at)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </section>
      )}

      <CarriedList holder={holderParams(target)} kitTypes={ref.kitTypes} notCarried={notCarried} onChanged={load} onError={setError} />

      <section className={card} aria-labelledby="gv-hist">
        <div className="px-4 sm:px-5 py-3 border-b border-slate-200 flex items-center gap-2">
          <History className="h-5 w-5 text-slate-600" />
          <h2 id="gv-hist" className="text-base font-bold text-slate-900">Recent kit history</h2>
        </div>
        {history.length === 0 ? (
          <p className="px-5 py-6 text-base sm:text-sm text-slate-600">Nothing yet.</p>
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
                  {h.certificate_path && <FileLink path={h.certificate_path} kind="Certificate" deletions={deletions} auditors={ref.auditors} onDeleted={reloadDeletions} />}
                </div>
                <p className="text-xs text-slate-600 whitespace-nowrap">{whoName(h.actor_name)} · {formatDateTime(h.created_at)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {changing && person && (
        <ChangeVanSheet
          person={{ id: person.id, name: person.full_name }}
          oldVehicleId={changing === 'check' ? vanChange?.fromVehicleId ?? null : target.vehicleId}
          presetNewVehicleId={changing === 'check' ? target.vehicleId : null}
          assignmentAlreadyDone={changing === 'check'}
          targets={ref.allTargets}
          employees={ref.employees}
          allKit={allKit}
          kitTypes={ref.kitTypes}
          notCarriedTypeIds={[...notCarried]}
          vanLabel={ref.vanLabel}
          auditors={ref.auditors}
          onClose={() => setChanging(null)}
          onDone={(m) => {
            setChanging(null);
            setFlash(m);
            ref.reload();
            load();
          }}
        />
      )}
      {fleet === 'takeout' && person && target.vehicleId && (
        <TakeOutSheet person={{ id: person.id, name: person.full_name }} vanLabel={target.label} vehicleId={target.vehicleId}
          kitCount={kit?.length ?? 0} auditors={ref.auditors} onClose={() => setFleet(null)}
          onDone={(m) => { setFleet(null); setFlash(m); ref.reload(); load(); }} />
      )}
      {fleet === 'offroad' && target.vehicleId && (
        <OffRoadSheet vehicleId={target.vehicleId} vanLabel={vanOnlyLabel} kit={kitOnVan} targets={ref.allTargets} auditors={ref.auditors}
          onClose={() => setFleet(null)} onDone={(m) => { setFleet(null); setFlash(m); ref.reload(); load(); }} />
      )}
      {fleet === 'backon' && target.vehicleId && (
        <BackOnRoadSheet vehicleId={target.vehicleId} vanLabel={vanOnlyLabel} auditors={ref.auditors}
          onClose={() => setFleet(null)} onDone={() => { setFleet(null); setFlash(`${vanOnlyLabel} is back on the road.`); ref.reload(); load(); }} />
      )}
      {returning && person && (
        <ReturnSheet issue={returning} personId={person.id} personName={person.full_name} auditors={ref.auditors}
          onClose={() => setReturning(null)} onSaved={() => { setReturning(null); setFlash(`${returning.item_name} returned to the Yard Lockup.`); load(); }} />
      )}
      {updating && <UpdateItemSheet target={updating} targets={ref.allTargets} auditors={ref.auditors} onClose={() => setUpdating(null)} onSaved={done} />}
      {swapping && (
        <SwapKitSheet item={swapping} targets={ref.allTargets} months={monthsForType(ref.kitTypes, swapping.kit_type_id)} auditors={ref.auditors}
          onClose={() => setSwapping(null)} onSaved={done} />
      )}
      {adding && (
        <AddKitSheet mode="page" kitTypes={ref.kitTypes} targets={ref.allTargets} auditors={ref.auditors} defaultHolderKey={target.key}
          onClose={() => setAdding(false)} onSaved={done} onTypeCreated={(t) => ref.setKitTypes((ts) => [...ts, t])} />
      )}
    </div>
  );
};

/** Which kit types this person / spare van carries. "Not carried" is not a fail; it shows greyed in the audit. */
function CarriedList({ holder, kitTypes, notCarried, onChanged, onError }: {
  holder: { holderEmployeeId: string | null; vehicleId: string | null };
  kitTypes: KitType[]; notCarried: Set<string>; onChanged: () => void; onError: (m: string | null) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const toggle = async (t: KitType) => {
    setBusy(t.id);
    onError(null);
    try {
      await setCarried(holder.holderEmployeeId, holder.vehicleId, t.id, notCarried.has(t.id), TEST_MODE);
      onChanged();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Could not update the kit list.');
    } finally {
      setBusy(null);
    }
  };
  return (
    <section className={card} aria-labelledby="gv-vkl">
      <div className="px-4 sm:px-5 py-3 border-b border-slate-200">
        <h2 id="gv-vkl" className="text-base font-bold text-slate-900">Kit list</h2>
        <p className="text-xs text-slate-600">Tap to switch. “Not carried” is not a fail; it shows greyed in the audit.</p>
      </div>
      <ul className="p-4 sm:p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
        {kitTypes.map((t) => {
          const carried = !notCarried.has(t.id);
          return (
            <li key={t.id}>
              <button type="button" aria-pressed={carried} disabled={busy === t.id} onClick={() => toggle(t)}
                className={`w-full min-h-[44px] px-3 rounded-lg border text-sm font-medium flex items-center justify-between gap-2 cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${carried ? 'border-green-200 bg-green-50 text-green-800' : 'border-slate-200 bg-slate-50 text-slate-600'}`}>
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
