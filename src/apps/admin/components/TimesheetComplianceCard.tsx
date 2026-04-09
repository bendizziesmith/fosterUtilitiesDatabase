import React, { useState, useEffect } from 'react';
import {
  CheckCircle,
  AlertTriangle,
  XCircle,
  Users,
  RotateCcw,
  RefreshCw,
  Car,
  Clock,
  Eye,
  Download,
} from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import {
  formatHoursDecimal,
  downloadTimesheetCSV,
} from '../../../lib/timesheetUtils';

interface ComplianceEmployee {
  id: string;
  full_name: string;
  role: string;
  assigned_vehicle: string | null;
}

interface TimesheetRecord {
  id: string;
  ganger_employee_id: string;
  ganger_name_snapshot: string;
  status: string;
  week_ending: string;
  weekly_total_hours: number;
  submitted_at: string | null;
  vehicle_registration_snapshot: string | null;
  labourer_1_name: string | null;
  labourer_2_name: string | null;
  job_rows?: any[];
  ganger?: any;
}

export interface ComplianceCounts {
  total: number;
  submitted: number;
  returned: number;
  notSubmitted: number;
}

interface TimesheetComplianceCardProps {
  weekEnding: string;
  onCountsChange?: (counts: ComplianceCounts) => void;
  onViewTimesheet?: (timesheetId: string) => void;
}

export const TimesheetComplianceCard: React.FC<TimesheetComplianceCardProps> = ({
  weekEnding,
  onCountsChange,
  onViewTimesheet,
}) => {
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
          .select(`
            id, ganger_employee_id, ganger_name_snapshot, status, week_ending,
            weekly_total_hours, submitted_at, vehicle_registration_snapshot,
            labourer_1_name, labourer_2_name,
            ganger:employees!ganger_employee_id(id, full_name, role),
            job_rows:timesheet_job_rows(
              *,
              day_entries:timesheet_day_entries(*)
            )
          `)
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

  useEffect(() => {
    if (!loading && onCountsChange) {
      onCountsChange({
        total: totalExpected,
        submitted: submitted.length,
        returned: returned.length,
        notSubmitted: notSubmitted.length,
      });
    }
  }, [loading, employees, timesheets]);

  const getInitials = (name: string) =>
    name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-slate-900">
            Submission Compliance
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Gangers and backup drivers
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
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
                      className="px-5 py-3.5 flex items-center gap-3 hover:bg-slate-50 transition-colors"
                    >
                      <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                        <span className="text-xs font-bold text-emerald-700">
                          {getInitials(emp.full_name)}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate">
                          {emp.full_name}
                        </p>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
                          <span className="text-xs text-slate-500">{emp.role}</span>
                          {emp.assigned_vehicle && (
                            <span className="flex items-center gap-1 text-xs text-slate-400">
                              <Car className="h-3 w-3" />
                              {emp.assigned_vehicle}
                            </span>
                          )}
                          {ts?.weekly_total_hours != null && (
                            <span className="flex items-center gap-1 text-xs font-medium text-emerald-600">
                              <Clock className="h-3 w-3" />
                              {formatHoursDecimal(ts.weekly_total_hours)}h
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {ts && (
                          <>
                            <button
                              onClick={() => downloadTimesheetCSV(ts)}
                              title="Download CSV"
                              className="p-2 rounded-lg text-slate-400 hover:text-teal-700 hover:bg-teal-50 transition-colors"
                            >
                              <Download className="h-4 w-4" />
                            </button>
                            {onViewTimesheet && (
                              <button
                                onClick={() => onViewTimesheet(ts.id)}
                                title="View Timesheet"
                                className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                              >
                                <Eye className="h-4 w-4" />
                              </button>
                            )}
                          </>
                        )}
                      </div>
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
                {returned.map((emp) => {
                  const ts = getTimesheetForEmployee(emp.id);
                  return (
                    <div
                      key={emp.id}
                      className="px-5 py-3.5 flex items-center gap-3 hover:bg-slate-50 transition-colors"
                    >
                      <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                        <span className="text-xs font-bold text-amber-700">
                          {getInitials(emp.full_name)}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate">
                          {emp.full_name}
                        </p>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
                          <span className="text-xs text-slate-500">{emp.role}</span>
                          {emp.assigned_vehicle && (
                            <span className="flex items-center gap-1 text-xs text-slate-400">
                              <Car className="h-3 w-3" />
                              {emp.assigned_vehicle}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {ts && onViewTimesheet && (
                          <button
                            onClick={() => onViewTimesheet(ts.id)}
                            title="View Timesheet"
                            className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                        )}
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                          <RotateCcw className="h-3 w-3" />
                          Returned
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

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
                            {getInitials(emp.full_name)}
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
