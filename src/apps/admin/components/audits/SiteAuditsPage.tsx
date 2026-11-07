import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardPlus, ClipboardList } from 'lucide-react';
import { listAuditSummaries } from '../../../../lib/siteAuditService';
import { getAuditInterval } from '../../../../lib/fleetService';
import { auditSchedule } from '../../../../lib/fleetLogic';
import { siteAuditTiles } from '../../../../lib/dashboardLogic';
import { todayISO } from '../../../../lib/siteAuditLogic';
import { SiteAuditSummary } from '../../../../lib/supabase';
import { UpcomingAudits } from './UpcomingAudits';
import { DraftsInProgress } from './DraftsInProgress';
import { useAuditRef } from './useAuditRef';
import { ErrorNote, PageBar, StatTiles, TestModeBanner } from './ui';
import { btn } from './styles';

/**
 * Site Audits: everything about audits. New audit, the audit tiles, drafts, upcoming audits,
 * records. Kit expiry ("Needs attention") lives on Kit & Plant.
 */
export const SiteAuditsPage: React.FC = () => {
  const navigate = useNavigate();
  const ref = useAuditRef();
  const [audits, setAudits] = useState<SiteAuditSummary[]>([]);
  const [interval, setIntervalMonths] = useState(6);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([listAuditSummaries(), getAuditInterval().catch(() => 6)])
      .then(([a, m]) => {
        setAudits(a);
        setIntervalMonths(m);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load audits.'));
  }, []);
  // "Needs auditing" (here and on the dashboard) jumps to /audits#upcoming
  useEffect(() => {
    if (window.location.hash === '#upcoming' && ref.loaded) {
      setTimeout(() => document.getElementById('upcoming')?.scrollIntoView({ behavior: 'smooth' }), 50);
    }
  }, [ref.loaded]);

  const schedule = useMemo(() => auditSchedule(ref.auditTargets, audits, interval, todayISO()), [ref.auditTargets, audits, interval]);
  const tiles = siteAuditTiles(schedule, interval).map((t) =>
    t.key === 'needs'
      ? { ...t, tone: (t.value === '0' ? 'slate' : 'red') as 'slate' | 'red', onClick: () => document.getElementById('upcoming')?.scrollIntoView({ behavior: 'smooth' }) }
      : t
  );

  return (
    <div className="space-y-5">
      <TestModeBanner />
      <PageBar>
        <button type="button" className={btn.secondary} onClick={() => navigate('/audits/records')}>
          <ClipboardList className="h-4 w-4" aria-hidden="true" />Audit records
        </button>
        <button type="button" className={btn.primary} onClick={() => navigate('/audits/new')}>
          <ClipboardPlus className="h-4 w-4" aria-hidden="true" />New audit
        </button>
      </PageBar>

      <ErrorNote message={error ?? ref.error} />

      {ref.loaded && <StatTiles tiles={tiles} />}

      <DraftsInProgress />

      <UpcomingAudits targets={ref.auditTargets} />
    </div>
  );
};
