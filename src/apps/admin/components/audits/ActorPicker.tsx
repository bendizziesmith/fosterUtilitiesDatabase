import { Field } from './ui';
import { inputCls } from './styles';
import { Auditor } from '../../../../lib/supabase';

/** "Who's doing this?" / "Audited by" — a pick list of the auditors (audit_auditors). */
export function ActorPicker({
  auditors,
  value,
  onChange,
  label = 'Who’s doing this?',
  className,
}: {
  auditors: Auditor[];
  value: string;
  onChange: (id: string) => void;
  label?: string;
  className?: string;
}) {
  return (
    <Field label={label} className={className}>
      {(id) => (
        <select id={id} className={inputCls} value={value} onChange={(e) => onChange(e.target.value)} required>
          <option value="">Pick a name…</option>
          {auditors.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      )}
    </Field>
  );
}
