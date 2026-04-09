import React, { useState, useEffect } from 'react';
import {
  FileText,
  CheckCircle,
  XCircle,
  RotateCcw,
  ChevronDown,
  ChevronRight,
  Users,
} from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { formatWeekEnding } from '../../../lib/timesheetUtils';

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

export const TimesheetComplianceChart: React.FC = () => {
  const [showDetails, setShowDetails] = useState(false);
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState({
    total: 0,
    submitted: 0,
    returned: 0,
    notSubmitted: 0,
  });
  const [missing, setMissing] = useState<
    { name: string; role: string }[]
  >([]);

  const weekEnding = getPreviousSunday();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);

      const [empRes, tsRes] = await Promise.all([
        supabase
          .from('employees')
          .select('id, full_name, role')
          .in('role', ['Ganger', 'Backup Driver'])
          .order('full_name'),
        supabase
          .from('timesheet_weeks')
          .select('ganger_employee_id, status')
          .eq('week_ending', weekEnding),
      ]);

      if (empRes.error) throw empRes.error;
      if (tsRes.error) throw tsRes.error;

      const employees = empRes.data || [];
      const timesheets = tsRes.data || [];

      const tsMap = new Map<string, string>();
      timesheets.forEach((t: any) => tsMap.set(t.ganger_employee_id, t.status));

      let sub = 0;
      let ret = 0;
      let notSub = 0;
      const missingList: { name: string; role: string }[] = [];

      employees.forEach((emp: any) => {
        const status = tsMap.get(emp.id);
        if (status === 'submitted') {
          sub++;
        } else if (status === 'returned') {
          ret++;
          missingList.push({ name: emp.full_name, role: emp.role });
        } else {
          notSub++;
          missingList.push({ name: emp.full_name, role: emp.role });
        }
      });

      setCounts({
        total: employees.length,
        submitted: sub,
        returned: ret,
        notSubmitted: notSub,
      });
      setMissing(missingList);
    } catch (err) {
      console.error('Failed to load timesheet compliance:', err);
    } finally {
      setLoading(false);
    }
  };

  const { total, submitted, returned, notSubmitted } = counts;
  const submittedPct = total > 0 ? (submitted / total) * 100 : 0;
  const returnedPct = total > 0 ? (returned / total) * 100 : 0;
  const notSubmittedPct = total > 0 ? (notSubmitted / total) * 100 : 0;

  const circumference = 2 * Math.PI * 32;
  const submittedStroke = (submittedPct / 100) * circumference;
  const returnedStroke = (returnedPct / 100) * circumference;
  const notSubmittedStroke = (notSubmittedPct / 100) * circumference;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <FileText className="h-5 w-5 text-teal-600" />
          <h3 className="text-xl font-bold text-slate-900">
            Weekly Timesheet Compliance
          </h3>
        </div>
        <div className="flex items-center space-x-3">
          <div className="text-sm text-slate-500">
            WE {formatWeekEnding(weekEnding)}
          </div>
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="flex items-center space-x-1 text-sm text-teal-600 hover:text-teal-700 transition-colors"
          >
            <span>Details</span>
            {showDetails ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <div className="w-6 h-6 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
        </div>
      ) : (
        <>
          <div className="flex items-center space-x-6">
            <div className="flex flex-col items-center">
              <div className="relative w-24 h-24 mb-3">
                <svg
                  className="w-24 h-24 transform -rotate-90"
                  viewBox="0 0 80 80"
                >
                  <circle
                    cx="40"
                    cy="40"
                    r="32"
                    fill="none"
                    stroke="#f1f5f9"
                    strokeWidth="10"
                  />
                  {submitted > 0 && (
                    <circle
                      cx="40"
                      cy="40"
                      r="32"
                      fill="none"
                      stroke="#10b981"
                      strokeWidth="10"
                      strokeDasharray={`${submittedStroke} ${circumference}`}
                      strokeDashoffset="0"
                      className="transition-all duration-500"
                    />
                  )}
                  {returned > 0 && (
                    <circle
                      cx="40"
                      cy="40"
                      r="32"
                      fill="none"
                      stroke="#f59e0b"
                      strokeWidth="10"
                      strokeDasharray={`${returnedStroke} ${circumference}`}
                      strokeDashoffset={`-${submittedStroke}`}
                      className="transition-all duration-500"
                    />
                  )}
                  {notSubmitted > 0 && (
                    <circle
                      cx="40"
                      cy="40"
                      r="32"
                      fill="none"
                      stroke="#ef4444"
                      strokeWidth="10"
                      strokeDasharray={`${notSubmittedStroke} ${circumference}`}
                      strokeDashoffset={`-${submittedStroke + returnedStroke}`}
                      className="transition-all duration-500"
                    />
                  )}
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <div className="text-xl font-bold text-slate-900">
                    {submitted}
                  </div>
                  <div className="text-sm text-slate-500">of {total}</div>
                </div>
              </div>

              <div className="space-y-2 text-center">
                <div className="flex items-center space-x-2 text-sm">
                  <div className="w-3 h-3 bg-emerald-500 rounded-full" />
                  <span className="text-slate-700 font-medium">
                    Submitted ({submittedPct.toFixed(0)}%)
                  </span>
                </div>
                <div className="flex items-center space-x-2 text-sm">
                  <div className="w-3 h-3 bg-amber-500 rounded-full" />
                  <span className="text-slate-700 font-medium">
                    Returned ({returnedPct.toFixed(0)}%)
                  </span>
                </div>
                <div className="flex items-center space-x-2 text-sm">
                  <div className="w-3 h-3 bg-red-500 rounded-full" />
                  <span className="text-slate-700 font-medium">
                    Not Submitted ({notSubmittedPct.toFixed(0)}%)
                  </span>
                </div>
              </div>
            </div>

            <div className="flex-1 grid grid-cols-2 gap-4">
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                <div className="flex items-center space-x-3">
                  <CheckCircle className="h-5 w-5 text-emerald-600" />
                  <div>
                    <div className="text-xl font-bold text-emerald-700">
                      {submitted}
                    </div>
                    <div className="text-sm text-emerald-600 font-medium">
                      Submitted
                    </div>
                  </div>
                </div>
              </div>
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-center space-x-3">
                  <XCircle className="h-5 w-5 text-red-600" />
                  <div>
                    <div className="text-xl font-bold text-red-700">
                      {notSubmitted + returned}
                    </div>
                    <div className="text-sm text-red-600 font-medium">
                      Outstanding
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {showDetails && (
            <div className="mt-4 pt-4 border-t border-slate-200 space-y-3">
              {missing.length > 0 ? (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <h4 className="text-sm font-semibold text-red-800 mb-2 flex items-center">
                    <Users className="h-4 w-4 mr-1" />
                    Missing / Returned Timesheets:
                  </h4>
                  <div className="space-y-1 max-h-24 overflow-y-auto">
                    {missing.map((m, i) => (
                      <div key={i} className="text-sm text-red-700">
                        {m.name} ({m.role})
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                  <div className="flex items-center space-x-2 text-emerald-800">
                    <CheckCircle className="h-4 w-4" />
                    <span className="text-sm font-medium">
                      All gangers and backup drivers have submitted!
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};
