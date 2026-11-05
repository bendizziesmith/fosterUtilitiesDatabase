import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Camera, ImagePlus, Plus, X, Ban, ArrowLeftRight, MessageSquare, Users, Truck, Save, Send, Check, ChevronDown } from 'lucide-react';
import { LoadingSpinner } from '../../../../components/LoadingSpinner';
import {
  loadAuditReferenceData,
  loadTeam,
  loadHolderRecord,
  saveDraftAudit,
  submitAudit,
  getAudit,
  getCurrentAuditor,
  uploadAuditPhoto,
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
  mergeKitLinesAfterSwap,
  restoreDraftLines,
  otherAnswerFor,
  sectionProgress,
  unansweredLines,
  AuditTarget,
  DraftLine,
  TeamMember,
} from '../../../../lib/siteAuditLogic';
import { AuditChecklistItem, AuditPhotoSlot, Auditor, KitItemOverview, KitType } from '../../../../lib/supabase';
import { ActorPicker } from './ActorPicker';
import { useActor } from './useActor';
import { AddKitSheet } from './AddKitSheet';
import { SwapKitSheet } from './SwapKitSheet';
import { TargetPicker } from './TargetPicker';
import { listLockupMovements } from '../../../../lib/lockupService';
import { issuedSince } from '../../../../lib/lockupLogic';
import { Field, YesNo, ErrorNote, TestModeBanner, Sheet, LABEL_LINE, LABEL_TEXT, ExpiryNote, GaugeButtons } from './ui';
import { PhotosSection, DraftPhoto } from './PhotosSection';
import { photoProgress, suggestedNote } from '../../../../lib/photoLogic';
import { StampInfo } from '../../../../lib/photoUpload';
import { btn, card, inputCls, TEST_MODE, expiryRing } from './styles';

