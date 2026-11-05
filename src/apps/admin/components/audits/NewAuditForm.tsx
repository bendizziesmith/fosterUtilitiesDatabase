import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Camera, Plus, X, Ban, ArrowLeftRight, MessageSquare, Users, Truck, Save, Send } from 'lucide-react';
import { LoadingSpinner } from '../../../../components/LoadingSpinner';
import {
  loadAuditReferenceData,
  loadTeam,
  loadHolderRecord,
  saveDraftAudit,
  submitAudit,
  getAudit,
  getCurrentAuditor,
  uploadAuditFile,
  StaffRow,
  VanRow,
} from '../../../../lib/siteAuditService';
import {
  buildAuditTargets,
  buildKitLines,
  buildAuditPrefill,
  auditTargetsOf,
  allTargetsOf,
  summariseAuditLines,
  todayISO,
  applyServiceDate,
  applyExpiry,
  otherAnswerFor,
  AuditTarget,
  DraftLine,
  TeamMember,
} from '../../../../lib/siteAuditLogic';
import { AuditChecklistItem, Auditor, KitItemOverview, KitType } from '../../../../lib/supabase';
import { ActorPicker } from './ActorPicker';
import { useActor } from './useActor';
import { AddKitSheet } from './AddKitSheet';
import { SwapKitSheet } from './SwapKitSheet';
import { TargetPicker } from './TargetPicker';
import { listLockupMovements } from '../../../../lib/lockupService';
import { issuedSince } from '../../../../lib/lockupLogic';
import { Field, ExpiryPill, YesNo, ErrorNote, TestModeBanner, Sheet } from './ui';
import { btn, card, inputCls, TEST_MODE } from './styles';

const SECTIONS: { key: DraftLine['section']; title: string; note: string }[] = [
  { key: 'ppe', title: 'PPE', note: 'Qty per person' },
  { key: 'hs', title: 'Health & safety', note: 'Expected qty shown · audit only, no dates' },
  { key: 'kit', title: 'Kit', note: 'Pre-filled from their Kit & Plant record' },
  { key: 'other', title: 'Other', note: '' },
];

/** "Continue" reopens a draft where it was left: the scroll position saved with the draft (this browser only) */
const scrollKey = (id: string) => `foster.audit.draftScroll.${id}`;
const rememberScroll = (id: string) => {
  try { localStorage.setItem(scrollKey(id), String(Math.round(window.scrollY))); } catch { /* storage blocked */ }
};
const savedScroll = (id: string): number => {
  try { return Number(localStorage.getItem(scrollKey(id))) || 0; } catch { return 0; }
};

let keySeq = 0;
const newKey = (p: string) => `${p}:${Date.now()}:${keySeq++}`;

