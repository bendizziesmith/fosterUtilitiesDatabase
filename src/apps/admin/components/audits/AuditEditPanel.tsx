import { useMemo, useState } from 'react';
import { Field, ErrorNote, YesNo, LABEL_LINE, LABEL_TEXT, ExpiryNote, GaugeButtons } from './ui';
import { AlertTriangle } from 'lucide-react';
import { btn, inputCls, card, expiryRing } from './styles';
import { ActorPicker } from './ActorPicker';
import { useActor } from './useActor';
import { Auditor, AuditLineRow } from '../../../../lib/supabase';
import { dateAlerts, diffAuditLines, EditableLine } from '../../../../lib/fleetLogic';
import { editAudit } from '../../../../lib/fleetService';

const SECTION_TITLE: Record<string, string> = { ppe: 'PPE', hs: 'Health & safety', kit: 'Kit', other: 'Other' };

/** "Edit audit": change answers on a submitted audit. Logged, and written back like submit. */
export function AuditEditPanel({ auditId, lines, auditors, onCancel, onSaved, otherAnswer, auditDate, isDated, hasGauge }: {
  auditId: string; lines: AuditLineRow[]; auditors: Auditor[]; onCancel: () => void; onSaved: (summary: string[]) => void;
  /** what an Other line asks besides Fit for purpose / Qty / Comment */
  otherAnswer: (l: AuditLineRow) => 'label' | 'date_tag' | 'none';
  /** the audit date: expiry status is judged on it */
  auditDate: string;
  /** H&S items with an expiry (first aid kit, eye wash, burns kit, fire extinguisher) */
  isDated: (l: AuditLineRow) => boolean;
  /** fire extinguisher pressure gauge */
  hasGauge: (l: AuditLineRow) => boolean;
}) {
  const before = useMemo<EditableLine[]>(() => lines.map((l) => ({
    id: l.id, item_name: l.item_name, result: l.result, qty: l.qty, comment: l.comment, expiry_date: l.expiry_date,
    service_date: l.service_date, plant_no_snapshot: l.plant_no_snapshot, date_tag: l.date_tag, label_on: l.label_on ?? null,
    gauge: l.gauge ?? null,
  })), [lines]);
  const [edited, setEdited] = useState<EditableLine[]>(before);
  const { actorId, setActorId } = useActor(auditors);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const diff = diffAuditLines(before, edited);
  const set = (id: string, patch: Partial<EditableLine>) => setEdited((xs) => xs.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const sectionOf = (id: string) => lines.find((l) => l.id === id)?.section ?? 'other';
  const lineOf = (id: string) => lines.find((x) => x.id === id);
  const alerts = dateAlerts(edited, auditDate);
  const flagged = new Set([...alerts.expired, ...alerts.dueSoon]);
  const jump = (id: string) => {
    const el = document.getElementById(`edit-${id}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    (el?.querySelector('input[type="date"]') as HTMLElement | null)?.focus({ preventScroll: true });
  };
  const answerOf = (id: string) => {
    const l = lines.find((x) => x.id === id);
    return l ? otherAnswer(l) : 'none';
  };

  const save = async () => {
    setError(null);
    if (!actorId) return setError('Pick who’s doing this.');
    if (!diff.changes.length) return setError('Nothing has been changed yet.');
    setBusy(true);
    try {
      onSaved(await editAudit(auditId, diff.changes, actorId));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the changes.');
      setBusy(false);
    }
  };

  return (
    <section className={`${card} p-4 sm:p-5 space-y-4 border-blue-300`} aria-labelledby="edit-h">
      <div>
        <h2 id="edit-h" className="text-base font-bold text-slate-900">Edit audit</h2>
        <p className="text-xs text-slate-600">Change any answer. Every change is logged with who did it, and kit and PPE dates are written back to their record.</p>
      </div>
      <ActorPicker auditors={auditors} value={actorId} onChange={setActorId} />
      {alerts.text && (
        <div role="status" className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
          <AlertTriangle className="h-5 w-5 text-amber-800 flex-shrink-0" aria-hidden="true" />
          <span className="text-base sm:text-sm font-semibold text-amber-800">{alerts.text}</span>
          {alerts.expired.length > 0 && (
            <button type="button" className={btn.small} onClick={() => jump(alerts.expired[0])}>Go to expired</button>
          )}
          {alerts.dueSoon.length > 0 && (
            <button type="button" className={btn.small} onClick={() => jump(alerts.dueSoon[0])}>Go to due soon</button>
          )}
        </div>
      )}
      {(['ppe', 'hs', 'kit', 'other'] as const).map((sec) => {
        const rows = edited.filter((l) => sectionOf(l.id) === sec);
        if (!rows.length) return null;
        return (
          <fieldset key={sec}>
            <legend className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">{SECTION_TITLE[sec]}</legend>
            <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200">
              {rows.map((l) => (
                <li key={l.id} id={`edit-${l.id}`} className={`scroll-mt-24 p-3 grid grid-cols-2 lg:grid-cols-4 gap-3 items-start ${alerts.expired.includes(l.id) ? 'bg-red-50' : flagged.has(l.id) ? 'bg-amber-50' : ''}`}>
                  <p className="col-span-2 lg:col-span-4 text-base sm:text-sm font-bold text-slate-900">{l.item_name}</p>
                  <div className="col-span-2 lg:col-span-1">
                    <div className={LABEL_LINE}><span className={LABEL_TEXT}>Fit for purpose</span></div>
                    {l.result === 'not_carried' ? (
                      <button type="button" className={btn.small} onClick={() => set(l.id, { result: null })}>Not carried · change</button>
                    ) : (
                      <YesNo value={l.result as 'Y' | 'N' | null} label={l.item_name} onChange={(v) => set(l.id, { result: v })} />
                    )}
                  </div>
                  {sec === 'kit' ? (
                    <Field label="Plant no">{(id) => <input id={id} className={inputCls} value={l.plant_no_snapshot ?? ''} onChange={(e) => set(l.id, { plant_no_snapshot: e.target.value })} />}</Field>
                  ) : (
                    <Field label="Qty">{(id) => <input id={id} inputMode="numeric" className={inputCls} value={l.qty ?? ''} onChange={(e) => set(l.id, { qty: e.target.value })} />}</Field>
                  )}
                  {(sec === 'ppe' || sec === 'kit' || (sec === 'hs' && lineOf(l.id) && isDated(lineOf(l.id)!))) ? (
                    <div>
                      <Field label="Expiry">{(id) => <input id={id} type="date" className={`${inputCls} ${expiryRing(l.expiry_date, auditDate)}`} value={l.expiry_date ?? ''} onChange={(e) => set(l.id, { expiry_date: e.target.value || null })} />}</Field>
                      <ExpiryNote expiry={l.expiry_date} today={auditDate} />
                    </div>
                  ) : sec === 'other' && answerOf(l.id) === 'label' ? (
                    <div>
                      <div className={LABEL_LINE}><span className={LABEL_TEXT}>Label on?</span></div>
                      <YesNo value={(l.label_on as 'Y' | 'N' | null) ?? null} label={l.item_name} question="label on" onChange={(v) => set(l.id, { label_on: v })} />
                    </div>
                  ) : sec === 'other' && answerOf(l.id) === 'date_tag' ? (
                    <Field label="Date / tag / label">{(id) => <input id={id} className={inputCls} value={l.date_tag ?? ''} onChange={(e) => set(l.id, { date_tag: e.target.value })} />}</Field>
                  ) : <div className="hidden sm:block" />}
                  {sec === 'hs' && lineOf(l.id) && hasGauge(lineOf(l.id)!) && (
                    <div className="col-span-2 lg:col-span-1">
                      <div className={LABEL_LINE}><span className={LABEL_TEXT}>Pressure gauge</span></div>
                      <GaugeButtons value={(l.gauge as 'green' | 'amber' | 'red' | null) ?? null} label={l.item_name} onChange={(v) => set(l.id, { gauge: v })} />
                    </div>
                  )}
                  <Field label="Comment" className="col-span-2 lg:col-span-1">{(id) => <input id={id} className={inputCls} value={l.comment ?? ''} onChange={(e) => set(l.id, { comment: e.target.value })} />}</Field>
                </li>
              ))}
            </ul>
          </fieldset>
        );
      })}
      {diff.summary.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3" aria-live="polite">
          <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">Changes to save</p>
          <ul className="text-base sm:text-sm text-slate-800 list-disc ml-5">{diff.summary.map((x) => <li key={x}>{x}</li>)}</ul>
        </div>
      )}
      <ErrorNote message={error} />
      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
        <button type="button" className={btn.secondary} onClick={onCancel}>Cancel</button>
        <button type="button" className={btn.primary} disabled={busy} onClick={save}>{busy ? 'Saving…' : `Save ${diff.changes.length || ''} change${diff.changes.length === 1 ? '' : 's'}`}</button>
      </div>
    </section>
  );
}
