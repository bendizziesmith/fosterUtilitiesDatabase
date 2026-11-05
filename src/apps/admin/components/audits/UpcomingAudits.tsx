import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarClock, ClipboardPlus } from 'lucide-react';
import { auditSchedule, formatDue, ScheduleRow } from '../../../../lib/fleetLogic';
import { todayISO, AuditTarget } from '../../../../lib/siteAuditLogic';
import { listAuditSummaries } from '../../../../lib/siteAuditService';
import { getAuditInterval, setAuditInterval } from '../../../../lib/fleetService';
import { card, btn, inputCls, formatDate } from './styles';
import { ErrorNote } from './ui';

const tone = (r: ScheduleRow) =>
  r.status === 'never' || r.status === 'overdue'
    ? 'bg-red-50 text-red-700 border-red-200'
    : r.status === 'due_soon'
      ? 'bg-amber-50 text-amber-800 border-amber-200'
      : 'bg-slate-100 text-slate-700 border-slate-200';

/** Every gang and spare van audited every N months (default 6). Overdue first, then due within 30 days, then by date. */
export function UpcomingAudits({ targets }: { targets: AuditTarget[] }) {
  const navigate = useNavigate();
  const [rows, setRows] = useState<ScheduleRow[] | null>(null);
  const [interval, setInterval] = useState(6);
  const [editing, setEditing] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const [audits, months] = await Promise.all([listAuditSummaries(), getAuditInterval().catch(() => 6)]);
        if (!live) return;
        setInterval(months);
        setEditing(String(months));
        setRows(auditSchedule(targets, audits, months, todayISO()));
      } catch (e) {
        if (live) setError(e instanceof Error ? e.message : 'Could not load the audit schedule.');
      }
    })();
    return () => { live = false; };
  }, [targets, interval]);

  const saveInterval = async () => {
    const n = Number(editing);
    if (n === interval) return;
    setError(null);
    try {
      await setAuditInterval(n, null);
      setInterval(n);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the interval.');
      setEditing(String(interval));
    }
  };

  const urgent = (rows ?? []).filter((r) => r.status !== 'ok');
  const shown = showAll ? rows ?? [] : urgent.length ? urgent : (rows ?? []).slice(0, 5);

  return (
    <section id="upcoming" className={`${card} scroll-mt-4`} aria-labelledby="upcoming-h">
      <div className="px-4 sm:px-5 py-3 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <div className="flex items-center gap-2">
          <CalendarClock className="h-5 w-5 text-blue-600" />
          <h2 id="upcoming-h" className="text-base font-bold text-slate-900">Upcoming audits</h2>
          {urgent.length > 0 && <span className="text-xs font-semibold text-red-700">{urgent.length} due</span>}
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          Audit every
          <input inputMode="numeric" aria-label="Audit every how many months" className={`${inputCls} w-20 text-center`} value={editing}
            onChange={(e) => setEditing(e.target.value.replace(/\D/g, ''))} onBlur={saveInterval} />
          months
        </label>
      </div>
      <ErrorNote message={error} />
      {rows === null ? (
        <p className="px-5 py-5 text-sm text-slate-600">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="px-5 py-5 text-sm text-slate-600">No gangs or spare vans to audit.</p>
      ) : (
        <>
          <ul className="divide-y divide-slate-200">
            {shown.map((r) => (
              <li key={r.key} className="px-4 sm:px-5 py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                <div className="min-w-0 sm:flex-1">
                  <p className="text-sm font-bold text-slate-900">{r.label}</p>
                  <p className="text-xs text-slate-600">Last audited {r.lastAudit ? formatDate(r.lastAudit) : 'never'}{r.due ? ` · due ${formatDate(r.due)}` : ''}</p>
                </div>
                <span className={`self-start sm:self-auto inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border whitespace-nowrap ${tone(r)}`}>{formatDue(r)}</span>
                <button type="button" className={btn.small} onClick={() => navigate(`/audits/new?target=${encodeURIComponent(r.key)}`)}>
                  <ClipboardPlus className="h-3.5 w-3.5" />Start audit
                </button>
              </li>
            ))}
          </ul>
          {rows.length > shown.length && (
            <div className="px-4 sm:px-5 py-3 border-t border-slate-200">
              <button type="button" className={btn.secondary} onClick={() => setShowAll(true)}>Show all {rows.length}</button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