export const NewAuditForm: React.FC = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const draftParam = params.get('draft');
  // old links used gang:<id>; a gang is now its ganger (person:<id>)
  const targetParam = params.get('target')?.replace(/^gang:/, 'person:') ?? null;

  const [employees, setEmployees] = useState<StaffRow[]>([]);
  const [vehicles, setVehicles] = useState<VanRow[]>([]);
  const [checklist, setChecklist] = useState<AuditChecklistItem[]>([]);
  const [kitTypes, setKitTypes] = useState<KitType[]>([]);
  const [auditors, setAuditors] = useState<Auditor[]>([]);
  const { actorId: auditorId, setActorId: setAuditorId, actor: auditorRec } = useActor(auditors);
  const [auditor, setAuditor] = useState<{ id: string; name: string } | null>(null);
  const [loading, setLoading] = useState(true);

  const [auditId, setAuditId] = useState<string | null>(draftParam);
  const [targetKey, setTargetKey] = useState('');
  const [auditDate, setAuditDate] = useState(todayISO());
  const [site, setSite] = useState('');
  const [notes, setNotes] = useState('');
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [vanItems, setVanItems] = useState<KitItemOverview[]>([]);
  /** issued from the Yard Lockup since their last audit, per audit-sheet item */
  const [issuedMap, setIssuedMap] = useState<Map<string, number>>(new Map());
  const [addMember, setAddMember] = useState('');
  const [busy, setBusy] = useState<'draft' | 'submit' | 'target' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [showAddKit, setShowAddKit] = useState(false);
  const [swapItem, setSwapItem] = useState<KitItemOverview | null>(null);
  const [confirmSubmit, setConfirmSubmit] = useState(false);

  const targets = useMemo(() => buildAuditTargets(employees, vehicles), [employees, vehicles]);
  /** who can be audited: gangers, staff with a van, spare vans */
  const allTargets = useMemo(() => auditTargetsOf(targets), [targets]);
  /** every holder (for Add kit / Swap) */
  const allHolders = useMemo(() => allTargetsOf(targets), [targets]);
  const target: AuditTarget | undefined = allHolders.find((t) => t.key === targetKey);

  // ---------------------------------------------------------- load
  useEffect(() => {
    (async () => {
      try {
        const [ref, who] = await Promise.all([loadAuditReferenceData(), getCurrentAuditor()]);
        setEmployees(ref.employees);
        setVehicles(ref.vehicles);
        setChecklist(ref.checklist);
        setKitTypes(ref.kitTypes);
        setAuditors(ref.auditors);
        setAuditor(who);
        if (draftParam) {
          const { audit, members: m, lines: l } = await getAudit(draftParam);
          if (audit.status !== 'draft') {
            navigate(`/audits/detail?id=${audit.id}`, { replace: true });
            return;
          }
          const person = audit.holder_employee_id ?? audit.ganger_id;
          setTargetKey(person ? `person:${person}` : audit.vehicle_id ? `van:${audit.vehicle_id}` : '');
          if (audit.auditor_id) setAuditorId(audit.auditor_id);
          setAuditDate(audit.audit_date);
          setSite(audit.site_visited ?? '');
          setNotes(audit.notes ?? '');
          setMembers(m.map((x) => ({ name: x.name, employee_id: x.employee_id })));
          setLines(l.map((x) => ({ ...x, key: `row:${x.id}` })));
          const rec = await loadHolderRecord({ kind: person ? 'person' : 'spare_van', personId: person, vehicleId: audit.vehicle_id });
          setVanItems(rec.heldKit);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not load the audit form.');
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftParam, navigate]);

  // reopened draft: back to where it was left
  useEffect(() => {
    if (loading || !draftParam) return;
    const y = savedScroll(draftParam);
    if (y > 0) requestAnimationFrame(() => window.scrollTo({ top: y }));
  }, [loading, draftParam]);

  // opened from a gang / van page: "New audit for this gang"
  const [autoPicked, setAutoPicked] = useState(false);
  useEffect(() => {
    if (loading || autoPicked || draftParam || !targetParam || !allTargets.length) return;
    setAutoPicked(true);
    pickTarget(targetParam);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, autoPicked, draftParam, targetParam, allTargets]);

  const pickTarget = async (key: string) => {
    const touched = lines.some((l) => l.result || l.comment || l.qty);
    if (touched && !window.confirm('Change who you are auditing? What you have filled in will be cleared.')) return;
    setTargetKey(key);
    const t = allTargets.find((x) => x.key === key);
    if (!t) {
      setLines([]);
      setMembers([]);
      return;
    }
    setBusy('target');
    setError(null);
    try {
      const person = t.kind === 'person' ? employees.find((e) => e.id === t.personId) ?? null : null;
      const [team, rec, moves] = await Promise.all([
        t.isGanger ? loadTeam(person, employees) : Promise.resolve(person ? [{ name: person.full_name, employee_id: person.id }] : []),
        loadHolderRecord(t),
        person ? listLockupMovements(person.id) : Promise.resolve([]),
      ]);
      setIssuedMap(person ? issuedSince(moves, person.id, rec.lastAuditAt) : new Map());
      setMembers(team);
      setVanItems(rec.heldKit);
      // pre-filled from their record (kit, PPE dates, last quantities, not carried); Y/N start blank
      setLines(buildAuditPrefill({
        checklist, kitTypes, heldKit: rec.heldKit, ppe: rec.ppe, notCarried: rec.notCarried, lastLines: rec.lastLines,
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the team.');
    } finally {
      setBusy(null);
    }
  };

  const update = useCallback((key: string, patch: Partial<DraftLine>) => {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }, []);

  const reloadKitAfterSwap = async () => {
    setSwapItem(null);
    if (!target) return;
    const rec = await loadHolderRecord(target);
    const vk = { list: rec.notCarried, items: rec.heldKit };
    setVanItems(rec.heldKit);
    setLines((ls) => {
      const kept = ls.filter((l) => l.section !== 'kit');
      const old = ls.filter((l) => l.section === 'kit');
      const rebuilt = buildKitLines(kitTypes, vk.list, vk.items).map((n) => {
        const prev = old.find((o) => o.kit_type_id === n.kit_type_id && o.kit_item_id === n.kit_item_id);
        return prev ? { ...n, result: prev.result, comment: prev.comment, photo_path: prev.photo_path } : n;
      });
      const extra = old.filter((o) => !o.kit_item_id && o.key?.startsWith('add:'));
      return [...kept, ...rebuilt, ...extra];
    });
  };

  // ---------------------------------------------------------- save
  const header = () => ({
    audit_date: auditDate,
    audited_by: auditor?.id ?? null,
    audited_by_name: auditor?.name ?? 'Admin',
    auditor_id: auditorRec?.id ?? null,
    auditor_name: auditorRec?.name ?? null,
    holder_employee_id: target?.kind === 'person' ? target.personId : null,
    vehicle_id: target?.vehicleId ?? null,
    vehicle_reg_snapshot: target?.reg ?? null,
    ganger_id: target?.isGanger ? target.personId : null,
    ganger_name_snapshot: target?.personName ?? null,
    team_name_snapshot: target?.teamName ?? '',
    site_visited: site.trim() || null,
    notes: notes.trim() || null,
    is_test: TEST_MODE,
  });

  const save = async (): Promise<string | null> => {
    if (!target) {
      setError('Choose who you are auditing first.');
      return null;
    }
    const id = await saveDraftAudit(auditId, header(), members, lines);
    setAuditId(id);
    return id;
  };

  const onSaveDraft = async () => {
    setBusy('draft');
    setError(null);
    try {
      const id = await save();
      if (id) rememberScroll(id);
      if (id) setSavedAt(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the draft.');
    } finally {
      setBusy(null);
    }
  };

  const onSubmit = async () => {
    setConfirmSubmit(false);
    setBusy('submit');
    setError(null);
    try {
      const id = await save();
      if (!id) return;
      await submitAudit(id);
      navigate(`/audits/detail?id=${id}`, { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not submit the audit.');
    } finally {
      setBusy(null);
    }
  };

  const summary = summariseAuditLines(lines, auditDate);

  if (loading) return <LoadingSpinner />;

  const memberOptions = employees.filter((e) => !members.some((m) => m.employee_id === e.id));

  return (
    <div className="space-y-4 pb-28 sm:pb-6 max-w-4xl mx-auto">
      <TestModeBanner />
      <ErrorNote message={error} />

      {/* ------------------------------------------------ header */}
      <section className={`${card} p-4 sm:p-5 space-y-4`}>
        <ActorPicker auditors={auditors} value={auditorId} onChange={setAuditorId} label="Audited by" />
        <TargetPicker label="Audit who?" targets={allTargets} value={targetKey} onChange={pickTarget} disabled={busy === 'target'} />

        {busy === 'target' && <p className="text-sm text-slate-600">Loading team and kit…</p>}

        {target && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <p className="text-xs font-semibold text-slate-600 mb-1">Van reg</p>
                <p className="min-h-[44px] flex items-center gap-2 px-3 rounded-lg bg-slate-50 border border-slate-200 text-sm font-semibold text-slate-900">
                  <Truck className="h-4 w-4 text-slate-500" />{target.reg ?? 'No van assigned'}
                </p>
              </div>
              <Field label="Date">
                {(id) => <input id={id} type="date" className={inputCls} value={auditDate} onChange={(e) => setAuditDate(e.target.value)} />}
              </Field>
              <Field label="Site visited">
                {(id) => <input id={id} className={inputCls} value={site} onChange={(e) => setSite(e.target.value)} placeholder="Street / job" />}
              </Field>
            </div>

            <div>
              <p className="text-xs font-semibold text-slate-600 mb-2 flex items-center gap-1.5"><Users className="h-3.5 w-3.5" />Team · {target.teamName}</p>
              <ul className="flex flex-wrap gap-2" aria-label="Team members">
                {members.map((m, i) => (
                  <li key={`${m.name}:${i}`} className="inline-flex items-center gap-1 pl-3 pr-1 min-h-[40px] rounded-full bg-blue-50 border border-blue-200 text-sm text-blue-800">
                    {m.name}
                    <button type="button" aria-label={`Remove ${m.name}`} onClick={() => setMembers(members.filter((_, j) => j !== i))} className="p-2 rounded-full hover:bg-blue-100 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
                {members.length === 0 && <li className="text-sm text-slate-500">No members yet</li>}
              </ul>
              <div className="flex gap-2 mt-2">
                <label className="sr-only" htmlFor="add-member">Add a member</label>
                <input
                  id="add-member"
                  list="member-options"
                  className={inputCls}
                  placeholder="Add a member…"
                  value={addMember}
                  onChange={(e) => setAddMember(e.target.value)}
                />
                <datalist id="member-options">
                  {memberOptions.map((e) => <option key={e.id} value={e.full_name} />)}
                </datalist>
                <button
                  type="button"
                  className={btn.secondary}
                  onClick={() => {
                    const name = addMember.trim();
                    if (!name) return;
                    const emp = employees.find((e) => e.full_name.toLowerCase() === name.toLowerCase());
                    setMembers([...members, { name: emp?.full_name ?? name, employee_id: emp?.id ?? null }]);
                    setAddMember('');
                  }}
                >
                  <Plus className="h-4 w-4" />Add
                </button>
              </div>
            </div>
          </>
        )}
      </section>

      {/* ------------------------------------------------ sections */}
      {target && SECTIONS.map((s) => {
        const sl = lines.filter((l) => l.section === s.key);
        return (
          <section key={s.key} className={card} aria-labelledby={`sec-${s.key}`}>
            <div className="px-4 sm:px-5 py-3 border-b border-slate-200 flex flex-wrap items-baseline gap-x-2">
              <h2 id={`sec-${s.key}`} className="text-base font-bold text-slate-900">{s.title}</h2>
              {s.note && <span className="text-xs text-slate-500">{s.note}</span>}
            </div>
            <ul className="divide-y divide-slate-200">
              {sl.map((l) => (
                <LineRow
                  key={l.key}
                  line={l}
                  auditDate={auditDate}
                  months={
                    l.section === 'kit'
                      ? kitTypes.find((t) => t.id === l.kit_type_id)?.service_interval_months ?? null
                      : checklist.find((c) => c.id === l.checklist_item_id)?.service_interval_months ?? null
                  }
                  dateLabel={l.section === 'ppe' ? checklist.find((c) => c.id === l.checklist_item_id)?.date_label ?? null : null}
                  otherAnswer={otherAnswerFor(checklist.find((c) => c.id === l.checklist_item_id))}
                  issued={l.checklist_item_id ? issuedMap.get(l.checklist_item_id) ?? 0 : 0}
                  onChange={(p) => update(l.key!, p)}
                  onRemove={l.key?.startsWith('add:') ? () => setLines((ls) => ls.filter((x) => x.key !== l.key)) : undefined}
                  onSwap={
                    s.key === 'kit' && l.kit_item_id
                      ? () => setSwapItem(vanItems.find((v) => v.id === l.kit_item_id) ?? null)
                      : undefined
                  }
                  onError={setError}
                />
              ))}
            </ul>
            {s.key === 'kit' && (
              <div className="px-4 sm:px-5 py-3 border-t border-slate-200 flex flex-col sm:flex-row gap-2">
                <button type="button" className={btn.secondary} onClick={() => setShowAddKit(true)}>
                  <Plus className="h-4 w-4" />Add kit
                </button>
              </div>
            )}
          </section>
        );
      })}

      {target && (
        <section className={`${card} p-4 sm:p-5`}>
          <Field label="Additional kit required / notes for Neil & Sam">
            {(id) => <textarea id={id} rows={3} className={`${inputCls} py-2`} value={notes} onChange={(e) => setNotes(e.target.value)} />}
          </Field>
        </section>
      )}

      {/* ------------------------------------------------ summary + actions (sticky on phone) */}
      {target && (
        <div className="fixed sm:static bottom-0 inset-x-0 z-40 bg-white border-t sm:border border-slate-200 sm:rounded-xl px-4 py-3 shadow-lg sm:shadow-none">
          <div className="max-w-4xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <p className="text-sm font-semibold text-slate-900" aria-live="polite">
              <span className={summary.fails ? 'text-red-700' : ''}>{summary.fails} fail{summary.fails === 1 ? '' : 's'}</span>,{' '}
              <span className={summary.expired ? 'text-red-700' : ''}>{summary.expired} expired</span>,{' '}
              <span className={summary.dueSoon ? 'text-amber-800' : ''}>{summary.dueSoon} due soon</span>
              {savedAt && <span className="ml-2 text-xs font-normal text-slate-500">Draft saved {savedAt}</span>}
            </p>
            <div className="flex gap-2">
              <button type="button" className={`${btn.secondary} flex-1 sm:flex-none`} onClick={onSaveDraft} disabled={!!busy}>
                <Save className="h-4 w-4" />{busy === 'draft' ? 'Saving…' : 'Save draft'}
              </button>
              <button type="button" className={`${btn.primary} flex-1 sm:flex-none`} onClick={() => {
                if (!auditorRec) {
                  setError('Pick who did the audit (“Audited by”, at the top) before submitting.');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                  return;
                }
                setConfirmSubmit(true);
              }} disabled={!!busy}>
                <Send className="h-4 w-4" />{busy === 'submit' ? 'Submitting…' : 'Submit audit'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showAddKit && (
        <AddKitSheet
          mode="audit"
          kitTypes={kitTypes}
          targets={allHolders}
          vanReg={target?.label}
          onClose={() => setShowAddKit(false)}
          onTypeCreated={(t) => setKitTypes((ts) => [...ts, t])}
          onAddLine={(n) => {
            setLines((ls) => [
              ...ls,
              {
                key: newKey('add'),
                section: 'kit',
                kit_type_id: n.kitTypeId,
                item_name: n.typeName,
                kit_item_id: null,
                plant_no_snapshot: n.plantNo,
                service_date: n.serviceDate,
                expiry_date: n.expiryDate,
                expiryManual: n.expiryManual,
                result: null,
                comment: '',
              },
            ]);
            setShowAddKit(false);
          }}
        />
      )}
      {swapItem && (
        <SwapKitSheet item={swapItem} targets={allHolders} auditors={auditors} months={kitTypes.find((t) => t.id === swapItem.kit_type_id)?.service_interval_months ?? null}
          onClose={() => setSwapItem(null)} onSaved={reloadKitAfterSwap} />
      )}
      {confirmSubmit && (
        <Sheet
          title="Submit this audit?"
          subtitle="It becomes a fixed record and can’t be edited. Kit lines update the Kit & Plant list."
          onClose={() => setConfirmSubmit(false)}
          footer={
            <>
              <button type="button" className={btn.secondary} onClick={() => setConfirmSubmit(false)}>Keep editing</button>
              <button type="button" className={btn.primary} onClick={onSubmit}>Submit audit</button>
            </>
          }
        >
          <p className="text-sm text-slate-700">
            {target?.teamName} · {target?.reg ?? 'no van'} · {summary.fails} fails, {summary.expired} expired, {summary.dueSoon} due soon.
          </p>
        </Sheet>
      )}
    </div>
  );
};

// ---------------------------------------------------------------- one line

function LineRow({
  line,
  auditDate,
  months,
  dateLabel,
  otherAnswer = 'none',
  issued = 0,
  onChange,
  onRemove,
  onSwap,
  onError,
}: {
  line: DraftLine;
  auditDate: string;
  /** service interval: expiry fills itself from the service date / date on hat */
  months: number | null;
  dateLabel: string | null;
  /** Other section: "Label on?" Y/N, the free-text date / tag box, or nothing (from the checklist item) */
  otherAnswer?: 'label' | 'date_tag' | 'none';
  /** issued from the Yard Lockup since their last audit */
  issued?: number;
  onChange: (p: Partial<DraftLine>) => void;
  onRemove?: () => void;
  onSwap?: () => void;
  onError: (m: string | null) => void;
}) {
  const [showComment, setShowComment] = useState(!!line.comment);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const notCarried = line.result === 'not_carried';
  const isKit = line.section === 'kit';
  const isHs = line.section === 'hs';
  const commentOpen = showComment || line.result === 'N';
  const setServiceDate = (v: string | null) => {
    const next = applyServiceDate(
      { serviceDate: line.service_date ?? null, expiry: line.expiry_date, expiryManual: !!line.expiryManual },
      v,
      months
    );
    onChange({ service_date: next.serviceDate, expiry_date: next.expiry });
  };
  const datedPpe = line.section === 'ppe' && !!months;

  const onPhoto = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    onError(null);
    try {
      const path = await uploadAuditFile(file, 'lines');
      onChange({ photo_path: path });
      setPreview(URL.createObjectURL(file));
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Photo upload failed.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <li className={`px-4 sm:px-5 py-3 ${notCarried ? 'bg-slate-50' : ''}`}>
      <div className="flex flex-col lg:flex-row lg:items-start gap-3">
        <div className="lg:w-48 flex-shrink-0">
          <p className={`text-sm font-bold ${notCarried ? 'text-slate-500' : 'text-slate-900'}`}>{line.item_name}</p>
          {line.expected_qty && <p className="text-xs text-slate-500">{line.expected_qty}</p>}
          {notCarried && <p className="text-xs font-semibold text-slate-600 mt-0.5">Not carried on this van</p>}
          {issued > 0 && <p className="text-xs font-semibold text-violet-700 mt-0.5">Issued since last audit: {issued}</p>}
        </div>

        {!notCarried && (
          <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
            <div className="col-span-2 sm:col-span-1">
              <p className="text-xs font-semibold text-slate-600 mb-1">Fit for purpose</p>
              <YesNo value={line.result} label={line.item_name} onChange={(v) => onChange({ result: v })} />
            </div>
            {isKit ? (
              <>
                <Field label="Plant no">
                  {(id) => <input id={id} className={inputCls} value={line.plant_no_snapshot ?? ''} onChange={(e) => onChange({ plant_no_snapshot: e.target.value })} />}
                </Field>
                <Field label="Service date">
                  {(id) => <input id={id} type="date" className={inputCls} value={line.service_date ?? ''} onChange={(e) => setServiceDate(e.target.value || null)} />}
                </Field>
              </>
            ) : (
              <Field label="Qty">
                {(id) => <input id={id} inputMode="numeric" className={inputCls} value={line.qty ?? ''} onChange={(e) => onChange({ qty: e.target.value })} />}
              </Field>
            )}
            {datedPpe && (
              <Field label={dateLabel ?? 'Date'}>
                {(id) => <input id={id} type="date" className={inputCls} value={line.service_date ?? ''} onChange={(e) => setServiceDate(e.target.value || null)} />}
              </Field>
            )}
            {(line.section === 'ppe' || isKit) && (
              <ExpiryInput line={line} auditDate={auditDate} months={months} onChange={onChange} />
            )}
            {line.section === 'other' && otherAnswer === 'label' && (
              <div className="col-span-2 sm:col-span-1">
                <p className="text-xs font-semibold text-slate-600 mb-1">Label on?</p>
                <YesNo value={line.label_on ?? null} label={line.item_name} question="label on" onChange={(v) => onChange({ label_on: v })} />
              </div>
            )}
            {line.section === 'other' && otherAnswer === 'date_tag' && (
              <Field label="Date / tag / label" className="col-span-2 sm:col-span-1">
                {(id) => <input id={id} className={inputCls} value={line.date_tag ?? ''} onChange={(e) => onChange({ date_tag: e.target.value })} />}
              </Field>
            )}
            {isHs && <div className="hidden sm:block" />}
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2 mt-2">
        {!commentOpen && !notCarried && (
          <button type="button" className={btn.small} onClick={() => setShowComment(true)}>
            <MessageSquare className="h-3.5 w-3.5" />Comment
          </button>
        )}
        {isKit && (
          <button
            type="button"
            className={btn.small}
            aria-pressed={notCarried}
            onClick={() => onChange({ result: notCarried ? null : 'not_carried' })}
          >
            <Ban className="h-3.5 w-3.5" />{notCarried ? 'Carried on this van' : 'Not carried on this van'}
          </button>
        )}
        {onSwap && !notCarried && (
          <button type="button" className={btn.small} onClick={onSwap}>
            <ArrowLeftRight className="h-3.5 w-3.5" />Swap kit
          </button>
        )}
        {onRemove && (
          <button type="button" className={btn.small} onClick={onRemove}>
            <X className="h-3.5 w-3.5" />Remove line
          </button>
        )}
      </div>

      {commentOpen && !notCarried && (
        <div className="mt-2 grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2 items-end">
          <Field label={line.result === 'N' ? 'What’s wrong? (comment)' : 'Comment'}>
            {(id) => <textarea id={id} rows={2} className={`${inputCls} py-2`} value={line.comment ?? ''} onChange={(e) => onChange({ comment: e.target.value })} />}
          </Field>
          {line.result === 'N' && (
            <div className="flex items-center gap-2">
              {preview && <img src={preview} alt={`Photo of ${line.item_name}`} className="h-11 w-11 rounded-lg object-cover border border-slate-200" />}
              <label className={`${btn.secondary} ${uploading ? 'opacity-50' : ''}`}>
                <Camera className="h-4 w-4" />
                {uploading ? 'Uploading…' : line.photo_path ? 'Change photo' : 'Photo (optional)'}
                <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => onPhoto(e.target.files?.[0])} />
              </label>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

function ExpiryInput({ line, auditDate, months, onChange }: { line: DraftLine; auditDate: string; months: number | null; onChange: (p: Partial<DraftLine>) => void }) {
  const [open, setOpen] = useState(!!line.expiry_date);
  if (!open && !line.expiry_date) {
    return (
      <div>
        <p className="text-xs font-semibold text-slate-600 mb-1">Expiry</p>
        <button type="button" className={`${btn.secondary} w-full`} onClick={() => setOpen(true)} aria-label={`${line.item_name} expiry: N/A, tap to add a date`}>
          N/A · add date
        </button>
      </div>
    );
  }
  return (
    <div>
      <div className="flex items-center justify-between mb-1 gap-2">
        <label htmlFor={`exp-${line.key}`} className="text-xs font-semibold text-slate-600">Expiry</label>
        <ExpiryPill expiry={line.expiry_date} today={auditDate} />
      </div>
      <div className="flex gap-1">
        <input
          id={`exp-${line.key}`}
          type="date"
          className={inputCls}
          value={line.expiry_date ?? ''}
          onChange={(e) => {
            const s = applyExpiry({ serviceDate: line.service_date ?? null, expiry: line.expiry_date, expiryManual: !!line.expiryManual }, e.target.value || null);
            onChange({ expiry_date: s.expiry, expiryManual: s.expiryManual });
          }}
        />
        <button
          type="button"
          aria-label={`Set ${line.item_name} expiry back to N/A`}
          onClick={() => {
            onChange({ expiry_date: null, expiryManual: false });
            setOpen(false);
          }}
          className="min-w-[44px] min-h-[44px] rounded-lg border border-slate-300 text-slate-500 hover:bg-slate-50 cursor-pointer flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      {!!months && !line.expiryManual && !!line.expiry_date && (
        <p className="text-xs text-slate-500 mt-1">Auto: {months} months, change if needed</p>
      )}
    </div>
  );
}
