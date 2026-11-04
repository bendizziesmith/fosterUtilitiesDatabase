import { useState } from 'react';
import { Sheet, ErrorNote } from './ui';
import { btn } from './styles';
import { AuditTarget } from '../../../../lib/siteAuditLogic';
import { DestinationFields, ReplacementFields, SwapNoteAndPreview } from './SwapFields';
import { useSwapForm, SwapItem } from './useSwapForm';
import { ActorPicker } from './ActorPicker';
import { useActor } from './useActor';
import { Auditor } from '../../../../lib/supabase';
import { holderLabel } from '../../../../lib/siteAuditLogic';

export function SwapKitSheet({
  item,
  targets,
  months,
  auditors,
  onClose,
  onSaved,
}: {
  item: SwapItem;
  targets: AuditTarget[];
  /** service interval of this kit type, for "+ Add a new" */
  months: number | null | undefined;
  auditors: Auditor[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const f = useSwapForm(item, targets);
  const { actorId, setActorId } = useActor(auditors);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const label = item.plant_no || item.type_name;

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await f.save(actorId || null);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the swap.');
      setSaving(false);
    }
  };

  return (
    <Sheet
      title={`Swap ${item.type_name}`}
      subtitle={`${label} · ${holderLabel(item)}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className={btn.secondary} onClick={onClose}>Cancel</button>
          <button type="button" className={btn.primary} onClick={save} disabled={saving || f.spares === null}>
            {saving ? 'Saving…' : 'Save swap'}
          </button>
        </>
      }
    >
      <ActorPicker auditors={auditors} value={actorId} onChange={setActorId} />
      <DestinationFields f={f} title={`1. Where is ${label} going?`} />
      <ReplacementFields f={f} months={months} title="2. What goes on the van instead?" />
      <SwapNoteAndPreview f={f} />
      <ErrorNote message={error ?? f.loadError} />
    </Sheet>
  );
}
