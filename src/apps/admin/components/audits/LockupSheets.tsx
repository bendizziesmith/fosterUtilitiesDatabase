import { Wrench } from 'lucide-react';
import { useState } from 'react';
import { Sheet, Field, ErrorNote } from './ui';
import { btn, inputCls, TEST_MODE, formatDate, dateCls } from './styles';
import { ActorPicker } from './ActorPicker';
import { useActor } from './useActor';
import { TargetPicker } from './TargetPicker';
import { AuditChecklistItem, Auditor } from '../../../../lib/supabase';
import { AuditTarget, ServiceExpiryState, todayISO } from '../../../../lib/siteAuditLogic';
import { hsDateKind, hsStartDates, issueCopiesDates, issueLineOptions, lineForExpiry, lockupDatesError, lockupLineLabel, HsDateKind } from '../../../../lib/hsDatesLogic';
import { HsDateFields } from './HsDateFields';
import { LockupSection, lockupExpiryFromHat } from '../../../../lib/lockupLogic';
import { addToLockup, issueFromLockup, returnDatedToLockup, returnToLockup, LockupRow } from '../../../../lib/lockupService';

const SECTION_NAME: Record<LockupSection, string> = { ppe: 'PPE', hs: 'Health & safety', other: 'Other' };
const wholeNumber = (v: string) => v.replace(/\D/g, '');

