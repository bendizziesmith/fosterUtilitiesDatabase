import React, { useState, useEffect } from 'react';
import {
  ClipboardList,
  HardHat,
  CheckCircle,
  AlertTriangle,
  Clock,
  RefreshCw,
  Users,
  FileText,
  Briefcase,
  ChevronRight,
} from 'lucide-react';
import { supabase, Employee, GangOperative } from '../../../lib/supabase';
import { getEffectiveWeekEnding } from '../../../lib/havsUtils';
import {
  getWeekEndingSunday,
  formatWeekEnding,
  formatHoursDecimal,
  getStatusInfo,
} from '../../../lib/timesheetUtils';
import { loadGangerTimesheets, TimesheetWeek } from '../../../lib/timesheetService';

interface EmployeeLandingProps {
  onTaskSelect: (task: 'inspection' | 'havs' | 'timesheet-list') => void;
  onOpenTimesheetDirect: (weekEnding: string) => void;
  selectedEmployee: Employee;
}

interface ComplianceStatus {
  todayVehicleCheck: boolean;
  currentWeekHavs: boolean;
  loading: boolean;
}

interface GangMemberHavsStatus {
  operative: GangOperative;
  role: 'Ganger' | 'Operative';
  totalMinutes: number;
  status: 'none' | 'draft' | 'submitted';
  updatedAt: string | null;
}

