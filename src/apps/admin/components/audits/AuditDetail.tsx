import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { LoadingSpinner } from '../../../../components/LoadingSpinner';
import { getAudit } from '../../../../lib/siteAuditService';
import { getExpiryStatus, summariseAuditLines, whoName, otherAnswerFor, FileDeletion } from '../../../../lib/siteAuditLogic';
import { FileLink } from './FileLink';
import { AuditEditPanel } from './AuditEditPanel';
import { DeleteAuditSheet } from './FleetSheets';
import { listAuditEdits, AuditEditRow } from '../../../../lib/fleetService';
import { btn } from './styles';
import { useAuditRef, useFileDeletions } from './useAuditRef';
import { AuditLineRow, AuditMemberRow, Auditor, SiteAudit } from '../../../../lib/supabase';
import { CountBadge, ErrorNote, ExpiryPill, TestTag } from './ui';
import { card, formatDate, formatDateTime } from './styles';

const SECTIONS: { key: AuditLineRow['section']; title: string }[] = [
  { key: 'ppe', title: 'PPE' },
  { key: 'hs', title: 'Health & safety' },
  { key: 'kit', title: 'Kit' },
  { key: 'other', title: 'Other' },
];

function needsLook(l: AuditLineRow, auditDate: string) {
  if (l.result === 'N' || l.label_on === 'N') return true;
  if (l.result === 'not_carried' || (l.section !== 'ppe' && l.section !== 'kit')) return false;
  const s = getExpiryStatus(l.expiry_date, auditDate).status;
  return s === 'expired' || s === 'due_soon';
}

function Result({ r }: { r: AuditLineRow['result'] }) {
  if (r === 'Y') return <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-bold bg-green-50 text-green-700 border border-green-200">Y</span>;
  if (r === 'N') return <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-bold bg-red-50 text-red-700 border border-red-200">N · fail</span>;
  if (r === 'not_carried') return <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200">Not carried</span>;
  return <span className="text-xs text-slate-600">—</span>;
}

/** "Label on?" answer: words as well as colour */
function LabelOn({ v }: { v: AuditLineRow['label_on'] }) {
  if (v === 'Y') return <span className="text-slate-700">Label on</span>;
  if (v === 'N') return <span className="font-semibold text-red-700">No label</span>;
  return <span className="text-xs text-slate-600">—</span>;
}