/** "+ Add to lockup": an audit-sheet line (PPE / H&S / Other) or a new item, with a quantity. */
export function AddLockupSheet({ checklist, lines = [], auditors, onClose, onSaved, onPlantKit }: {
  checklist: AuditChecklistItem[]; auditors: Auditor[]; onClose: () => void; onSaved: () => void;
  /** what is in the lockup now: says when a dated item adds to an existing line */
  lines?: LockupRow[];
  /** plant kit with a plant no is added as kit (Add plant kit) */
  onPlantKit?: () => void;
}) {
  const { actorId, setActorId } = useActor(auditors);
  const [itemId, setItemId] = useState(checklist[0]?.id ?? '__new');
  const [section, setSection] = useState<LockupSection>('ppe');
  const [name, setName] = useState('');
  const [qty, setQty] = useState('1');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // the 4 dated H&S items need their dates (round 15)
  const kind: HsDateKind | null = itemId === '__new' ? null : hsDateKind(checklist.find((c) => c.id === itemId));
  const [dates, setDates] = useState<ServiceExpiryState>(() => hsStartDates(kind, todayISO()));
  const pickItem = (id: string) => {
    setItemId(id);
    setDates(hsStartDates(id === '__new' ? null : hsDateKind(checklist.find((c) => c.id === id)), todayISO()));
  };
  const sameLine = kind && dates.expiry ? lineForExpiry(lines.filter((l) => l.is_test === TEST_MODE), itemId, dates.expiry) : null;

  const save = async () => {
    setError(null);
    if (!actorId) return setError('Pick who’s doing this.');
    const n = Number(qty);
    if (!Number.isInteger(n) || n < 1) return setError('Enter how many (1 or more).');
    if (itemId === '__new' && !name.trim()) return setError('Type the name of the new item.');
    const datesError = lockupDatesError(kind, dates.serviceDate, dates.expiry);
    if (datesError) return setError(datesError);
    setBusy(true);
    try {
      await addToLockup({
        section: itemId === '__new' ? section : (checklist.find((c) => c.id === itemId)?.section ?? 'ppe'),
        checklistItemId: itemId === '__new' ? null : itemId,
        customName: itemId === '__new' ? name.trim() : null,
        quantity: n,
        note: note.trim() || null,
        isTest: TEST_MODE,
        actorId,
        testedDate: kind === 'tested' ? dates.serviceDate : null,
        expiryDate: kind ? dates.expiry : null,
      });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add to the lockup.');
      setBusy(false);
    }
  };

  return (
    <Sheet title="Add to Yard Lockup" subtitle="Stock counted by quantity." onClose={onClose}
      footer={<><button type="button" className={btn.secondary} onClick={onClose}>Cancel</button><button type="button" className={btn.primary} disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Add to lockup'}</button></>}>
      <ActorPicker auditors={auditors} value={actorId} onChange={setActorId} />
      {onPlantKit && (
        <button type="button" onClick={onPlantKit}
          className="w-full min-h-[48px] flex items-center gap-3 px-3 rounded-lg border border-slate-200 bg-slate-50 text-left hover:bg-slate-100 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
          <Wrench className="h-5 w-5 text-blue-600 flex-shrink-0" aria-hidden="true" />
          <span>
            <span className="block text-base sm:text-sm font-semibold text-slate-900">Add plant kit</span>
            <span className="block text-sm text-slate-600">Kit with a plant no (saw, digger…) goes in as its own item</span>
          </span>
        </button>
      )}
      <Field label="Item">
        {(id) => (
          <select id={id} className={inputCls} value={itemId} onChange={(e) => pickItem(e.target.value)}>
            {(['ppe', 'hs', 'other'] as LockupSection[]).map((s) => (
              <optgroup key={s} label={SECTION_NAME[s]}>
                {checklist.filter((c) => c.section === s).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </optgroup>
            ))}
            <option value="__new">+ New item…</option>
          </select>
        )}
      </Field>
      {itemId === '__new' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Section">
            {(id) => (
              <select id={id} className={inputCls} value={section} onChange={(e) => setSection(e.target.value as LockupSection)}>
                <option value="ppe">PPE</option>
                <option value="hs">Health & safety</option>
                <option value="other">Other</option>
              </select>
            )}
          </Field>
          <Field label="New item name">{(id) => <input id={id} className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ear plugs" />}</Field>
        </div>
      )}
      {kind && (
        <>
          <HsDateFields kind={kind} state={dates} onChange={setDates} />
          <p className="text-sm text-slate-700" role="status">
            {sameLine
              ? `Adds to the ${sameLine.quantity} already in with this expiry.`
              : 'Stock with a different expiry is kept as its own line.'}
          </p>
        </>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Quantity">{(id) => <input id={id} inputMode="numeric" className={inputCls} value={qty} onChange={(e) => setQty(wholeNumber(e.target.value))} />}</Field>
        <Field label="Note (optional)">{(id) => <input id={id} className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. sizes M/L" />}</Field>
      </div>
      <ErrorNote message={error} />
    </Sheet>
  );
}

/**
 * "Issue to": a person, a quantity, and for dated PPE the "Date on hat" (sets their PPE expiry).
 * Dated H&S (round 15): pick which line (oldest expiry pre-selected); its dates go onto the person's record.
 */
export function IssueSheet({ line: first, lines, people, auditors, onClose, onSaved }: {
  line: LockupRow;
  /** every line of a dated H&S item (one per expiry) */
  lines?: LockupRow[];
  people: AuditTarget[]; auditors: Auditor[]; onClose: () => void; onSaved: (msg: string) => void;
}) {
  const options = first.date_kind ? issueLineOptions(lines?.length ? lines : [first]) : [first];
  const [lineId, setLineId] = useState(options[0]?.id ?? first.id);
  const line = options.find((l) => l.id === lineId) ?? first;
  const copies = issueCopiesDates(line);
  const { actorId, setActorId } = useActor(auditors);
  const [personKey, setPersonKey] = useState('');
  const [qty, setQty] = useState('1');
  const [hat, setHat] = useState(todayISO());
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const person = people.find((p) => p.key === personKey);
  const dated = line.section === 'ppe' && !!line.service_interval_months;
  const newExpiry = dated ? lockupExpiryFromHat(hat || null, line.service_interval_months) : null;

  const save = async () => {
    setError(null);
    if (!actorId) return setError('Pick who’s doing this.');
    if (!person?.personId) return setError('Pick who it is issued to.');
    const n = Number(qty);
    if (!Number.isInteger(n) || n < 1) return setError('Enter how many (1 or more).');
    if (n > line.quantity) return setError(`Only ${line.quantity} in the Yard Lockup, so ${n} can’t be issued.`);
    setBusy(true);
    try {
      await issueFromLockup({ stockId: line.id, employeeId: person.personId, quantity: n, dateOnHat: dated ? hat || null : null, note: note.trim() || null, actorId });
      const expiryNow = newExpiry ?? copies?.expiryDate ?? null;
      onSaved(`${n} × ${line.name} issued to ${person.personName}.${expiryNow ? ` Their ${line.name.toLowerCase()} expiry is now ${formatDate(expiryNow)}.` : ''}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not issue.');
      setBusy(false);
    }
  };

  return (
    <Sheet title={`Issue ${line.name}`} subtitle={`${first.date_kind ? options.reduce((n, l) => n + l.quantity, 0) : line.quantity} in the Yard Lockup`} onClose={onClose}
      footer={<><button type="button" className={btn.secondary} onClick={onClose}>Cancel</button><button type="button" className={btn.primary} disabled={busy || line.quantity < 1} onClick={save}>{busy ? 'Saving…' : 'Issue'}</button></>}>
      <ActorPicker auditors={auditors} value={actorId} onChange={setActorId} />
      <TargetPicker label="Issue to" targets={people} value={personKey} onChange={setPersonKey} placeholder="Type a name…" />
      {first.date_kind && options.length > 0 && (
        <Field label="Which one?" hint={copies?.expiryDate ? `Their record gets ${copies.testedDate ? `date tested ${formatDate(copies.testedDate)} and ` : ''}expiry ${formatDate(copies.expiryDate)}` : 'This line has no dates'}>
          {(id) => (
            <select id={id} className={inputCls} value={lineId} onChange={(e) => setLineId(e.target.value)}>
              {options.map((l) => <option key={l.id} value={l.id}>{lockupLineLabel(l)}</option>)}
            </select>
          )}
        </Field>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Quantity" hint={`Up to ${line.quantity}`} reserveHint={2}>{(id) => <input id={id} inputMode="numeric" className={inputCls} value={qty} onChange={(e) => setQty(wholeNumber(e.target.value))} />}</Field>
        {dated && (
          <Field label={line.date_label ?? 'Date'} reserveHint={2} hint={newExpiry ? `Their PPE expiry becomes ${formatDate(newExpiry)} (${line.service_interval_months} months)` : undefined}>
            {(id) => <input id={id} type="date" className={dateCls} value={hat} onChange={(e) => setHat(e.target.value)} />}
          </Field>
        )}
      </div>
      <Field label="Note (optional)">{(id) => <input id={id} className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
      {line.quantity < 1 && <p className="text-sm text-red-700">None left in the Yard Lockup.</p>}
      <ErrorNote message={error} />
    </Sheet>
  );
}

/**
 * "Return to lockup" from a person's page: only up to what they still hold from it.
 * Dated H&S (round 15): asks for the dates; it goes on the line with that expiry.
 */
export function ReturnSheet({ issue, kind = null, personId, personName, auditors, onClose, onSaved }: {
  issue: { stock_id: string; item_name: string; quantity_held: number };
  /** the 4 dated H&S items: which dates to ask for */
  kind?: HsDateKind | null;
  personId: string; personName: string; auditors: Auditor[]; onClose: () => void; onSaved: () => void;
}) {
  const { actorId, setActorId } = useActor(auditors);
  const [dates, setDates] = useState<ServiceExpiryState>(() => hsStartDates(kind, todayISO()));
  const [qty, setQty] = useState(String(issue.quantity_held));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    setError(null);
    if (!actorId) return setError('Pick who’s doing this.');
    const n = Number(qty);
    if (!Number.isInteger(n) || n < 1) return setError('Enter how many (1 or more).');
    if (n > issue.quantity_held) return setError(`${personName} only holds ${issue.quantity_held} from the Yard Lockup.`);
    const datesError = lockupDatesError(kind, dates.serviceDate, dates.expiry);
    if (datesError) return setError(datesError);
    setBusy(true);
    try {
      if (kind) {
        await returnDatedToLockup({ stockId: issue.stock_id, employeeId: personId, quantity: n, testedDate: kind === 'tested' ? dates.serviceDate : null, expiryDate: dates.expiry, note: note.trim() || null, actorId });
      } else {
        await returnToLockup({ stockId: issue.stock_id, employeeId: personId, quantity: n, note: note.trim() || null, actorId });
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not return it.');
      setBusy(false);
    }
  };
  return (
    <Sheet title={`Return ${issue.item_name} to Yard Lockup`} subtitle={`${personName} holds ${issue.quantity_held}`} onClose={onClose}
      footer={<><button type="button" className={btn.secondary} onClick={onClose}>Cancel</button><button type="button" className={btn.primary} disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Return to lockup'}</button></>}>
      <ActorPicker auditors={auditors} value={actorId} onChange={setActorId} />
      <Field label="Quantity" hint={`Up to ${issue.quantity_held}`}>{(id) => <input id={id} inputMode="numeric" className={inputCls} value={qty} onChange={(e) => setQty(wholeNumber(e.target.value))} />}</Field>
      {kind && <HsDateFields kind={kind} state={dates} onChange={setDates} />}
      <Field label="Note (optional)">{(id) => <input id={id} className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
      <ErrorNote message={error} />
    </Sheet>
  );
}