export const EmployeeLanding: React.FC<EmployeeLandingProps> = ({
  onTaskSelect,
  onOpenTimesheetDirect,
  selectedEmployee,
}) => {
  const [compliance, setCompliance] = useState<ComplianceStatus>({
    todayVehicleCheck: false,
    currentWeekHavs: false,
    loading: true,
  });

  const [gangHavsStatus, setGangHavsStatus] = useState<GangMemberHavsStatus[]>([]);
  const [weekEnding, setWeekEnding] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [currentTimesheet, setCurrentTimesheet] = useState<TimesheetWeek | null>(null);
  const [timesheetLoading, setTimesheetLoading] = useState(true);

  useEffect(() => {
    if (!selectedEmployee?.id) return;
    checkComplianceStatus();
    loadTimesheetStatus();
  }, [selectedEmployee?.id]);

  const getTodayRangeISO = () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = new Date(start);
    end.setDate(start.getDate() + 1);
    return { startISO: start.toISOString(), endISO: end.toISOString() };
  };

  const didSubmitVehicleCheckToday = async (employeeId: string): Promise<boolean> => {
    const { startISO, endISO } = getTodayRangeISO();

    let { data, error } = await supabase
      .from('vehicle_inspections')
      .select('id')
      .eq('employee_id', employeeId)
      .gte('submitted_at', startISO)
      .lt('submitted_at', endISO)
      .limit(1);

    if (!error) {
      return Array.isArray(data) && data.length > 0;
    }

    if (error?.code === '42703' || /column .*submitted_at.* does not exist/i.test(error.message || '')) {
      const createdResp = await supabase
        .from('vehicle_inspections')
        .select('id')
        .eq('employee_id', employeeId)
        .gte('created_at', startISO)
        .lt('created_at', endISO)
        .limit(1);

      if (!createdResp.error) {
        return Array.isArray(createdResp.data) && createdResp.data.length > 0;
      }

      const todayStr = new Date().toISOString().split('T')[0];
      const dateResp = await supabase
        .from('vehicle_inspections')
        .select('id')
        .eq('employee_id', employeeId)
        .eq('inspection_date', todayStr)
        .limit(1);

      if (!dateResp.error) {
        return Array.isArray(dateResp.data) && dateResp.data.length > 0;
      }

      console.warn('Vehicle check date fallback failed:', createdResp.error || dateResp.error);
      return false;
    }

    console.warn('Vehicle check query error:', error);
    return false;
  };

  const loadGangHavsStatus = async (weekEndingStr: string) => {
    try {
      const { data: havsWeek } = await supabase
        .from('havs_weeks')
        .select('id, status, last_saved_at')
        .eq('week_ending', weekEndingStr)
        .eq('ganger_id', selectedEmployee.id)
        .maybeSingle();

      if (!havsWeek) {
        setGangHavsStatus([]);
        return false;
      }

      const { data: members } = await supabase
        .from('havs_week_members')
        .select(`
          id,
          person_type,
          employee_id,
          manual_name,
          role,
          employee:employees(id, full_name, role)
        `)
        .eq('havs_week_id', havsWeek.id)
        .order('person_type', { ascending: false })
        .order('created_at', { ascending: true });

      if (!members || members.length === 0) {
        setGangHavsStatus([]);
        return false;
      }

      const statusList: GangMemberHavsStatus[] = [];

      for (const member of members) {
        const { data: entries } = await supabase
          .from('havs_exposure_entries')
          .select('minutes')
          .eq('havs_week_member_id', member.id);

        const totalMinutes = entries?.reduce((sum, e) => sum + e.minutes, 0) || 0;

        let displayName = 'Unknown';
        let isManual = false;

        if (member.manual_name) {
          displayName = member.manual_name;
          isManual = true;
        } else if (member.employee && Array.isArray(member.employee) && member.employee[0]) {
          displayName = member.employee[0].full_name;
        } else if (member.employee && !Array.isArray(member.employee)) {
          displayName = member.employee.full_name;
        } else if (member.person_type === 'ganger') {
          displayName = selectedEmployee.full_name;
        }

        const operative: GangOperative = {
          id: member.id,
          full_name: displayName,
          role: member.role,
          is_manual: isManual,
          employee_id: member.employee_id,
        };

        statusList.push({
          operative,
          role: member.person_type === 'ganger' ? 'Ganger' : 'Operative',
          totalMinutes,
          status: havsWeek.status === 'submitted' ? 'submitted' : totalMinutes > 0 ? 'draft' : 'none',
          updatedAt: havsWeek.last_saved_at || null,
        });
      }

      statusList.sort((a, b) => {
        if (a.role === 'Ganger' && b.role !== 'Ganger') return -1;
        if (a.role !== 'Ganger' && b.role === 'Ganger') return 1;
        return 0;
      });

      setGangHavsStatus(statusList);
      return havsWeek.status === 'submitted';
    } catch (error) {
      console.error('Error loading gang HAVS status:', error);
      setGangHavsStatus([]);
      return false;
    }
  };

  const loadTimesheetStatus = async () => {
    try {
      setTimesheetLoading(true);
      const currentWeekEnding = getWeekEndingSunday();
      const all = await loadGangerTimesheets(selectedEmployee.id);
      const current = all.find((t) => t.week_ending === currentWeekEnding) || null;
      setCurrentTimesheet(current);
    } catch (err) {
      console.error('Failed to load timesheet status:', err);
    } finally {
      setTimesheetLoading(false);
    }
  };

  const checkComplianceStatus = async () => {
    try {
      setCompliance((prev) => ({ ...prev, loading: true }));

      const employeeId = selectedEmployee.id;
      const weekEndingStr = await getEffectiveWeekEnding();
      setWeekEnding(weekEndingStr);

      const todayDone = await didSubmitVehicleCheckToday(employeeId);
      const allHavsSubmitted = await loadGangHavsStatus(weekEndingStr);

      setCompliance({
        todayVehicleCheck: todayDone,
        currentWeekHavs: allHavsSubmitted,
        loading: false,
      });
    } catch (error) {
      console.error('Error checking compliance status:', error);
      setCompliance((prev) => ({ ...prev, loading: false }));
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([checkComplianceStatus(), loadTimesheetStatus()]);
    setRefreshing(false);
  };

  const currentWeekEndingSunday = getWeekEndingSunday();

  const getTimesheetStatusLabel = () => {
    if (!currentTimesheet) return 'Not started';
    switch (currentTimesheet.status) {
      case 'submitted':
        return 'Submitted';
      case 'returned':
        return 'Returned';
      default:
        return 'Draft';
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">
            {selectedEmployee.full_name}
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {selectedEmployee.role}
            {selectedEmployee.assigned_vehicle &&
              ` \u2022 ${selectedEmployee.assigned_vehicle.registration_number}`}
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing || compliance.loading}
          className="p-2.5 text-slate-400 hover:text-slate-600 hover:bg-white rounded-xl border border-transparent hover:border-slate-200 transition-all disabled:opacity-50"
          title="Refresh"
        >
          <RefreshCw className={`h-4.5 w-4.5 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {!compliance.loading && !compliance.todayVehicleCheck && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
          <div className="flex items-start gap-3">
            <div className="p-1.5 bg-red-100 rounded-lg mt-0.5">
              <AlertTriangle className="h-4 w-4 text-red-600" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-red-800">
                Daily vehicle check required
              </p>
              <p className="text-xs text-red-600 mt-0.5">
                Complete your inspection before starting work
              </p>
            </div>
            <button
              onClick={() => onTaskSelect('inspection')}
              className="px-4 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 active:bg-red-800 rounded-lg transition-colors flex-shrink-0"
            >
              Start Check
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        <ModuleCard
          icon={<ClipboardList className="h-5 w-5" />}
          label="Vehicle & Plant Check"
          sublabel="Daily inspection"
          iconBg="bg-sky-100"
          iconColor="text-sky-600"
          done={compliance.todayVehicleCheck}
          loading={compliance.loading}
          onClick={() => onTaskSelect('inspection')}
        />
        <ModuleCard
          icon={<HardHat className="h-5 w-5" />}
          label="HAVS Timesheet"
          sublabel="Weekly exposure"
          iconBg="bg-amber-100"
          iconColor="text-amber-600"
          done={compliance.currentWeekHavs}
          loading={compliance.loading}
          onClick={() => onTaskSelect('havs')}
        />
        <ModuleCard
          icon={<FileText className="h-5 w-5" />}
          label="Weekly Timesheet"
          sublabel="Work record"
          iconBg="bg-teal-100"
          iconColor="text-teal-600"
          done={currentTimesheet?.status === 'submitted'}
          loading={timesheetLoading}
          onClick={() => onTaskSelect('timesheet-list')}
        />
      </div>

      <WeeklyTimesheetStatus
        weekEnding={currentWeekEndingSunday}
        timesheet={currentTimesheet}
        loading={timesheetLoading}
        statusLabel={getTimesheetStatusLabel()}
        onOpen={() => onOpenTimesheetDirect(currentWeekEndingSunday)}
      />

      <HavsGangStatus
        gangStatus={gangHavsStatus}
        weekEnding={weekEnding}
        havsSubmitted={compliance.currentWeekHavs}
        loading={compliance.loading}
        onOpen={() => onTaskSelect('havs')}
      />
    </div>
  );
};

function ModuleCard({
  icon,
  label,
  sublabel,
  iconBg,
  iconColor,
  done,
  loading,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  sublabel: string;
  iconBg: string;
  iconColor: string;
  done: boolean | undefined;
  loading: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center text-center p-5 bg-white border border-slate-200 rounded-xl cursor-pointer hover:border-slate-300 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 active:bg-slate-50 transition-all group"
    >
      <div className={`p-3 rounded-xl ${iconBg} mb-3 transition-transform group-hover:scale-105`}>
        <span className={iconColor}>{icon}</span>
      </div>
      <p className="text-sm font-semibold text-slate-900 leading-tight">{label}</p>
      <p className="text-xs text-slate-400 mt-1">{sublabel}</p>
      <div className="mt-3">
        {loading ? (
          <div className="w-4 h-4 border-2 border-slate-200 border-t-slate-500 rounded-full animate-spin" />
        ) : done ? (
          <CheckCircle className="h-5 w-5 text-emerald-500" />
        ) : (
          <ChevronRight className="h-5 w-5 text-slate-300 group-hover:text-slate-500 transition-colors" />
        )}
      </div>
    </button>
  );
}

function WeeklyTimesheetStatus({
  weekEnding,
  timesheet,
  loading,
  statusLabel,
  onOpen,
}: {
  weekEnding: string;
  timesheet: TimesheetWeek | null;
  loading: boolean;
  statusLabel: string;
  onOpen: () => void;
}) {
  const statusInfo = timesheet ? getStatusInfo(timesheet.status) : null;

  const jobCount = timesheet?.job_rows?.length ?? 0;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
      className="bg-white border border-slate-200 rounded-xl overflow-hidden cursor-pointer hover:border-slate-300 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 active:bg-slate-50/50 transition-all group"
    >
      <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 bg-teal-100 rounded-lg">
            <FileText className="h-4 w-4 text-teal-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Weekly Timesheet</h3>
            <p className="text-xs text-slate-400">
              Week ending {formatWeekEnding(weekEnding)}
            </p>
          </div>
        </div>
        <ChevronRight className="h-4.5 w-4.5 text-slate-300 group-hover:text-teal-500 transition-colors" />
      </div>

      <div className="px-5 py-4">
        {loading ? (
          <div className="flex justify-center py-4">
            <div className="w-5 h-5 border-2 border-slate-200 border-t-slate-500 rounded-full animate-spin" />
          </div>
        ) : !timesheet ? (
          <div className="flex items-center gap-3 py-1">
            <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center">
              <Clock className="h-5 w-5 text-slate-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-700">Not started yet</p>
              <p className="text-xs text-slate-400">Tap to create this week's timesheet</p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {statusInfo && (
                  <span
                    className={`inline-flex items-center px-2.5 py-1 text-xs font-semibold rounded-full border ${statusInfo.color} ${statusInfo.bgColor} ${statusInfo.borderColor}`}
                  >
                    {statusLabel}
                  </span>
                )}
              </div>
              {timesheet.weekly_total_hours > 0 && (
                <span className="text-lg font-bold text-slate-900">
                  {formatHoursDecimal(timesheet.weekly_total_hours)}
                  <span className="text-xs font-medium text-slate-400 ml-1">hrs</span>
                </span>
              )}
            </div>

            <div className="flex items-center gap-4 text-xs text-slate-500">
              {jobCount > 0 && (
                <span className="flex items-center gap-1">
                  <Briefcase className="h-3.5 w-3.5" />
                  {jobCount} {jobCount === 1 ? 'job' : 'jobs'}
                </span>
              )}
              {timesheet.submitted_at && (
                <span>
                  Submitted{' '}
                  {new Date(timesheet.submitted_at).toLocaleDateString('en-GB', {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              )}
              {timesheet.status === 'returned' && timesheet.returned_reason && (
                <span className="text-red-600 font-medium truncate">
                  Reason: {timesheet.returned_reason}
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function HavsGangStatus({
  gangStatus,
  weekEnding,
  havsSubmitted,
  loading,
  onOpen,
}: {
  gangStatus: GangMemberHavsStatus[];
  weekEnding: string;
  havsSubmitted: boolean;
  loading: boolean;
  onOpen: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
      className="bg-white border border-slate-200 rounded-xl overflow-hidden cursor-pointer hover:border-slate-300 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 active:bg-slate-50/50 transition-all group"
    >
      <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 bg-amber-100 rounded-lg">
            <HardHat className="h-4 w-4 text-amber-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900">HAVS Gang Status</h3>
            <p className="text-xs text-slate-400">
              {weekEnding
                ? `Week ending ${new Date(weekEnding).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
                : 'Current week'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {gangStatus.length > 0 && (
            <span className="flex items-center gap-1 text-xs text-slate-400 bg-slate-100 px-2 py-1 rounded-md">
              <Users className="h-3 w-3" />
              {gangStatus.length}
            </span>
          )}
          <ChevronRight className="h-4.5 w-4.5 text-slate-300 group-hover:text-amber-500 transition-colors" />
        </div>
      </div>

      <div className="px-5 py-4">
        {loading ? (
          <div className="flex justify-center py-4">
            <div className="w-5 h-5 border-2 border-slate-200 border-t-slate-500 rounded-full animate-spin" />
          </div>
        ) : gangStatus.length === 0 ? (
          <div className="flex items-center gap-3 py-1">
            <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center">
              <HardHat className="h-5 w-5 text-slate-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-700">No HAVS data this week</p>
              <p className="text-xs text-slate-400">Tap to start HAVS timesheet</p>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {gangStatus.map((member) => (
              <div
                key={member.operative.id}
                className={`flex items-center justify-between p-3 rounded-lg border ${
                  member.role === 'Ganger'
                    ? 'bg-sky-50/50 border-sky-100'
                    : 'bg-slate-50/50 border-slate-100'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                      member.role === 'Ganger' ? 'bg-sky-500' : 'bg-slate-400'
                    }`}
                  >
                    <span className="text-xs font-bold text-white">
                      {member.operative.full_name
                        .split(' ')
                        .map((n) => n[0])
                        .join('')
                        .toUpperCase()
                        .slice(0, 2)}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">
                      {member.operative.full_name}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span
                        className={`text-xs font-medium ${
                          member.role === 'Ganger' ? 'text-sky-600' : 'text-slate-500'
                        }`}
                      >
                        {member.role}
                      </span>
                      {member.totalMinutes > 0 && (
                        <span className="text-xs text-slate-500">
                          {member.totalMinutes} min
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex-shrink-0 ml-2">
                  {member.status === 'submitted' ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 px-2 py-1 bg-emerald-50 border border-emerald-200 rounded-full">
                      <CheckCircle className="h-3 w-3" />
                      Done
                    </span>
                  ) : member.status === 'draft' ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 px-2 py-1 bg-amber-50 border border-amber-200 rounded-full">
                      <Clock className="h-3 w-3" />
                      Draft
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400 px-2 py-1 bg-slate-100 rounded-full">
                      None
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
