import React, { useState, useEffect } from 'react';
import { ClipboardList, HardHat, CheckCircle, Calendar, AlertTriangle, User, Clock, Shield, ChevronRight, RefreshCw, Users } from 'lucide-react';
import { supabase, Employee, GangOperative } from '../../../lib/supabase';

interface EmployeeLandingProps {
  onTaskSelect: (task: 'inspection' | 'havs') => void;
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
  selectedEmployee
}) => {
  const [compliance, setCompliance] = useState<ComplianceStatus>({
    todayVehicleCheck: false,
    currentWeekHavs: false,
    loading: true,
  });

  const [gangHavsStatus, setGangHavsStatus] = useState<GangMemberHavsStatus[]>([]);
  const [weekEnding, setWeekEnding] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!selectedEmployee?.id) return;
    checkComplianceStatus();
  }, [selectedEmployee?.id]);

  const getTodayRangeISO = () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = new Date(start);
    end.setDate(start.getDate() + 1);
    return { startISO: start.toISOString(), endISO: end.toISOString() };
  };

  const getCurrentWeekEnding = () => {
    const today = new Date();
    const d = new Date(today);
    const daysUntilSunday = (7 - d.getDay()) % 7;
    d.setDate(d.getDate() + daysUntilSunday);
    return d.toISOString().split('T')[0];
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
      const { data: memberships } = await supabase
        .from('gang_membership')
        .select('*')
        .eq('week_ending', weekEndingStr)
        .eq('ganger_id', selectedEmployee.id);

      const operatives: GangOperative[] = [];

      const gangerAsOperative: GangOperative = {
        id: selectedEmployee.id,
        full_name: selectedEmployee.full_name,
        role: selectedEmployee.role,
        is_manual: false,
        employee_id: selectedEmployee.id,
      };

      operatives.push(gangerAsOperative);

      if (memberships) {
        for (const membership of memberships) {
          if (membership.is_manual) {
            operatives.push({
              id: `manual-${membership.id}`,
              full_name: membership.operative_name,
              role: membership.operative_role,
              is_manual: true,
            });
          } else if (membership.operative_id) {
            const { data: employeeData } = await supabase
              .from('employees')
              .select('*')
              .eq('id', membership.operative_id)
              .maybeSingle();

            if (employeeData) {
              operatives.push({
                id: employeeData.id,
                full_name: employeeData.full_name,
                role: employeeData.role,
                is_manual: false,
                employee_id: employeeData.id,
              });
            }
          }
        }
      }

      const statusList: GangMemberHavsStatus[] = [];

      for (let i = 0; i < operatives.length; i++) {
        const operative = operatives[i];
        const personId = operative.is_manual ? operative.id : operative.employee_id!;

        const { data: havs } = await supabase
          .from('havs_timesheets')
          .select('id, total_hours, status, updated_at')
          .eq('employee_id', personId)
          .eq('week_ending', weekEndingStr)
          .maybeSingle();

        statusList.push({
          operative,
          role: i === 0 ? 'Ganger' : 'Operative',
          totalMinutes: havs?.total_hours || 0,
          status: havs?.status || 'none',
          updatedAt: havs?.updated_at || null,
        });
      }

      setGangHavsStatus(statusList);
      return statusList.every(s => s.status === 'submitted');
    } catch (error) {
      console.error('Error loading gang HAVS status:', error);
      setGangHavsStatus([]);
      return false;
    }
  };

  const checkComplianceStatus = async () => {
    try {
      setCompliance(prev => ({ ...prev, loading: true }));

      const employeeId = selectedEmployee.id;
      const weekEndingStr = getCurrentWeekEnding();
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
      setCompliance(prev => ({ ...prev, loading: false }));
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await checkComplianceStatus();
    setRefreshing(false);
  };

  const getStatusBadge = (isCompleted: boolean, urgency: string) => {
    if (compliance.loading) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-500 bg-slate-100 rounded">
          <div className="w-3 h-3 border-2 border-slate-300 border-t-slate-500 rounded-full animate-spin" />
          Checking
        </span>
      );
    }

    if (isCompleted) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded">
          <CheckCircle className="h-3.5 w-3.5" />
          Complete
        </span>
      );
    }

    if (urgency === 'high') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded">
          <AlertTriangle className="h-3.5 w-3.5" />
          Required
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded">
        <Clock className="h-3.5 w-3.5" />
        Pending
      </span>
    );
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="bg-white border border-slate-200 rounded-lg">
        <div className="px-6 py-5 border-b border-slate-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center">
                <User className="h-6 w-6 text-slate-600" />
              </div>
              <div>
                <h1 className="text-lg font-semibold text-slate-900">{selectedEmployee.full_name}</h1>
                <p className="text-sm text-slate-500">{selectedEmployee.role}</p>
              </div>
            </div>
            {selectedEmployee.assigned_vehicle && (
              <div className="text-right">
                <p className="text-xs text-slate-500 uppercase tracking-wide">Assigned Vehicle</p>
                <p className="text-sm font-medium text-slate-900">{selectedEmployee.assigned_vehicle.registration_number}</p>
              </div>
            )}
          </div>
        </div>

        <div className="px-6 py-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-slate-500" />
              <h2 className="text-sm font-semibold text-slate-900">Compliance Status</h2>
            </div>
            <button
              onClick={handleRefresh}
              disabled={refreshing || compliance.loading}
              className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded transition-colors disabled:opacity-50"
              title="Refresh status"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className={`p-4 rounded-lg border ${
              compliance.loading ? 'bg-slate-50 border-slate-200' :
              compliance.todayVehicleCheck ? 'bg-emerald-50/50 border-emerald-200' : 'bg-red-50/50 border-red-200'
            }`}>
              <div className="flex items-center justify-between mb-2">
                <div className="p-1.5 bg-blue-100 rounded">
                  <ClipboardList className="h-4 w-4 text-blue-600" />
                </div>
                {getStatusBadge(compliance.todayVehicleCheck, 'high')}
              </div>
              <p className="text-sm font-medium text-slate-900">Daily Vehicle Check</p>
              <p className="text-xs text-slate-500 mt-0.5">Required each working day</p>
            </div>

            <div className={`p-4 rounded-lg border ${
              compliance.loading ? 'bg-slate-50 border-slate-200' :
              compliance.currentWeekHavs ? 'bg-emerald-50/50 border-emerald-200' : 'bg-amber-50/50 border-amber-200'
            }`}>
              <div className="flex items-center justify-between mb-2">
                <div className="p-1.5 bg-amber-100 rounded">
                  <HardHat className="h-4 w-4 text-amber-600" />
                </div>
                {getStatusBadge(compliance.currentWeekHavs, 'medium')}
              </div>
              <p className="text-sm font-medium text-slate-900">HAVs Timesheet</p>
              <p className="text-xs text-slate-500 mt-0.5">Weekly exposure record</p>
            </div>
          </div>

          {!compliance.loading && !compliance.todayVehicleCheck && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-red-800">Daily vehicle check required</p>
                  <p className="text-xs text-red-700 mt-0.5">Complete your vehicle inspection before starting work</p>
                </div>
                <button
                  onClick={() => onTaskSelect('inspection')}
                  className="px-3 py-1.5 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded transition-colors"
                >
                  Start Check
                </button>
              </div>
            </div>
          )}

          {!compliance.loading && compliance.todayVehicleCheck && compliance.currentWeekHavs && (
            <div className="mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-emerald-600" />
                <p className="text-sm font-medium text-emerald-800">All compliance requirements complete</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg">
        <div className="px-6 py-4 border-b border-slate-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <HardHat className="h-5 w-5 text-amber-600" />
              <h2 className="text-sm font-semibold text-slate-900">HAVs Gang Status</h2>
              <span className="text-xs text-slate-500">(Live Data)</span>
            </div>
            {gangHavsStatus.length > 1 && (
              <div className="flex items-center gap-1.5 text-xs text-slate-600">
                <Users className="h-3.5 w-3.5" />
                <span>{gangHavsStatus.length} members</span>
              </div>
            )}
          </div>
          {weekEnding && (
            <p className="text-xs text-slate-500 mt-2">
              Week ending: {new Date(weekEnding).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
            </p>
          )}
        </div>

        <div className="px-6 py-4">
          {gangHavsStatus.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-4">Loading gang status...</p>
          ) : (
            <div className="space-y-3">
              {gangHavsStatus.map((member) => (
                <div key={member.operative.id} className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-md">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm font-medium text-slate-900">{member.operative.full_name}</p>
                      <span className={`text-xs px-2 py-0.5 rounded ${
                        member.role === 'Ganger' ? 'bg-blue-500 text-white' : 'bg-amber-500 text-white'
                      }`}>
                        {member.role}
                      </span>
                      {member.operative.is_manual && (
                        <span className="text-xs px-2 py-0.5 rounded bg-emerald-100 text-emerald-700">
                          Manual
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-xs text-slate-600">
                      <span>
                        {member.totalMinutes} min
                        {member.totalMinutes > 0 && ` (${(member.totalMinutes / 60).toFixed(1)}h)`}
                      </span>
                      {member.updatedAt && (
                        <span>
                          Updated: {new Date(member.updatedAt).toLocaleString('en-GB', {
                            day: 'numeric',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>
                      )}
                    </div>
                  </div>
                  <div>
                    {member.status === 'submitted' ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 px-2 py-1 bg-emerald-50 rounded">
                        <CheckCircle className="h-3.5 w-3.5" />
                        Submitted
                      </span>
                    ) : member.status === 'draft' ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 px-2 py-1 bg-amber-50 rounded">
                        <Clock className="h-3.5 w-3.5" />
                        In Progress
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400 px-2 py-1">Not Started</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {!compliance.currentWeekHavs && gangHavsStatus.length > 0 && (
            <div className="mt-4 pt-4 border-t border-slate-200">
              <button
                onClick={() => onTaskSelect('havs')}
                className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
              >
                {gangHavsStatus.some(m => m.status === 'draft') ? 'Continue HAVs Timesheet' : 'Start HAVs Timesheet'}
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <button
          onClick={() => onTaskSelect('inspection')}
          className={`p-5 text-left rounded-lg border-2 transition-all ${
            compliance.todayVehicleCheck
              ? 'bg-white border-slate-200 hover:border-slate-300'
              : 'bg-white border-red-200 hover:border-red-300'
          }`}
        >
          <div className="flex items-start justify-between mb-3">
            <div className={`p-2.5 rounded-lg ${compliance.todayVehicleCheck ? 'bg-blue-50' : 'bg-red-50'}`}>
              <ClipboardList className={`h-6 w-6 ${compliance.todayVehicleCheck ? 'text-blue-600' : 'text-red-600'}`} />
            </div>
            {!compliance.loading && (
              compliance.todayVehicleCheck ? (
                <CheckCircle className="h-5 w-5 text-emerald-500" />
              ) : (
                <AlertTriangle className="h-5 w-5 text-red-500" />
              )
            )}
          </div>
          <h3 className="text-base font-semibold text-slate-900 mb-1">Daily Vehicle Check</h3>
          <p className="text-sm text-slate-500 mb-3">Safety inspection for vehicles and equipment</p>
          <div className="flex items-center justify-between">
            <span className={`text-xs font-medium ${
              compliance.todayVehicleCheck ? 'text-emerald-600' : 'text-red-600'
            }`}>
              {compliance.loading ? 'Checking...' : compliance.todayVehicleCheck ? 'Completed Today' : 'Not Completed'}
            </span>
            <ChevronRight className="h-4 w-4 text-slate-400" />
          </div>
        </button>

        <button
          onClick={() => onTaskSelect('havs')}
          className={`p-5 text-left rounded-lg border-2 transition-all ${
            compliance.currentWeekHavs
              ? 'bg-white border-slate-200 hover:border-slate-300'
              : 'bg-white border-amber-200 hover:border-amber-300'
          }`}
        >
          <div className="flex items-start justify-between mb-3">
            <div className={`p-2.5 rounded-lg ${compliance.currentWeekHavs ? 'bg-amber-50' : 'bg-amber-50'}`}>
              <HardHat className="h-6 w-6 text-amber-600" />
            </div>
            {!compliance.loading && (
              compliance.currentWeekHavs ? (
                <CheckCircle className="h-5 w-5 text-emerald-500" />
              ) : (
                <Clock className="h-5 w-5 text-amber-500" />
              )
            )}
          </div>
          <h3 className="text-base font-semibold text-slate-900 mb-1">HAVs Timesheet</h3>
          <p className="text-sm text-slate-500 mb-3">Record vibrating equipment exposure</p>
          <div className="flex items-center justify-between">
            <span className={`text-xs font-medium ${
              compliance.currentWeekHavs ? 'text-emerald-600' : 'text-amber-600'
            }`}>
              {compliance.loading ? 'Checking...' : compliance.currentWeekHavs ? 'Submitted This Week' : 'Weekly - Due Sunday'}
            </span>
            <ChevronRight className="h-4 w-4 text-slate-400" />
          </div>
        </button>
      </div>

      <div className="bg-slate-50 border border-slate-200 rounded-lg px-6 py-4">
        <div className="flex items-start gap-3">
          <Calendar className="h-5 w-5 text-slate-500 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-slate-700">Compliance Reminder</p>
            <p className="text-sm text-slate-500 mt-0.5">
              Daily vehicle checks must be completed each working day before starting work.
              HAVs timesheets must be submitted by Monday 10:00 AM following the week ending.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
