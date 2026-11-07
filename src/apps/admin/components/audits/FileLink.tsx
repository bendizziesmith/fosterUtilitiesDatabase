import { useState } from 'react';
import { Image as ImageIcon, FileText, Trash2 } from 'lucide-react';
import { deleteAuditFile, getAuditFileUrl } from '../../../../lib/siteAuditService';
import { FileDeletion, isFileDeleted, whoName } from '../../../../lib/siteAuditLogic';
import { Auditor } from '../../../../lib/supabase';
import { ActorPicker } from './ActorPicker';
import { useActor } from './useActor';
import { Sheet, ErrorNote } from './ui';
import { btn, formatDateTime, TEST_MODE } from './styles';

/**
 * A photo or certificate link with a delete button (confirm first). After a
 * delete the file is gone from storage and this shows "Photo deleted by X on
 * date". The audit line / history entry itself is never changed.
 */
export function FileLink({
  path,
  kind,
  deletions,
  auditors,
  onDeleted,
}: {
  path: string;
  kind: 'Photo' | 'Certificate';
  deletions: FileDeletion[];
  auditors: Auditor[];
  onDeleted: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { actorId, setActorId, actor } = useActor(auditors);
  const gone = isFileDeleted(path, deletions);
  const Icon = kind === 'Photo' ? ImageIcon : FileText;

  if (gone) {
    return (
      <span className="text-xs text-slate-600 italic">
        {kind} deleted by {whoName(gone.actor_name)} on {formatDateTime(gone.deleted_at)}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            window.open(await getAuditFileUrl(path), '_blank', 'noopener');
          } finally {
            setBusy(false);
          }
        }}
        className="inline-flex items-center gap-1 min-h-[44px] sm:min-h-[36px] px-2 rounded-lg text-xs font-semibold text-blue-700 hover:bg-blue-50 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        <Icon className="h-4 w-4" />{kind}
      </button>
      <button
        type="button"
        aria-label={`Delete ${kind.toLowerCase()}`}
        onClick={() => setConfirming(true)}
        className={`${btn.smallDelete} min-w-[44px] sm:min-w-[36px]`}
      >
        <Trash2 className="h-4 w-4" aria-hidden="true" /><span className="sr-only sm:not-sr-only">Delete</span>
      </button>
      {confirming && (
        <Sheet
          title={`Delete this ${kind.toLowerCase()}?`}
          subtitle="The file is removed for good. The record stays and will say who deleted it and when."
          onClose={() => setConfirming(false)}
          footer={
            <>
              <button type="button" className={btn.secondary} onClick={() => setConfirming(false)}>Keep it</button>
              <button
                type="button"
                className={btn.delete}
                disabled={busy}
                onClick={async () => {
                  if (!actor) {
                    setError('Pick who’s doing this.');
                    return;
                  }
                  setBusy(true);
                  setError(null);
                  try {
                    await deleteAuditFile(path, TEST_MODE, { id: actor.id, name: actor.name });
                    setConfirming(false);
                    onDeleted();
                  } catch (e) {
                    setError(e instanceof Error ? e.message : 'Could not delete the file.');
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {busy ? 'Deleting…' : `Delete ${kind.toLowerCase()}`}
              </button>
            </>
          }
        >
          <ActorPicker auditors={auditors} value={actorId} onChange={setActorId} />
          <ErrorNote message={error} />
        </Sheet>
      )}
    </span>
  );
}
