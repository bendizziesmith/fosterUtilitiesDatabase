import React, { useState, useEffect } from 'react';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Users,
  RotateCcw,
  RefreshCw,
  Car,
} from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { formatWeekEnding } from '../../../lib/timesheetUtils';

interface ComplianceEmployee {
  id: string;
  full_name: string;
  role: string;
  assigned_vehicle: string | null;
}

interface TimesheetRecord {
  id: string;
  ganger_employee_id: string;
  status: string;
  weekly_total_hours: number;
  submitted_at: string | null;
}

function getPreviousSunday(): string {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? 7 : day;
  const prevSunday = new Date(now);
  prevSunday.setDate(now.getDate() - diff);
  const y = prevSunday.getFullYear();
  const m = String(prevSunday.getMonth() + 1).padStart(2, '0');
  const d = String(prevSunday.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getAdjacentSunday(dateStr: string, direction: number): string {
  const date = new Date(dateStr + 'T00:00:00');
  date.setDate(date.getDate() + 7 * direction);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export const TimesheetComplianceCard: React.FC = () => {
  const [weekEnding, setWeekEnding] = useState(getPreviousSunday());
  const [employees, setEmployees] = useState<ComplianceEmployee[]>([]);
  const [timesheets, setTimesheets] = useState<TimesheetRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadData();
  }, [weekEnding]);

  const loadData = async () => {
    try {
      setLoading(true);

      const [empRes, tsRes] = await Promise.all([
        supabase
          .from('employees')
          .select('id, full_name, role, assigned_vehicle')
          .in('role', ['Ganger', 'Backup Driver'])
          .order('full_name'),
        supabase
          .from('timesheet_weeks')
          .select('id, ganger_employee_id, status, weekly_total_hours, submitted_at')
          .eq('week_ending', weekEnding),
      ]);

      if (empRes.error) throw empRes.error;
      if (tsRes.error) throw tsRes.error;

      setEmployees(empRes.data || []);
      setTimesheets(tsRes.data || []);
    } catch (err) {
      console.error('Failed to load compliance data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const getTimesheetForEmployee = (empId: string): TimesheetRecord | undefined => {
    return timesheets.find((t) => t.ganger_employee_id === empId);
  };

  const submitted = employees.filter((e) => {
    const ts = getTimesheetForEmployee(e.id);
    return ts?.status === 'submitted';
  });

  const returned = employees.filter((e) => {
    const ts = getTimesheetForEmployee(e.id);
    return ts?.status === 'returned';
  });

  const notSubmitted = employees.filter((e) => {
    const ts = getTimesheetForEmployee(e.id);
    return !ts || ts.status === 'draft';
  });

  const totalExpected = employees.length;

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="px-6 py-5 border-b border-slate-200">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-slate-900">
              Weekly Timesheet Compliance
            </h3>
            <p className="text-sm text-slate-500 mt-0.5">
              Submission status for gangers and backup drivers
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between mt-4 bg-slate-50 rounded-lg px-4 py-2.5">
          <button
            onClick={() => setWeekEnding(getAdjacentSunday(weekEnding, -1))}
            className="p-1.5 hover:bg-slate-200 rounded-lg transition-colors"
          >
            <ChevronLeft className="h-5 w-5 text-slate-600" />
          </button>
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-slate-400" />
            <span className="text-sm font-semibold text-slate-800">
              Week Ending {formatWeekEnding(weekEnding)}
            </span>
          </div>
          <button
            onClick={() => setWeekEnding(getAdjacentSunday(weekEnding, 1))}
            className="p-1.5 hover:bg-slate-200 rounded-lg transition-colors"
          >
            <ChevronRight className="h-5 w-5 text-slate-600" />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-slate-200">
            <StatBlock
              label="Expected"
              value={totalExpected}
              icon={<Users className="h-4 w-4 text-slate-500" />}
              bgClass="bg-white"
              valueClass="text-slate-900"
            />
            <StatBlock
              label="Submitted"
              value={submitted.length}
              icon={<CheckCircle className="h-4 w-4 text-emerald-500" />}
              bgClass="bg-white"
              valueClass="text-emerald-700"
            />
            <StatBlock
              label="Returned"
              value={returned.length}
              icon={<RotateCcw className="h-4 w-4 text-amber-500" />}
              bgClass="bg-white"
              valueClass="text-amber-700"
            />
            <StatBlock
              label="Not Submitted"
              value={notSubmitted.length}
              icon={<XCircle className="h-4 w-4 text-red-500" />}
              bgClass="bg-white"
              valueClass="text-red-700"
            />
          </div>

          {notSubmitted.length > 0 && (
            <div className="border-t border-slate-200">
              <div className="px-5 py-3 bg-red-50 border-b border-red-100">
                <div className="flex items-center gap-2">
                  <XCircle className="h-4 w-4 text-red-500" />
                  <span className="text-sm font-semibold text-red-800">
                    Missing Timesheets ({notSubmitted.length})
                  </span>
                </div>
              </div>
              <div className="divide-y divide-slate-100">
                {notSubmitted.map((emp) => {
                  const ts = getTimesheetForEmployee(emp.id);
                  const isDraft = ts?.status === 'draft';

                  return (
                    <div
                      key={emp.id}
                      className="px-5 py-3.5 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                          <span className="text-xs font-bold text-red-700">
                            {emp.full_name
                              .split(' ')
                              .map((n) => n[0])
                              .join('')
                              .toUpperCase()
                              .slice(0, 2)}
                          </span>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-slate-900">
                            {emp.full_name}
                          </p>
                          <div className="flex items-center gap-3 mt-0.5">
                            <span className="text-xs text-slate-500">{emp.role}</span>
                            {emp.assigned_vehicle && (
                              <span className="flex items-center gap-1 text-xs text-slate-400">
                                <Car className="h-3 w-3" />
                                {emp.assigned_vehicle}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full ${
                          isDraft
                            ? 'bg-amber-50 text-amber-700 border border-amber-200'
                            : 'bg-red-50 text-red-700 border border-red-200'
                        }`}
                      >
                        {isDraft ? (
                          <>
                            <AlertTriangle className="h-3 w-3" />
                            Draft only
                          </>
                        ) : (
                          <>
                            <XCircle className="h-3 w-3" />
                            Not submitted
                          </>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {returned.length > 0 && (
            <div className="border-t border-slate-200">
              <div className="px-5 py-3 bg-amber-50 border-b border-amber-100">
                <div className="flex items-center gap-2">
                  <RotateCcw className="h-4 w-4 text-amber-500" />
                  <span className="text-sm font-semibold text-amber-800">
                    Returned Timesheets ({returned.length})
                  </span>
                </div>
              </div>
              <div className="divide-y divide-slate-100">
                {returned.map((emp) => (
                  <div
                    key={emp.id}
                    className="px-5 py-3.5 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                        <span className="text-xs font-bold text-amber-700">
                          {emp.full_name
                            .split(' ')
                            .map((n) => n[0])
                            .join('')
                            .toUpperCase()
                            .slice(0, 2)}
                        </span>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-900">
                          {emp.full_name}
                        </p>
                        <div className="flex items-center gap-3 mt-0.5">
                          <span className="text-xs text-slate-500">{emp.role}</span>
                          {emp.assigned_vehicle && (
                            <span className="flex items-center gap-1 text-xs text-slate-400">
                              <Car className="h-3 w-3" />
                              {emp.assigned_vehicle}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                      <RotateCcw className="h-3 w-3" />
                      Returned
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {submitted.length > 0 && (
            <div className="border-t border-slate-200">
              <div className="px-5 py-3 bg-emerald-50 border-b border-emerald-100">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-emerald-500" />
                  <span className="text-sm font-semibold text-emerald-800">
                    Submitted ({submitted.length})
                  </span>
                </div>
              </div>
              <div className="divide-y divide-slate-100">
                {submitted.map((emp) => {
                  const ts = getTimesheetForEmployee(emp.id);
                  return (
                    <div
                      key={emp.id}
                      className="px-5 py-3.5 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                          <span className="text-xs font-bold text-emerald-700">
                            {emp.full_name
                              .split(' ')
                              .map((n) => n[0])
                              .join('')
                              .toUpperCase()
                              .slice(0, 2)}
                          </span>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-slate-900">
                            {emp.full_name}
                          </p>
                          <div className="flex items-center gap-3 mt-0.5">
                            <span className="text-xs text-slate-500">{emp.role}</span>
                            {emp.assigned_vehicle && (
                              <span className="flex items-center gap-1 text-xs text-slate-400">
                                <Car className="h-3 w-3" />
                                {emp.assigned_vehicle}
                              </span>
                            )}
                            {ts?.weekly_total_hours != null && (
                              <span className="text-xs font-medium text-emerald-600">
                                {ts.weekly_total_hours}h
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <CheckCircle className="h-3 w-3" />
                        Submitted
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {totalExpected === 0 && (
            <div className="px-6 py-12 text-center">
              <Users className="h-8 w-8 text-slate-300 mx-auto mb-3" />
              <p className="text-sm text-slate-500">
                No gangers or backup drivers found
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
};

function StatBlock({
  label,
  value,
  icon,
  bgClass,
  valueClass,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  bgClass: string;
  valueClass: string;
}) {
  return (
    <div className={`${bgClass} px-5 py-4`}>
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-xs font-medium text-slate-500">{label}</span>
      </div>
      <p className={`text-2xl font-bold ${valueClass}`}>{value}</p>
    </div>
  );
}