function SectionTable({ title, lines, auditDate, section, deletions, auditors, onFileDeleted, dateLabelFor, otherAnswer }: {
  title: string; lines: AuditLineRow[]; auditDate: string; section: AuditLineRow['section'];
  deletions: FileDeletion[]; auditors: Auditor[]; onFileDeleted: () => void; dateLabelFor: (l: AuditLineRow) => string | null;
  otherAnswer: (l: AuditLineRow) => 'label' | 'date_tag' | 'none';
}) {
  const [showAll, setShowAll] = useState(false);
  const flagged = lines.filter((l) => needsLook(l, auditDate));
  const rest = lines.filter((l) => !needsLook(l, auditDate));
  const isKit = section === 'kit';
  const hasExpiry = section === 'ppe' || section === 'kit';
  const ppeDates = section === 'ppe' && lines.some((l) => l.service_date);
  // Other: "Label on?" where the item asks it; the old date / tag text only where an audit has some
  const showLabel = section === 'other' && lines.some((l) => l.label_on || otherAnswer(l) === 'label');
  const showTag = section === 'other' && lines.some((l) => l.date_tag);
  const photo = (l: AuditLineRow) => l.photo_path && <FileLink path={l.photo_path} kind="Photo" deletions={deletions} auditors={auditors} onDeleted={onFileDeleted} />;
  if (!lines.length) return null;

  const cells = (l: AuditLineRow) => (
    <>
      <td className="px-5 py-2.5 font-semibold text-slate-900">{l.item_name}{l.expected_qty && <span className="block text-xs font-normal text-slate-600">{l.expected_qty}</span>}</td>
      <td className="px-3 py-2.5"><Result r={l.result} /></td>
      {isKit ? (
        <>
          <td className="px-3 py-2.5 text-slate-700">{l.plant_no_snapshot ?? '—'}</td>
          <td className="px-3 py-2.5 text-slate-700 whitespace-nowrap">{formatDate(l.service_date)}</td>
        </>
      ) : (
        <td className="px-3 py-2.5 text-slate-700">{l.qty ?? '—'}</td>
      )}
      {ppeDates && <td className="px-3 py-2.5 text-slate-700 whitespace-nowrap">{l.service_date ? `${dateLabelFor(l) ?? 'Date'}: ${formatDate(l.service_date)}` : ''}</td>}
      {hasExpiry && (
        <td className="px-3 py-2.5 whitespace-nowrap">
          {l.expiry_date ? <span className="text-slate-700 mr-2">{formatDate(l.expiry_date)}</span> : null}
          {l.result !== 'not_carried' && <ExpiryPill expiry={l.expiry_date} today={auditDate} showOk={false} />}
        </td>
      )}
      {showLabel && <td className="px-3 py-2.5">{otherAnswer(l) === 'label' || l.label_on ? <LabelOn v={l.label_on} /> : ''}</td>}
      {showTag && <td className="px-3 py-2.5 text-slate-700">{l.date_tag ?? ''}</td>}
      <td className="px-3 py-2.5 text-slate-700">{l.comment ?? ''}</td>
      <td className="px-5 py-2.5 text-right">{photo(l)}</td>
    </>
  );

  return (
    <section className={card} aria-labelledby={`d-${section}`}>
      <div className="px-4 sm:px-5 py-3 border-b border-slate-200 flex items-center justify-between">
        <h2 id={`d-${section}`} className="text-base font-bold text-slate-900">{title}</h2>
        {flagged.length > 0 && <CountBadge n={flagged.length} label="to look at" tone="red" />}
      </div>
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-semibold text-slate-600 uppercase tracking-wider border-b border-slate-200">
              <th className="px-5 py-2.5">Item</th>
              <th className="px-3 py-2.5">Fit for purpose</th>
              {isKit ? (<><th className="px-3 py-2.5">Plant no</th><th className="px-3 py-2.5">Service</th></>) : <th className="px-3 py-2.5">Qty</th>}
              {ppeDates && <th className="px-3 py-2.5">Date</th>}
              {hasExpiry && <th className="px-3 py-2.5">Expiry</th>}
              {showLabel && <th className="px-3 py-2.5">Label on?</th>}
              {showTag && <th className="px-3 py-2.5">Date / tag</th>}
              <th className="px-3 py-2.5">Comment</th>
              <th className="px-5 py-2.5"><span className="sr-only">Photo</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {lines.map((l) => (
              <tr key={l.id} className={l.result === 'not_carried' ? 'bg-slate-50' : needsLook(l, auditDate) ? 'bg-red-50' : ''}>{cells(l)}</tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* phone: fails and warnings first, then the rest collapsed */}
      <ul className="md:hidden divide-y divide-slate-200">
        {[...flagged, ...(showAll ? rest : [])].map((l) => (
          <li key={l.id} className={`px-4 py-3 ${l.result === 'not_carried' ? 'bg-slate-50' : ''}`}>
            <div className="flex items-start justify-between gap-2">
              <p className="text-base sm:text-sm font-bold text-slate-900">{l.item_name}</p>
              <Result r={l.result} />
            </div>
            <p className="text-xs text-slate-600 mt-1">
              {[
                isKit && l.plant_no_snapshot,
                !isKit && l.qty && `Qty ${l.qty}`,
                isKit && l.service_date && `Serviced ${formatDate(l.service_date)}`,
                !isKit && l.service_date && `${dateLabelFor(l) ?? 'Date'} ${formatDate(l.service_date)}`,
                hasExpiry && l.expiry_date && `Expiry ${formatDate(l.expiry_date)}`,
                l.label_on === 'Y' && 'Label on',
                l.date_tag,
              ].filter(Boolean).join(' · ')}
            </p>
            {hasExpiry && l.result !== 'not_carried' && l.expiry_date && <div className="mt-1"><ExpiryPill expiry={l.expiry_date} today={auditDate} showOk={false} /></div>}
            {l.label_on === 'N' && <p className="text-xs font-semibold text-red-700 mt-1">No label</p>}
            {l.comment && <p className="text-xs text-slate-700 mt-1">“{l.comment}”</p>}
            {photo(l)}
          </li>
        ))}
        {rest.length > 0 && (
          <li>
            <button type="button" onClick={() => setShowAll(!showAll)} className="w-full min-h-[48px] px-4 text-left text-sm font-semibold text-blue-700 hover:bg-slate-50 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500" aria-expanded={showAll}>
              {showAll ? 'Show fewer' : `+ ${rest.length} more, all OK`}
            </button>
          </li>
        )}
      </ul>
    </section>
  );
}

export const AuditDetail: React.FC = () => {
  const [params] = useSearchParams();
  const id = params.get('id');
  const [data, setData] = useState<{ audit: SiteAudit; members: AuditMemberRow[]; lines: AuditLineRow[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const ref = useAuditRef();
  const { deletions, reload: reloadDeletions } = useFileDeletions();
  const dateLabelFor = (l: AuditLineRow) => ref.checklist.find((c) => c.id === l.checklist_item_id)?.date_label ?? null;
  const otherAnswer = (l: AuditLineRow) => otherAnswerFor(ref.checklist.find((c) => c.id === l.checklist_item_id));
  const [edits, setEdits] = useState<AuditEditRow[]>([]);
  const [mode, setMode] = useState<'view' | 'edit' | 'delete'>('view');
  const [flash, setFlash] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!id) return;
    getAudit(id).then(setData).catch((e) => setError(e.message));
    listAuditEdits(id).then(setEdits).catch(() => setEdits([]));
  }, [id]);
  useEffect(() => {
    load();
  }, [load]);

  if (!id) return <p className="text-base sm:text-sm text-slate-600">No audit selected.</p>;
  if (error) return <ErrorNote message={error} />;
  if (!data) return <LoadingSpinner />;

  const { audit, members, lines } = data;
  const s = summariseAuditLines(lines, audit.audit_date);

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      <section className={`${card} p-4 sm:p-5`}>
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <h2 className="text-lg font-bold text-slate-900">
            {(() => {
              const person = audit.holder_employee_id ?? audit.ganger_id;
              const key = person ? `person:${person}` : audit.vehicle_id ? `van:${audit.vehicle_id}` : null;
              const label = audit.ganger_name_snapshot
                ? `${audit.ganger_name_snapshot} · ${audit.vehicle_reg_snapshot ?? 'no van'}`
                : audit.team_name_snapshot;
              return key && ref.allTargets.some((t) => t.key === key) ? (
                <button type="button" onClick={() => navigate(`/kit/van?key=${encodeURIComponent(key)}`)} className="text-left hover:underline cursor-pointer">{label}</button>
              ) : label;
            })()}
          </h2>
          <TestTag show={audit.is_test} />
          {audit.status === 'submitted' ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
              <Lock className="h-3 w-3" />Submitted {formatDateTime(audit.submitted_at)}
            </span>
          ) : (
            <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">Draft</span>
          )}
        </div>
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          {[
            ['Audited by', whoName(audit.auditor_name)],
            ['Date', formatDate(audit.audit_date)],
            ['Van reg', audit.vehicle_reg_snapshot ?? '—'],
            ['Site', audit.site_visited ?? '—'],
          ].map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs font-semibold text-slate-600">{k}</dt>
              <dd className="text-slate-900 font-medium break-words">{v}</dd>
            </div>
          ))}
          <div className="col-span-2 sm:col-span-4">
            <dt className="text-xs font-semibold text-slate-600">Team members</dt>
            <dd className="text-slate-900">{members.map((m) => m.name).join(', ') || '—'}</dd>
          </div>
        </dl>
        <div className="flex flex-wrap gap-2 mt-4">
          <CountBadge n={s.fails} label={s.fails === 1 ? 'fail' : 'fails'} tone={s.fails ? 'red' : 'slate'} />
          <CountBadge n={s.expired} label="expired" tone={s.expired ? 'red' : 'slate'} />
          <CountBadge n={s.dueSoon} label="due soon" tone={s.dueSoon ? 'amber' : 'slate'} />
        </div>
        {audit.status === 'submitted' && mode === 'view' && (
          <div className="flex flex-wrap gap-2 mt-4">
            <button type="button" className={btn.secondary} onClick={() => setMode('edit')}>Edit audit</button>
            <button type="button" className={`${btn.secondary} text-red-700`} onClick={() => setMode('delete')}>Delete audit</button>
          </div>
        )}
        {flash && <p role="status" className="mt-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">{flash}</p>}
        {edits.length > 0 && (
          <ul className="mt-4 rounded-lg border border-slate-200 bg-slate-50 divide-y divide-slate-200" aria-label="Edits">
            {edits.map((e) => (
              <li key={e.id} className="px-3 py-2 text-xs text-slate-700">
                <strong>Edited by {whoName(e.actor_name)}</strong> on {formatDateTime(e.created_at)}: {e.summary.join('; ')}
              </li>
            ))}
          </ul>
        )}
      </section>

      {mode === 'edit' && (
        <AuditEditPanel auditId={audit.id} lines={lines} auditors={ref.auditors} otherAnswer={otherAnswer} onCancel={() => setMode('view')}
          onSaved={(summary) => { setMode('view'); setFlash(`Saved: ${summary.join('; ')}`); load(); }} />
      )}
      {mode === 'delete' && (
        <DeleteAuditSheet auditId={audit.id} label={`${audit.ganger_name_snapshot ?? audit.team_name_snapshot} · ${formatDate(audit.audit_date)}`}
          auditors={ref.auditors} onClose={() => setMode('view')} onDone={() => navigate('/audits/records', { replace: true })} />
      )}

      {mode !== 'edit' && SECTIONS.map((sec) => (
        <SectionTable key={sec.key} section={sec.key} title={sec.title} auditDate={audit.audit_date} lines={lines.filter((l) => l.section === sec.key)}
          deletions={deletions} auditors={ref.auditors} onFileDeleted={reloadDeletions} dateLabelFor={dateLabelFor} otherAnswer={otherAnswer} />
      ))}

      <section className={`${card} p-4 sm:p-5`}>
        <h2 className="text-base font-bold text-slate-900 mb-1">Additional kit required / notes for Neil & Sam</h2>
        <p className="text-base sm:text-sm text-slate-700 whitespace-pre-wrap">{audit.notes || 'None.'}</p>
      </section>
    </div>
  );
};
