import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, ClipboardList, Download, Loader2, Pencil } from 'lucide-react';
import { LoadingSpinner } from '../../../../components/LoadingSpinner';
import { listAuditSummaries } from '../../../../lib/siteAuditService';
import { SiteAuditSummary } from '../../../../lib/supabase';
import { whoName } from '../../../../lib/siteAuditLogic';
import { Field, CountBadge, ErrorNote, TestTag, Sheet } from './ui';
import { btn, card, inputCls, formatDate } from './styles';
import { downloadAllAudits } from '../../../../lib/auditDownloads';
import { getCompanyName, setCompanyName } from '../../../../lib/fleetService';
import { loadAuditReferenceData } from '../../../../lib/siteAuditService';
import { Auditor } from '../../../../lib/supabase';
import { useActor } from './useActor';

function ResultBadges({ a }: { a: SiteAuditSummary }) {
  const look = a.look_count ?? 0;
  const any = a.expired_count || a.due_soon_count || a.fail_count || look;
  return (
    <span className="flex flex-wrap gap-1">
      {a.expired_count > 0 && <CountBadge n={a.expired_count} label="expired" tone="red" />}
      {a.due_soon_count > 0 && <CountBadge n={a.due_soon_count} label="due soon" tone="amber" />}
      {a.fail_count > 0 && <CountBadge n={a.fail_count} label={a.fail_count === 1 ? 'fail' : 'fails'} tone="red" />}
      {look > 0 && <CountBadge n={look} label="to look at" tone="amber" />}
      {!any && (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border bg-green-50 text-green-700 border-green-200">All OK</span>
      )}
    </span>
  );
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

function DraftBadge() {
  return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border bg-slate-100 text-slate-700 border-slate-200">Draft</span>;
}

export const AuditRecords: React.FC = () => {
  const navigate = useNavigate();
  const [rows, setRows] = useState<SiteAuditSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [who, setWho] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [expiredOnly, setExpiredOnly] = useState(false);
  const [by, setBy] = useState('');
  const [zip, setZip] = useState<string | null>(null);
  const [company, setCompany] = useState('Foster Utilities');
  const [editCompany, setEditCompany] = useState<string | null>(null);
  const [auditorList, setAuditorList] = useState<Auditor[]>([]);
  const { actor } = useActor(auditorList);
  useEffect(() => {
    getCompanyName().then(setCompany).catch(() => undefined);
    loadAuditReferenceData().then((r) => setAuditorList(r.auditors)).catch(() => undefined);
  }, []);

  useEffect(() => {
    listAuditSummaries()
      .then(setRows)
      .catch((e) => {
        setError(e.message);
        setRows([]);
      });
  }, []);

  const teams = useMemo(() => [...new Set((rows ?? []).map(whoLabel))].sort(), [rows]);
  const auditors = useMemo(() => [...new Set((rows ?? []).map(byName))].sort(), [rows]);

  const filtered = (rows ?? []).filter(
    (r) =>
      (!who || whoLabel(r) === who) &&
      (!from || r.audit_date >= from) &&
      (!to || r.audit_date <= to) &&
      (!expiredOnly || r.expired_count > 0) &&
      (!by || byName(r) === by)
  );

  const submitted = filtered.filter((r) => r.status === 'submitted');
  const onZip = async () => {
    setZip(`Making ${submitted.length} PDF${submitted.length === 1 ? '' : 's'}…`);
    setError(null);
    try {
      const r = await downloadAllAudits(submitted.map((x) => x.id), { from: from || null, to: to || null }, whoName(actor?.name),
        (done, total) => setZip(`Making PDFs: ${done} of ${total}…`));
      setZip(null);
      if (r.failed.length) setError(`${r.failed.length} audit PDF${r.failed.length === 1 ? '' : 's'} could not be made: ${r.failed[0]}`);
    } catch (e) {
      setZip(null);
      setError(e instanceof Error ? e.message : 'Could not make the ZIP.');
    }
  };

  const open = (r: SiteAuditSummary) =>
    navigate(r.status === 'draft' ? `/audits/new?draft=${r.id}` : `/audits/detail?id=${r.id}`);

  return (
    <div className="space-y-4">
      <section className={`${card} p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end`} aria-label="Filters">
        <Field label="Gang or van">
          {(id) => (
            <select id={id} className={inputCls} value={who} onChange={(e) => setWho(e.target.value)}>
              <option value="">All</option>
              {teams.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          )}
        </Field>
        <Field label="From">{(id) => <input id={id} type="date" className={inputCls} value={from} onChange={(e) => setFrom(e.target.value)} />}</Field>
        <Field label="To">{(id) => <input id={id} type="date" className={inputCls} value={to} onChange={(e) => setTo(e.target.value)} />}</Field>
        <Field label="Audited by">
          {(id) => (
            <select id={id} className={inputCls} value={by} onChange={(e) => setBy(e.target.value)}>
              <option value="">Anyone</option>
              {auditors.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          )}
        </Field>
        <label className="flex items-center gap-2 min-h-[44px] px-3 rounded-lg border border-slate-300 bg-white text-base sm:text-sm text-slate-700 cursor-pointer">
          <input type="checkbox" checked={expiredOnly} onChange={(e) => setExpiredOnly(e.target.checked)} className="h-4 w-4" />
          Expired only
        </label>
      </section>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={btn.secondary} onClick={onZip} disabled={!!zip || !submitted.length}>
            {zip ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Download className="h-4 w-4" aria-hidden="true" />}
            Download all ({submitted.length})
          </button>
          {zip && <span role="status" className="text-base sm:text-sm text-slate-600">{zip}</span>}
        </div>
        <button type="button" onClick={() => setEditCompany(company)}
          className="inline-flex items-center gap-1.5 min-h-[44px] text-sm font-semibold text-slate-700 hover:underline cursor-pointer rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
          <Pencil className="h-4 w-4" aria-hidden="true" />Company name on PDFs: {company}
        </button>
      </div>
      <p className="text-sm text-slate-600 -mt-2">One ZIP of the submitted audits shown below (drafts are left out).</p>

      <ErrorNote message={error} />

      {editCompany !== null && (
        <Sheet title="Company name on PDFs" onClose={() => setEditCompany(null)}
          footer={
            <>
              <button type="button" className={btn.secondary} onClick={() => setEditCompany(null)}>Cancel</button>
              <button type="button" className={btn.primary} onClick={async () => {
                try {
                  await setCompanyName(editCompany, actor?.name ?? null);
                  setCompany(editCompany.trim());
                  setEditCompany(null);
                } catch (e) {
                  setError(e instanceof Error ? e.message : 'Could not save.');
                  setEditCompany(null);
                }
              }}>Save</button>
            </>
          }>
          <Field label="Company name">{(id) => <input id={id} className={inputCls} value={editCompany} onChange={(e) => setEditCompany(e.target.value)} />}</Field>
        </Sheet>
      )}

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
                      <td className="px-5 py-3 whitespace-nowrap text-slate-900 font-semibold">{formatDate(r.audit_date)}</td>
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
                      <td className="px-3 py-3">{r.status === 'draft' ? <DraftBadge /> : <ResultBadges a={r} />}</td>
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
                      <span className="block mt-1.5">{r.status === 'draft' ? <DraftBadge /> : <ResultBadges a={r} />}</span>
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