const SECTIONS: { key: DraftLine['section']; title: string; note: string }[] = [
  { key: 'ppe', title: 'PPE', note: 'Qty per person' },
  { key: 'hs', title: 'Health & safety', note: 'Expected qty shown · first aid kit, eye wash, burns kit and fire extinguisher have an expiry' },
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
  /** Submit pressed with items still unanswered: list them first */
  const [unanswered, setUnanswered] = useState<DraftLine[] | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  /** standard photo slots (data) and this audit's photos */
  const [photoSlots, setPhotoSlots] = useState<AuditPhotoSlot[]>([]);
  const [photos, setPhotos] = useState<DraftPhoto[]>([]);
  /** Submit pressed with required photos missing */
  const [missingPhotos, setMissingPhotos] = useState<AuditPhotoSlot[] | null>(null);

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
        setPhotoSlots(ref.photoSlots);
        setAuditor(who);
        if (draftParam) {
          const { audit, members: m, lines: l, photos: ph } = await getAudit(draftParam);
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
          // remember which expiry dates were typed, so a later service-date change doesn't overwrite them
          setLines(restoreDraftLines(l, (x) => (x.section === 'kit'
            ? ref.kitTypes.find((t) => t.id === x.kit_type_id)?.service_interval_months
            : ref.checklist.find((c) => c.id === x.checklist_item_id)?.service_interval_months)));
          setPhotos(ph.map((x, i) => ({ ...x, key: `photo:${x.id ?? i}` })));
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
        checklist, kitTypes, heldKit: rec.heldKit, ppe: rec.ppe, notCarried: rec.notCarried, lastLines: rec.lastLines, answers: rec.answers,
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
    // keep everything already on screen (dates, plant nos, answers); only the swapped row changes
    setLines((ls) => [...ls.filter((l) => l.section !== 'kit'), ...mergeKitLinesAfterSwap(ls, buildKitLines(kitTypes, vk.list, vk.items))]);
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
    const id = await saveDraftAudit(auditId, header(), members, lines, photos);
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
  const progress = sectionProgress(lines);
  const photoState = photoProgress(photoSlots, photos);
  /** stamped on every photo: van reg and site */
  const stamp: StampInfo = { reg: target?.reg ?? null, site: site.trim() || null };

  /** open a section and bring it (or one item in it) into view below the sticky strip */
  const jumpTo = (section: string, lineKey?: string) => {
    setCollapsed((c) => ({ ...c, [section]: false }));
    requestAnimationFrame(() => {
      const el = document.getElementById(lineKey ? `line-${lineKey}` : `sec-${section}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (lineKey) (el?.querySelector('button, input') as HTMLElement | null)?.focus({ preventScroll: true });
    });
  };

  const onSubmitPressed = () => {
    if (!auditorRec) {
      setError('Pick who did the audit (“Audited by”, at the top) before submitting.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    // photos are optional: just a quick "Submit without 3 photos?" first
    if (!photoState.complete && photoSlots.length) {
      setMissingPhotos(photoState.missing);
      return;
    }
    afterPhotos();
  };
  /** after the photo check: list unanswered items, else the normal confirm */
  const afterPhotos = () => {
    setMissingPhotos(null);
    const missing = unansweredLines(lines);
    if (missing.length) setUnanswered(missing);
    else setConfirmSubmit(true);
  };

  const jumpToPhoto = (slotId: string) =>
    requestAnimationFrame(() => {
      const el = document.getElementById(`photo-${slotId}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      (el?.querySelector('button') as HTMLElement | null)?.focus({ preventScroll: true });
    });

  if (loading) return <LoadingSpinner />;

  const memberOptions = employees.filter((e) => !members.some((m) => m.employee_id === e.id));

  return (
    <div className="space-y-4 pb-28 sm:pb-0 max-w-4xl mx-auto">
      <TestModeBanner />
      <ErrorNote message={error} />

      {/* ------------------------------------------------ header */}
      <section className={`${card} p-4 sm:p-5 space-y-4`}>
        <ActorPicker auditors={auditors} value={auditorId} onChange={setAuditorId} label="Audited by" />
        <TargetPicker label="Audit who?" targets={allTargets} value={targetKey} onChange={pickTarget} disabled={busy === 'target'} />

        {busy === 'target' && <p className="text-base sm:text-sm text-slate-600">Loading team and kit…</p>}

        {target && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <p className="text-xs font-semibold text-slate-600 mb-1">Van reg</p>
                <p className="min-h-[44px] flex items-center gap-2 px-3 rounded-lg bg-slate-50 border border-slate-200 text-base sm:text-sm font-semibold text-slate-900">
                  <Truck className="h-4 w-4 text-slate-600" />{target.reg ?? 'No van assigned'}
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
                  <li key={`${m.name}:${i}`} className="inline-flex items-center gap-1 pl-3 pr-1 min-h-[44px] rounded-full bg-blue-50 border border-blue-200 text-sm text-blue-800">
                    {m.name}
                    <button type="button" aria-label={`Remove ${m.name}`} onClick={() => setMembers(members.filter((_, j) => j !== i))} className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full hover:bg-blue-100 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
                {members.length === 0 && <li className="text-sm text-slate-600">No members yet</li>}
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

      {/* ------------------------------------------------ progress strip (sticky): tap a chip to jump */}
      {target && lines.length > 0 && (
        <nav aria-label="Sections" className="sticky top-0 z-20 -mx-4 sm:mx-0 px-4 sm:px-3 py-2 bg-white border-b sm:border sm:rounded-xl border-slate-200 shadow-sm">
          <ul className="flex gap-2 overflow-x-auto overscroll-x-contain">
            {progress.filter((p) => p.total > 0).map((p) => (
              <li key={p.key} className="flex-shrink-0">
                <button
                  type="button"
                  onClick={() => jumpTo(p.key)}
                  className={`inline-flex items-center gap-1.5 min-h-[44px] px-3 rounded-full border text-sm font-semibold cursor-pointer transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${p.done ? 'bg-green-50 border-green-200 text-green-700' : 'bg-white border-slate-300 text-slate-800 hover:bg-slate-50'}`}
                  aria-label={`${p.title}: ${p.answered} of ${p.total} answered${p.done ? ', complete' : ''}`}
                >
                  {p.done && <Check className="h-4 w-4" aria-hidden="true" strokeWidth={3} />}
                  {p.title} {p.answered}/{p.total}
                </button>
              </li>
            ))}
            {photoSlots.length > 0 && (
              <li className="flex-shrink-0">
                <button
                  type="button"
                  onClick={() => document.getElementById('sec-photos')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                  className={`inline-flex items-center gap-1.5 min-h-[44px] px-3 rounded-full border text-sm font-semibold cursor-pointer transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${photoState.complete ? 'bg-green-50 border-green-200 text-green-700' : 'bg-amber-50 border-amber-200 text-amber-800'}`}
                  aria-label={`Photos: ${photoState.done} of ${photoState.total} suggested taken${photoState.complete ? ', complete' : ''}`}
                >
                  {photoState.complete && <Check className="h-4 w-4" aria-hidden="true" strokeWidth={3} />}
                  Photos {photoState.done}/{photoState.total}
                </button>
              </li>
            )}
          </ul>
        </nav>
      )}

      {/* ------------------------------------------------ sections: one card per item, collapsible */}
      {target && SECTIONS.map((s) => {
        const sl = lines.filter((l) => l.section === s.key);
        const pr = progress.find((p) => p.key === s.key)!;
        const open = !collapsed[s.key];
        if (!sl.length && s.key !== 'kit') return null;
        return (
          <section key={s.key} id={`sec-${s.key}`} className="scroll-mt-20" aria-labelledby={`sec-h-${s.key}`}>
            <h2 id={`sec-h-${s.key}`}>
              <button
                type="button"
                aria-expanded={open}
                aria-controls={`sec-body-${s.key}`}
                onClick={() => setCollapsed((c) => ({ ...c, [s.key]: open }))}
                className="w-full min-h-[56px] flex items-center justify-between gap-3 px-4 sm:px-5 rounded-xl bg-white border border-slate-200 text-left cursor-pointer hover:bg-slate-50 transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <span className="flex items-center gap-2 min-w-0">
                  {pr.done && pr.total > 0 ? (
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-green-700 text-white flex-shrink-0" aria-hidden="true"><Check className="h-4 w-4" strokeWidth={3} /></span>
                  ) : (
                    <span className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-slate-300 flex-shrink-0" aria-hidden="true" />
                  )}
                  <span className="text-lg font-bold text-slate-900">{s.title}</span>
                  <span className="text-sm font-semibold text-slate-600">{pr.answered}/{pr.total}{pr.done && pr.total > 0 ? ' · done' : ''}</span>
                </span>
                <ChevronDown className={`h-5 w-5 text-slate-600 flex-shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
              </button>
            </h2>
            {open && (
              <div id={`sec-body-${s.key}`} className="mt-2 space-y-2">
                {s.note && <p className="px-1 text-base sm:text-sm text-slate-600">{s.note}</p>}
                <ul className="space-y-2">
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
                      dateLabel={l.section === 'ppe' || l.section === 'hs' ? checklist.find((c) => c.id === l.checklist_item_id)?.date_label ?? null : null}
                      otherAnswer={otherAnswerFor(checklist.find((c) => c.id === l.checklist_item_id))}
                      datedHs={l.section === 'hs' && !!checklist.find((c) => c.id === l.checklist_item_id)?.has_expiry}
                      hasGauge={l.section === 'hs' && !!checklist.find((c) => c.id === l.checklist_item_id)?.has_gauge}
                      stamp={stamp}
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
                  <button type="button" className={`${btn.secondary} w-full sm:w-auto`} onClick={() => setShowAddKit(true)}>
                    <Plus className="h-4 w-4" />Add kit
                  </button>
                )}
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

      {/* ------------------------------------------------ photos: the last section */}
      {target && photoSlots.length > 0 && (
        <PhotosSection slots={photoSlots} photos={photos} setPhotos={setPhotos} stamp={stamp} onError={setError} />
      )}

      {/* ------------------------------------------------ summary + actions: fixed above the Home / Site Audits / Kit & Plant bar on phone */}
      {target && (
        <div className="fixed sm:static inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 bg-white border-t sm:border border-slate-200 sm:rounded-xl px-4 py-2.5 sm:py-3 shadow-[0_-2px_8px_rgba(15,23,42,0.08)] sm:shadow-none">
          <div className="max-w-4xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <p className="text-base sm:text-sm font-semibold text-slate-900" aria-live="polite">
              <span className={summary.fails ? 'text-red-700' : ''}>{summary.fails} fail{summary.fails === 1 ? '' : 's'}</span>,{' '}
              <span className={summary.expired ? 'text-red-700' : ''}>{summary.expired} expired</span>,{' '}
              <span className={summary.dueSoon ? 'text-amber-800' : ''}>{summary.dueSoon} due soon</span>
              {savedAt && <span className="ml-2 text-xs font-normal text-slate-600">Draft saved {savedAt}</span>}
              {photoSlots.length > 0 && suggestedNote(photoState) && (
                <span className="block text-sm font-semibold text-amber-800">{suggestedNote(photoState)}</span>
              )}
            </p>
            <div className="grid grid-cols-2 sm:flex gap-2">
              <button type="button" className={btn.secondary} onClick={onSaveDraft} disabled={!!busy}>
                <Save className="h-4 w-4" />{busy === 'draft' ? 'Saving…' : 'Save draft'}
              </button>
              <button type="button" className={btn.primary} onClick={onSubmitPressed} disabled={!!busy}>
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
      {missingPhotos && missingPhotos.length > 0 && (
        <Sheet
          title={`Submit without ${missingPhotos.length} photo${missingPhotos.length === 1 ? '' : 's'}?`}
          subtitle={`Not taken: ${missingPhotos.map((m) => m.name).join(', ')}. Photos are optional.`}
          onClose={() => setMissingPhotos(null)}
          footer={
            <>
              <button type="button" className={btn.secondary} onClick={() => { const f = missingPhotos[0]; setMissingPhotos(null); jumpToPhoto(f.id); }}>
                Add photos
              </button>
              <button type="button" className={btn.primary} onClick={afterPhotos}>Submit anyway</button>
            </>
          }
        >
          <p className="text-base sm:text-sm text-slate-700">The PDF will list them as “Not taken”.</p>
        </Sheet>
      )}
      {unanswered && !missingPhotos && (
        <Sheet
          title={`${unanswered.length} item${unanswered.length === 1 ? '' : 's'} not answered`}
          subtitle="Answer Y / N (or Not carried for kit) before submitting, or submit as it is."
          onClose={() => setUnanswered(null)}
          footer={
            <>
              <button type="button" className={btn.secondary} onClick={() => { setUnanswered(null); setConfirmSubmit(true); }}>Submit anyway</button>
              <button type="button" className={btn.primary} onClick={() => { const f = unanswered[0]; setUnanswered(null); jumpTo(f.section, f.key); }}>
                Go to the first one
              </button>
            </>
          }
        >
          <ul className="space-y-1" aria-label="Not answered">
            {unanswered.slice(0, 12).map((l) => (
              <li key={l.key}>
                <button type="button" onClick={() => { setUnanswered(null); jumpTo(l.section, l.key); }}
                  className="w-full min-h-[44px] flex items-center justify-between gap-2 px-3 rounded-lg border border-slate-200 text-left text-base sm:text-sm text-slate-900 hover:bg-slate-50 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                  <span className="font-semibold">{l.item_name}</span>
                  <span className="text-xs font-semibold text-slate-600 uppercase">{SECTIONS.find((x) => x.key === l.section)?.title}</span>
                </button>
              </li>
            ))}
          </ul>
          {unanswered.length > 12 && <p className="text-base sm:text-sm text-slate-600">and {unanswered.length - 12} more.</p>}
        </Sheet>
      )}
      {confirmSubmit && (
        <Sheet
          title="Submit this audit?"
          subtitle="Kit and PPE go onto their Kit & Plant record. You can still correct it later with Edit audit."
          onClose={() => setConfirmSubmit(false)}
          footer={
            <>
              <button type="button" className={btn.secondary} onClick={() => setConfirmSubmit(false)}>Keep editing</button>
              <button type="button" className={btn.primary} onClick={onSubmit}>Submit audit</button>
            </>
          }
        >
          <p className="text-base sm:text-sm text-slate-700">
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
  datedHs = false,
  hasGauge = false,
  stamp,
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
  /** first aid kit, eye wash, burns kit, fire extinguisher: an expiry date (round 9) */
  datedHs?: boolean;
  /** fire extinguisher: Pressure gauge Green / Amber / Red */
  hasGauge?: boolean;
  /** van reg and site, stamped on the photo */
  stamp: StampInfo;
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
  const commentOpen = showComment || line.result === 'N';
  const failed = line.result === 'N' || line.label_on === 'N' || line.gauge === 'red';
  const setServiceDate = (v: string | null) => {
    const next = applyServiceDate(
      { serviceDate: line.service_date ?? null, expiry: line.expiry_date, expiryManual: !!line.expiryManual },
      v,
      months
    );
    onChange({ service_date: next.serviceDate, expiry_date: next.expiry });
  };
  // a date the expiry counts from: hard hats "Date on hat", fire extinguisher "Service date"
  const datedPpe = (line.section === 'ppe' || datedHs) && !!months;
  const hasExpiry = line.section === 'ppe' || isKit || datedHs;

  const onPhoto = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    onError(null);
    try {
      const { path, takenAt } = await uploadAuditPhoto(file, 'lines', stamp);
      onChange({ photo_path: path, photo_taken_at: takenAt });
      setPreview(URL.createObjectURL(file));
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Photo upload failed.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <li
      id={`line-${line.key}`}
      className={`scroll-mt-24 rounded-xl border bg-white p-4 ${failed ? 'border-red-200' : 'border-slate-200'} ${notCarried ? 'bg-slate-50' : ''}`}
    >
      {/* name large and bold, expected qty / hint underneath */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={`text-base font-bold leading-snug ${notCarried ? 'text-slate-600' : 'text-slate-900'}`}>{line.item_name}</p>
          {line.expected_qty && <p className="text-base sm:text-sm text-slate-600 mt-0.5">{line.expected_qty}</p>}
          {notCarried && <p className="text-sm font-semibold text-slate-700 mt-0.5">Not carried on this van</p>}
          {issued > 0 && <p className="text-sm font-semibold text-violet-700 mt-0.5">Issued since last audit: {issued}</p>}
        </div>
        {line.plant_no_snapshot && isKit && !notCarried && (
          <span className="flex-shrink-0 text-xs font-semibold text-slate-600 bg-slate-100 border border-slate-200 rounded-md px-2 py-1">{line.plant_no_snapshot}</span>
        )}
      </div>

      {!notCarried && (
        // every field has the same fixed label line, so all inputs start on one top line
        <div className="mt-3 grid grid-cols-2 lg:grid-cols-4 gap-x-3 gap-y-3 items-start">
          <div className="col-span-2 lg:col-span-1">
            <div className={LABEL_LINE}><span className={LABEL_TEXT}>Fit for purpose</span></div>
            <YesNo value={line.result} label={line.item_name} onChange={(v) => onChange({ result: v })} />
          </div>
          {isKit ? (
            <>
              <Field label="Plant no">
                {(id) => <input id={id} className={inputCls} value={line.plant_no_snapshot ?? ''} onChange={(e) => onChange({ plant_no_snapshot: e.target.value })} autoCapitalize="characters" />}
              </Field>
              <Field label="Service date">
                {(id) => <input id={id} type="date" className={inputCls} value={line.service_date ?? ''} onChange={(e) => setServiceDate(e.target.value || null)} />}
              </Field>
            </>
          ) : (
            <Field label="Qty">
              {(id) => <input id={id} type="text" inputMode="numeric" pattern="[0-9]*" className={inputCls} value={line.qty ?? ''} onChange={(e) => onChange({ qty: e.target.value })} />}
            </Field>
          )}
          {datedPpe && (
            <Field label={dateLabel ?? 'Date'}>
              {(id) => <input id={id} type="date" className={inputCls} value={line.service_date ?? ''} onChange={(e) => setServiceDate(e.target.value || null)} />}
            </Field>
          )}
          {hasExpiry && (
            <div className={datedPpe || isKit ? 'col-span-2 lg:col-span-1' : ''}>
              <ExpiryInput line={line} auditDate={auditDate} months={months} onChange={onChange} />
            </div>
          )}
          {hasGauge && (
            <div className="col-span-2 lg:col-span-1">
              <div className={LABEL_LINE}><span className={LABEL_TEXT}>Pressure gauge</span></div>
              <GaugeButtons value={line.gauge ?? null} label={line.item_name} onChange={(v) => onChange({ gauge: v })} />
            </div>
          )}
          {line.section === 'other' && otherAnswer === 'label' && (
            <div className="col-span-2 sm:col-span-1">
              <div className={LABEL_LINE}><span className={LABEL_TEXT}>Label on?</span></div>
              <YesNo value={line.label_on ?? null} label={line.item_name} question="label on" onChange={(v) => onChange({ label_on: v })} />
            </div>
          )}
          {line.section === 'other' && otherAnswer === 'date_tag' && (
            <Field label="Date / tag / label">
              {(id) => <input id={id} className={inputCls} value={line.date_tag ?? ''} onChange={(e) => onChange({ date_tag: e.target.value })} />}
            </Field>
          )}
        </div>
      )}

      {/* small actions; nothing extra on rows that pass */}
      {(isKit || onSwap || onRemove || (!commentOpen && !notCarried)) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2">
          {!commentOpen && !notCarried && (
            <button type="button" onClick={() => setShowComment(true)}
              className="inline-flex items-center gap-1.5 min-h-[44px] text-sm font-semibold text-blue-700 hover:underline cursor-pointer rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
              <MessageSquare className="h-4 w-4" aria-hidden="true" />Add comment
            </button>
          )}
          {isKit && (
            <button type="button" className={btn.small} aria-pressed={notCarried} onClick={() => onChange({ result: notCarried ? null : 'not_carried' })}>
              <Ban className="h-4 w-4" aria-hidden="true" />{notCarried ? 'Carried on this van' : 'Not carried'}
            </button>
          )}
          {onSwap && !notCarried && (
            <button type="button" className={btn.small} onClick={onSwap}>
              <ArrowLeftRight className="h-4 w-4" aria-hidden="true" />Swap kit
            </button>
          )}
          {onRemove && (
            <button type="button" className={btn.small} onClick={onRemove}>
              <X className="h-4 w-4" aria-hidden="true" />Remove line
            </button>
          )}
        </div>
      )}

      {/* comment + photo: only when N is pressed, or "Add comment" */}
      {commentOpen && !notCarried && (
        <div className="mt-3 pt-3 border-t border-slate-200 space-y-2">
          <Field label={line.result === 'N' ? 'What’s wrong? (comment)' : 'Comment'}>
            {(id) => <textarea id={id} rows={2} className={`${inputCls} py-2`} value={line.comment ?? ''} onChange={(e) => onChange({ comment: e.target.value })} />}
          </Field>
          {line.result === 'N' && (
            <div className="flex flex-wrap items-center gap-2">
              {preview && <img src={preview} alt={`Photo of ${line.item_name}`} className="h-12 w-12 rounded-lg object-cover border border-slate-200" />}
              <label className={`${btn.secondary} ${uploading ? 'opacity-50' : ''}`}>
                <Camera className="h-4 w-4" aria-hidden="true" />
                {uploading ? 'Uploading…' : line.photo_path ? 'Retake photo' : 'Take photo (optional)'}
                <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => { onPhoto(e.target.files?.[0]); e.target.value = ''; }} />
              </label>
              <label className={`${btn.secondary} ${uploading ? 'opacity-50' : ''}`}>
                <ImagePlus className="h-4 w-4" aria-hidden="true" />Choose from library
                <input type="file" accept="image/*" className="sr-only" onChange={(e) => { onPhoto(e.target.files?.[0]); e.target.value = ''; }} />
              </label>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

/**
 * Expiry: the badge sits in a fixed spot on the label line and the "Auto: N months" note
 * has its line reserved, so nothing moves when the expiry fills itself in.
 */
function ExpiryInput({ line, auditDate, months, onChange }: { line: DraftLine; auditDate: string; months: number | null; onChange: (p: Partial<DraftLine>) => void }) {
  const [open, setOpen] = useState(!!line.expiry_date);
  const showInput = open || !!line.expiry_date;
  const auto = !!months && !line.expiryManual && !!line.expiry_date;
  return (
    <div>
      <div className={LABEL_LINE}>
        <label htmlFor={`exp-${line.key}`} className={LABEL_TEXT}>Expiry</label>
      </div>
      {showInput ? (
        <div className="flex gap-2">
          <input
            id={`exp-${line.key}`}
            type="date"
            aria-describedby={`exp-note-${line.key}`}
            className={`${inputCls} ${expiryRing(line.expiry_date, auditDate)}`}
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
            className="flex-shrink-0 min-w-[48px] min-h-[48px] sm:min-h-[44px] rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 cursor-pointer flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <button id={`exp-${line.key}`} type="button" className={`${btn.secondary} w-full`} onClick={() => setOpen(true)} aria-label={`${line.item_name} expiry: N/A, tap to add a date`}>
          N/A · add date
        </button>
      )}
      {/* status straight under the field (coloured + worded), then the auto note; both lines always reserved */}
      <ExpiryNote id={`exp-note-${line.key}`} expiry={line.expiry_date} today={auditDate} />
      <p className="text-xs text-slate-600 min-h-[1rem] leading-4">{auto ? `Auto: ${months} months, change if needed` : ''}</p>
    </div>
  );
}
