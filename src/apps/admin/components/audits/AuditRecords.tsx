import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, ClipboardList, Download, Loader2, CheckCircle2 } from 'lucide-react';
import { LoadingSpinner } from '../../../../components/LoadingSpinner';
import { listAuditSummaries, listResolutions, listDownloads } from '../../../../lib/siteAuditService';
import { downloadedLabel, latestDownloads, AuditDownloadRow } from '../../../../lib/downloadLogic';
import { longDate } from '../../../../lib/auditReport';
import { SiteAuditSummary } from '../../../../lib/supabase';
import { whoName } from '../../../../lib/siteAuditLogic';
import { ErrorNote, TestTag, ResolutionBadgeList } from './ui';
import { resolutionBadges, AuditResolution } from '../../../../lib/followupLogic';
import { btn, card, formatDate } from './styles';
import { downloadAllAudits } from '../../../../lib/auditDownloads';
import { getAuditInterval } from '../../../../lib/fleetService';
import { nextAuditFor } from '../../../../lib/fleetLogic';
import { loadAuditReferenceData } from '../../../../lib/siteAuditService';
import { Auditor } from '../../../../lib/supabase';
import { useActor } from './useActor';

/** On-the-day counts, shown as "· resolved" once everything of that kind has been fixed since. */
function ResultBadges({ a, res }: { a: SiteAuditSummary; res: AuditResolution | null }) {
  return <ResolutionBadgeList badges={resolutionBadges(a, res)} />;
}

/** "Dom Oliver · YE24 TNL" from the audit's own snapshots, so history never changes. */
function whoLabel(a: SiteAuditSummary) {
  return a.ganger_name_snapshot ? `${a.ganger_name_snapshot} · ${a.vehicle_reg ?? 'no van'}` : a.team_name_snapshot;
}
const vanKey = (a: SiteAuditSummary) => {
  const person = a.holder_employee_id ?? a.ganger_id;
  return person ? `person:${person}` : a.vehicle_id ? `van:${a.vehicle_id}` : null;
};
/** the "Audited by" name; old test rows that only kept a login email show "Office login" */
const byName = (a: SiteAuditSummary) => whoName(a.auditor_name);

/** Green tick when the audit's PDF has been downloaded; the date / who on hover (title) and for screen readers. */
function DownloadedTick({ row }: { row: AuditDownloadRow | undefined }) {
  if (!row) return null;
  const label = downloadedLabel(row);
  return (
    <span title={label} aria-label={label} className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-green-700">
      <CheckCircle2 className="h-4 w-4" aria-hidden="true" />Downloaded <span className="font-normal text-slate-600">{longDate(row.downloaded_at).slice(0, 6)}</span>
    </span>
  );
}

function DraftBadge() {
  return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border bg-slate-100 text-slate-700 border-slate-200">Draft</span>;
}

