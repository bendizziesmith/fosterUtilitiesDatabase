import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FilePen, Trash2 } from 'lucide-react';
import { listAuditSummaries } from '../../../../lib/siteAuditService';
import { discardDraft } from '../../../../lib/draftService';
import { draftsInProgress, lastSavedText } from '../../../../lib/draftLogic';
import { whoName } from '../../../../lib/siteAuditLogic';
import { SiteAuditSummary } from '../../../../lib/supabase';
import { ErrorNote, Sheet, TestTag } from './ui';
import { btn, card, formatDate } from './styles';

const teamOf = (d: SiteAuditSummary) =>
  `${d.ganger_name_snapshot ?? d.team_name_snapshot ?? 'Spare van'} · ${d.vehicle_reg ?? 'no van'}`;

/** "Drafts in progress" on Site Audits. Hidden when there are none. */
export function DraftsInProgress() {
  const navigate = useNavigate();
  const [drafts, setDrafts] = useState<SiteAuditSummary[]>([]);
  const [discarding, setDiscarding] = useState<SiteAuditSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setDrafts(draftsInProgress(await listAuditSummaries()));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load drafts.');
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const onDiscard = async () => {
    if (!discarding) return;
    setBusy(true);
    setError(null);
    try {
      await discardDraft(discarding.id);
      try { localStorage.removeItem(`foster.audit.draftScroll.${discarding.id}`); } catch { /* storage blocked */ }
      setDiscarding(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not discard the draft.');
    } finally {
      setBusy(false);
    }
  };

  if (!drafts.length && !error) return null;

  return (
    <section className={card} aria-labelledby="drafts-h">
      <div className="flex items-center gap-2 px-4 sm:px-5 py-4 border-b border-slate-200">
        <FilePen className="h-5 w-5 text-blue-600" />
        <h2 id="drafts-h" className="text-base font-bold text-slate-900">Drafts in progress</h2>
        <span className="text-xs text-slate-600">{drafts.length} not submitted yet</span>
      </div>
      <div className="px-4 sm:px-5"><ErrorNote message={error} /></div>
      <ul className="divide-y divide-slate-200">
        {drafts.map((d) => (
          <li key={d.id} className="px-4 sm:px-5 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-base sm:text-sm font-bold text-slate-900">{teamOf(d)} <TestTag show={d.is_test} /></p>
              <p className="text-xs text-slate-600 mt-0.5">
                {[formatDate(d.audit_date), d.site_visited, `Audited by ${whoName(d.auditor_name)}`, `Last saved ${lastSavedText(d.updated_at ?? d.created_at)}`]
                  .filter(Boolean).join(' · ')}
              </p>
            </div>
            <div className="flex gap-2">
              <button type="button" className={`${btn.primary} flex-1 sm:flex-none`} onClick={() => navigate(`/audits/new?draft=${d.id}`)}>
                Continue
              </button>
              <button type="button" className={`${btn.delete} flex-1 sm:flex-none`} onClick={() => setDiscarding(d)}>
                <Trash2 className="h-4 w-4" />Discard draft
              </button>
            </div>
          </li>
        ))}
      </ul>

      {discarding && (
        <Sheet
          title="Discard this draft?"
          subtitle={`${teamOf(discarding)} · ${formatDate(discarding.audit_date)}`}
          onClose={() => setDiscarding(null)}
          footer={
            <>
              <button type="button" className={btn.secondary} onClick={() => setDiscarding(null)}>Keep draft</button>
              <button type="button" className={btn.delete} disabled={busy} onClick={onDiscard}>{busy ? 'Discarding…' : 'Discard draft'}</button>
            </>
          }
        >
          <p className="text-base sm:text-sm text-slate-700">Everything filled in on this draft, and its photos, will be deleted. Kit and PPE records are not changed. This can’t be undone.</p>
          <ErrorNote message={error} />
        </Sheet>
      )}
    </section>
  );
}
