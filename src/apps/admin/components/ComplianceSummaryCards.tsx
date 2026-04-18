import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardCheck, FileText, ArrowRight } from 'lucide-react';
import { supabase, VehicleInspection, Employee } from '../../../lib/supabase';
import { formatWeekEnding } from '../../../lib/timesheetUtils';

interface ComplianceSummaryCardsProps {
  inspections: VehicleInspection[];
  employees: Employee[];
}

function getPreviousSunday(): string {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? 7 : day;
  const prev = new Date(now);
  prev.setDate(now.getDate() - diff);
  const y = prev.getFullYear();
  const m = String(prev.getMonth() + 1).padStart(2, '0');
  const d = String(prev.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

interface DonutSegment {
  value: number;
  color: string;
}

function DonutChart({
  segments,
  total,
  centerValue,
  centerLabel,
  size = 72,
}: {
  segments: DonutSegment[];
  total: number;
  centerValue: string | number;
  centerLabel: string;
  size?: number;
}) {
  const radius = 26;
  const strokeWidth = 7;
  const circumference = 2 * Math.PI * radius;
  const viewBox = size;

  let offset = 0;
  const arcs = segments.map((seg) => {
    const pct = total > 0 ? seg.value / total : 0;
    const stroke = pct * circumference;
    const arc = { ...seg, stroke, offset: -offset };
    offset += stroke;
    return arc;
  });

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg
        className="transform -rotate-90"
        viewBox={`0 0 ${viewBox} ${viewBox}`}
        width={size}
        height={size}
      >
        <circle
          cx={viewBox / 2}
          cy={viewBox / 2}
          r={radius}
          fill="none"
          stroke="#f1f5f9"
          strokeWidth={strokeWidth}
        />
        {arcs.map(
          (arc, i) =>
            arc.value > 0 && (
              <circle
                key={i}
                cx={viewBox / 2}
                cy={viewBox / 2}
                r={radius}
                fill="none"
                stroke={arc.color}
                strokeWidth={strokeWidth}
                strokeDasharray={`${arc.stroke} ${circumference}`}
                strokeDashoffset={arc.offset}
                strokeLinecap="round"
                className="transition-all duration-500"
              />
            )
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-base font-bold text-slate-900 leading-none">
          {centerValue}
        </span>
        <span className="text-[10px] text-slate-500 leading-tight mt-0.5">
          {centerLabel}
        </span>
      </div>
    </div>
  );
}

function StatPill({
  color,
  label,
  value,
}: {
  color: string;
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <div className={`w-2 h-2 rounded-full ${color}`} />
      <span className="text-xs text-slate-600">
        {label}
      </span>
      <span className="text-xs font-semibold text-slate-800">{value}</span>
    </div>
  );
}

export const ComplianceSummaryCards: React.FC<ComplianceSummaryCardsProps> = ({
  inspections,
  employees,
}) => {
  const navigate = useNavigate();

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().split('T')[0];

  const todayInspections = inspections.filter((ins) => {
    const d = new Date(ins.submitted_at);
    d.setHours(0, 0, 0, 0);
    return d.toISOString().split('T')[0] === todayStr;
  });

  const employeesWithChecks = new Set(
    todayInspections.filter((i) => i.employee_id).map((i) => i.employee_id)
  );

  const defectsFixed = todayInspections.filter(
    (i) => i.inspection_items?.some((item) => item.defect_fixed === true)
  ).length;

  const vehicleTotal = employees.length;
  const vehicleCompleted = employeesWithChecks.size;
  const vehiclePending = vehicleTotal - vehicleCompleted;

  const weekEnding = getPreviousSunday();
  const [tsLoading, setTsLoading] = useState(true);
  const [tsCounts, setTsCounts] = useState({
    total: 0,
    submitted: 0,
    returned: 0,
    notSubmitted: 0,
  });

  useEffect(() => {
    loadTimesheetCounts();
  }, []);

  const loadTimesheetCounts = async () => {
    try {
      const [empRes, tsRes] = await Promise.all([
        supabase
          .from('employees')
          .select('id')
          .in('role', ['Ganger', 'Backup Driver']),
        supabase
          .from('timesheet_weeks')
          .select('ganger_employee_id, status')
          .eq('week_ending', weekEnding),
      ]);

      if (empRes.error || tsRes.error) return;

      const emps = empRes.data || [];
      const sheets = tsRes.data || [];
      const statusMap = new Map<string, string>();
      sheets.forEach((t: any) => statusMap.set(t.ganger_employee_id, t.status));

      let sub = 0,
        ret = 0,
        notSub = 0;
      emps.forEach((e: any) => {
        const s = statusMap.get(e.id);
        if (s === 'submitted') sub++;
        else if (s === 'returned') ret++;
        else notSub++;
      });

      setTsCounts({
        total: emps.length,
        submitted: sub,
        returned: ret,
        notSubmitted: notSub,
      });
    } catch {
    } finally {
      setTsLoading(false);
    }
  };

  const vehiclePct =
    vehicleTotal > 0 ? Math.round((vehicleCompleted / vehicleTotal) * 100) : 0;
  const tsPct =
    tsCounts.total > 0
      ? Math.round((tsCounts.submitted / tsCounts.total) * 100)
      : 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <button
        onClick={() => navigate('/inspections')}
        className="group bg-white border border-slate-200 rounded-xl p-5 text-left transition-all duration-200 hover:border-blue-300 hover:shadow-md hover:shadow-blue-100/50 active:scale-[0.98] cursor-pointer"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-50 rounded-lg">
              <ClipboardCheck className="h-4 w-4 text-blue-600" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Daily Vehicle & Plant Checks
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {today.toLocaleDateString('en-GB', {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'short',
                })}
              </p>
            </div>
          </div>
          <ArrowRight className="h-4 w-4 text-slate-300 group-hover:text-blue-500 group-hover:translate-x-0.5 transition-all" />
        </div>

        <div className="flex items-center gap-5">
          <DonutChart
            segments={[
              { value: vehicleCompleted, color: '#10b981' },
              { value: vehiclePending, color: '#ef4444' },
            ]}
            total={vehicleTotal}
            centerValue={`${vehiclePct}%`}
            centerLabel="done"
          />

          <div className="flex-1 space-y-2">
            <StatPill
              color="bg-emerald-500"
              label="Completed"
              value={vehicleCompleted}
            />
            <StatPill
              color="bg-red-500"
              label="Pending"
              value={vehiclePending}
            />
            {defectsFixed > 0 && (
              <StatPill
                color="bg-blue-500"
                label="Defects fixed"
                value={defectsFixed}
              />
            )}
          </div>
        </div>
      </button>

      <button
        onClick={() => navigate('/weekly-timesheets')}
        className="group bg-white border border-slate-200 rounded-xl p-5 text-left transition-all duration-200 hover:border-teal-300 hover:shadow-md hover:shadow-teal-100/50 active:scale-[0.98] cursor-pointer"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-teal-50 rounded-lg">
              <FileText className="h-4 w-4 text-teal-600" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Weekly Timesheet Compliance
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                WE {formatWeekEnding(weekEnding)}
              </p>
            </div>
          </div>
          <ArrowRight className="h-4 w-4 text-slate-300 group-hover:text-teal-500 group-hover:translate-x-0.5 transition-all" />
        </div>

        {tsLoading ? (
          <div className="flex justify-center py-4">
            <div className="w-5 h-5 border-2 border-slate-200 border-t-slate-500 rounded-full animate-spin" />
          </div>
        ) : (
          <div className="flex items-center gap-5">
            <DonutChart
              segments={[
                { value: tsCounts.submitted, color: '#10b981' },
                { value: tsCounts.returned, color: '#f59e0b' },
                { value: tsCounts.notSubmitted, color: '#ef4444' },
              ]}
              total={tsCounts.total}
              centerValue={`${tsPct}%`}
              centerLabel="done"
            />

            <div className="flex-1 space-y-2">
              <StatPill
                color="bg-emerald-500"
                label="Submitted"
                value={tsCounts.submitted}
              />
              <StatPill
                color="bg-amber-500"
                label="Returned"
                value={tsCounts.returned}
              />
              <StatPill
                color="bg-red-500"
                label="Not submitted"
                value={tsCounts.notSubmitted}
              />
            </div>
          </div>
        )}
      </button>
    </div>
  );
};