export const AuditRecords: React.FC = () => {
  const navigate = useNavigate();
  const [rows, setRows] = useState<SiteAuditSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expiredOnly, setExpiredOnly] = useState(false);
  const [notYet, setNotYet] = useState(false);
  /** latest PDF download of each audit (the green "Downloaded" tick) */
  const [downloads, setDownloads] = useState<Map<string, AuditDownloadRow>>(new Map());
  /** the audit interval (months): "Next audit" uses the same rule as Upcoming Audits */
  const [intervalMonths, setIntervalMonths] = useState<number | null>(null);
  const [zip, setZip] = useState<string | null>(null);
  const [resolutions, setResolutions] = useState<Map<string, AuditResolution>>(new Map());
  const [auditorList, setAuditorList] = useState<Auditor[]>([]);
  const { actor } = useActor(auditorList);
  useEffect(() => {
    loadAuditReferenceData().then((r) => setAuditorList(r.auditors)).catch(() => undefined);
  }, []);

  useEffect(() => {
    listResolutions().then(setResolutions).catch(() => undefined);
    getAuditInterval().then(setIntervalMonths).catch(() => setIntervalMonths(null));
    listDownloads().then((d) => setDownloads(latestDownloads(d))).catch(() => undefined);
    listAuditSummaries()
      .then(setRows)
      .catch((e) => {
        setError(e.message);
        setRows([]);
      });
  }, []);

  const filtered = (rows ?? []).filter(
    (r) => (!expiredOnly || r.expired_count > 0) && (!notYet || !downloads.has(r.id))
  );
  const nextAudit = (r: SiteAuditSummary) =>
    r.status === 'submitted' && intervalMonths ? formatDate(nextAuditFor(r, rows ?? [], intervalMonths)) : null;

  const submitted = filtered.filter((r) => r.status === 'submitted');
  const onZip = async () => {
    setZip(`Making ${submitted.length} PDF${submitted.length === 1 ? '' : 's'}…`);
    setError(null);
    try {
      const r = await downloadAllAudits(submitted.map((x) => x.id), { from: null, to: null }, actor ? { id: actor.id, name: actor.name } : null,
        (done, total) => setZip(`Making PDFs: ${done} of ${total}…`));
      setZip(null);
      listDownloads().then((d) => setDownloads(latestDownloads(d))).catch(() => undefined);
      if (!r.recorded) setError(`The ZIP downloaded, but the “Downloaded” ticks could not be saved: ${r.recordError}`);
      else if (r.failed.length) setError(`${r.failed.length} audit PDF${r.failed.length === 1 ? '' : 's'} could not be made: ${r.failed[0]}`);
    } catch (e) {
      setZip(null);
      setError(e instanceof Error ? e.message : 'Could not make the ZIP.');
    }
  };

  const open = (r: SiteAuditSummary) =>
    navigate(r.status === 'draft' ? `/audits/new?draft=${r.id}` : `/audits/detail?id=${r.id}`);

  return (
    <div className="space-y-4">
      <section className={`${card} p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 items-end`} aria-label="Filters">
        <label className="flex items-center gap-2 min-h-[44px] px-3 rounded-lg border border-slate-300 bg-white text-base sm:text-sm text-slate-700 cursor-pointer">
          <input type="checkbox" checked={expiredOnly} onChange={(e) => setExpiredOnly(e.target.checked)} className="h-4 w-4" />
          Expired only
        </label>
        <label className="flex items-center gap-2 min-h-[44px] px-3 rounded-lg border border-slate-300 bg-white text-base sm:text-sm text-slate-700 cursor-pointer">
          <input type="checkbox" checked={notYet} onChange={(e) => setNotYet(e.target.checked)} className="h-4 w-4" />
          Not downloaded yet
        </label>
      </section>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={btn.secondary} onClick={onZip} disabled={!!zip || !submitted.length}>
            {zip ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Download className="h-4 w-4" aria-hidden="true" />}
            Download all ({submitted.length}) as ZIP
          </button>
          {zip && <span role="status" className="text-base sm:text-sm text-slate-600">{zip}</span>}
        </div>
      </div>

      <ErrorNote message={error} />

      <section className={card}>
        {rows === null ? (
          <LoadingSpinner />
        ) : filtered.length === 0 ? (
          <div className="flex items-center gap-2 px-5 py-10 text-base sm:text-sm text-slate-600">
            <ClipboardList className="h-5 w-5 text-slate-400" />
            {rows.length === 0 ? 'No audits yet.' : 'No audits match these filters.'}
          </div>
        ) : (
          <>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs font-semibold text-slate-600 uppercase tracking-wider border-b border-slate-200">
                    <th className="px-5 py-3">Date</th>
                    <th className="px-3 py-3">Gang / van</th>
                    <th className="px-3 py-3">Reg</th>
                    <th className="px-3 py-3">Site</th>
                    <th className="px-3 py-3">Audited by</th>
                    <th className="px-3 py-3">Result</th>
                    <th className="px-5 py-3"><span className="sr-only">Open</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filtered.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => open(r)}>
                      <td className="px-5 py-3 whitespace-nowrap text-slate-900 font-semibold">{formatDate(r.audit_date)}{nextAudit(r) && <span className="block text-xs font-normal text-slate-600">Next audit: {nextAudit(r)}</span>}</td>
                      <td className="px-3 py-3 text-slate-800">
                        <span className="inline-flex items-center gap-2">
                          {vanKey(r) ? (
                            <button type="button" onClick={(e) => { e.stopPropagation(); navigate(`/kit/van?key=${encodeURIComponent(vanKey(r)!)}`); }} className="text-left font-medium text-blue-700 hover:underline cursor-pointer min-h-[44px] sm:min-h-[36px] rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">{whoLabel(r)}</button>
                          ) : whoLabel(r)}
                          <TestTag show={r.is_test} />
                        </span>
                      </td>
                      <td className="px-3 py-3 text-slate-700">{r.vehicle_reg ?? '—'}</td>
                      <td className="px-3 py-3 text-slate-700">{r.site_visited ?? '—'}</td>
                      <td className="px-3 py-3 text-slate-700">{byName(r)}</td>
                      <td className="px-3 py-3">{r.status === 'draft' ? <DraftBadge /> : <><ResultBadges a={r} res={resolutions.get(r.id) ?? null} /><DownloadedTick row={downloads.get(r.id)} /></>}</td>
                      <td className="px-5 py-3 text-right">
                        <button type="button" onClick={(e) => { e.stopPropagation(); open(r); }} className="inline-flex items-center gap-1 min-h-[36px] px-2 rounded-lg text-xs font-semibold text-blue-700 hover:bg-blue-50 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                          {r.status === 'draft' ? 'Continue' : 'View'}<ChevronRight className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="md:hidden divide-y divide-slate-200">
              {filtered.map((r) => (
                <li key={r.id}>
                  <button type="button" onClick={() => open(r)} className="w-full text-left px-4 py-3 min-h-[64px] flex items-center justify-between gap-3 hover:bg-slate-50 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500">
                    <span className="min-w-0">
                      <span className="flex items-center gap-2 text-base sm:text-sm font-bold text-slate-900">{whoLabel(r)}<TestTag show={r.is_test} /></span>
                      <span className="block text-xs text-slate-600 mt-0.5">{formatDate(r.audit_date)} · {r.vehicle_reg ?? 'no van'}{r.site_visited ? ` · ${r.site_visited}` : ''} · {byName(r)}</span>
                      {nextAudit(r) && <span className="block text-xs font-semibold text-slate-700 mt-0.5">Next audit: {nextAudit(r)}</span>}
                      <span className="block mt-1.5">{r.status === 'draft' ? <DraftBadge /> : <><ResultBadges a={r} res={resolutions.get(r.id) ?? null} /><DownloadedTick row={downloads.get(r.id)} /></>}</span>
                    </span>
                    <ChevronRight className="h-5 w-5 text-slate-400 flex-shrink-0" />
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
};
