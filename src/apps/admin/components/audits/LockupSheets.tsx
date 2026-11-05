import { useState } from 'react';
import { Sheet, Field, ErrorNote } from './ui';
import { btn, inputCls, TEST_MODE, formatDate } from './styles';
import { ActorPicker } from './ActorPicker';
import { useActor } from './useActor';
import { TargetPicker } from './TargetPicker';
import { AuditChecklistItem, Auditor } from '../../../../lib/supabase';
import { AuditTarget, todayISO } from '../../../../lib/siteAuditLogic';
import { LockupSection, lockupExpiryFromHat } from '../../../../lib/lockupLogic';
import { addToLockup, issueFromLockup, returnToLockup, LockupRow } from '../../../../lib/lockupService';

const SECTION_NAME: Record<LockupSection, string> = { ppe: 'PPE', hs: 'Health & safety', other: 'Other' };
const wholeNumber = (v: string) => v.replace(/\D/g, '');

/** "+ Add to lockup": an audit-sheet line (PPE / H&S / Other) or a new item, with a quantity. */
export function AddLockupSheet({ checklist, auditors, onClose, onSaved }: {
  checklist: AuditChecklistItem[]; auditors: Auditor[]; onClose: () => void; onSaved: () => void;
}) {
  const { actorId, setActorId } = useActor(auditors);
  const [itemId, setItemId] = useState(checklist[0]?.id ?? '__new');
  const [section, setSection] = useState<LockupSection>('ppe');
  const [name, setName] = useState('');
  const [qty, setQty] = useState('1');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setError(null);
    if (!actorId) return setError('Pick who’s doing this.');
    const n = Number(qty);
    if (!Number.isInteger(n) || n < 1) return setError('Enter how many (1 or more).');
    if (itemId === '__new' && !name.trim()) return setError('Type the name of the new item.');
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
      });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add to the lockup.');
      setBusy(false);
    }
  };

  return (
    <Sheet title="Add to Yard Lockup" subtitle="Stock counted by quantity. For plant kit with a plant no, use “Add plant kit”." onClose={onClose}
      footer={<><button type="button" className={btn.secondary} onClick={onClose}>Cancel</button><button type="button" className={btn.primary} disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Add to lockup'}</button></>}>
      <ActorPicker auditors={auditors} value={actorId} onChange={setActorId} />
      <Field label="Item">
        {(id) => (
          <select id={id} className={inputCls} value={itemId} onChange={(e) => setItemId(e.target.value)}>
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
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Quantity">{(id) => <input id={id} inputMode="numeric" className={inputCls} value={qty} onChange={(e) => setQty(wholeNumber(e.target.value))} />}</Field>
        <Field label="Note (optional)">{(id) => <input id={id} className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. sizes M/L" />}</Field>
      </div>
      <ErrorNote message={error} />
    </Sheet>
  );
}

/** "Issue to": a person, a quantity, and for dated PPE the "Date on hat" (sets their PPE expiry). */
export function IssueSheet({ line, people, auditors, onClose, onSaved }: {
  line: LockupRow; people: AuditTarget[]; auditors: Auditor[]; onClose: () => void; onSaved: (msg: string) => void;
}) {
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
      onSaved(`${n} × ${line.name} issued to ${person.personName}.${newExpiry ? ` Their ${line.name.toLowerCase()} expiry is now ${formatDate(newExpiry)}.` : ''}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not issue.');
      setBusy(false);
    }
  };

  return (
    <Sheet title={`Issue ${line.name}`} subtitle={`${line.quantity} in the Yard Lockup`} onClose={onClose}
      footer={<><button type="button" className={btn.secondary} onClick={onClose}>Cancel</button><button type="button" className={btn.primary} disabled={busy || line.quantity < 1} onClick={save}>{busy ? 'Saving…' : 'Issue'}</button></>}>
      <ActorPicker auditors={auditors} value={actorId} onChange={setActorId} />
      <TargetPicker label="Issue to" targets={people} value={personKey} onChange={setPersonKey} placeholder="Type a name…" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Quantity" hint={`Up to ${line.quantity}`}>{(id) => <input id={id} inputMode="numeric" className={inputCls} value={qty} onChange={(e) => setQty(wholeNumber(e.target.value))} />}</Field>
        {dated && (
          <Field label={line.date_label ?? 'Date'} hint={newExpiry ? `Their PPE expiry becomes ${formatDate(newExpiry)} (${line.service_interval_months} months)` : undefined}>
            {(id) => <input id={id} type="date" className={inputCls} value={hat} onChange={(e) => setHat(e.target.value)} />}
          </Field>
        )}
      </div>
      <Field label="Note (optional)">{(id) => <input id={id} className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
      {line.quantity < 1 && <p className="text-sm text-red-700">None left in the Yard Lockup.</p>}
      <ErrorNote message={error} />
    </Sheet>
  );
}

/** "Return to lockup" from a person's page: only up to what they still hold from it. */
export function ReturnSheet({ issue, personId, personName, auditors, onClose, onSaved }: {
  issue: { stock_id: string; item_name: string; quantity_held: number };
  personId: string; personName: string; auditors: Auditor[]; onClose: () => void; onSaved: () => void;
}) {
  const { actorId, setActorId } = useActor(auditors);
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
    setBusy(true);
    try {
      await returnToLockup({ stockId: issue.stock_id, employeeId: personId, quantity: n, note: note.trim() || null, actorId });
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
      <Field label="Note (optional)">{(id) => <input id={id} className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
      <ErrorNote message={error} />
    </Sheet>
  );
}
