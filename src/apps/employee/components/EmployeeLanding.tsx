import React, { useState, useEffect } from 'react';
import { ClipboardList, HardHat, CheckCircle, X, Calendar, AlertTriangle, User } from 'lucide-react';
import { supabase, Employee } from '../../../lib/supabase';

interface EmployeeLandingProps {
  onTaskSelect: (task: 'inspection' | 'havs') => void;
  selectedEmployee: Employee;
}

interface ComplianceStatus {
  todayVehicleCheck: boolean;
  currentWeekHavs: boolean;
  loading: boolean;
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

  useEffect(() => {
    if (!selectedEmployee?.id) return;
    checkComplianceStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEmployee?.id]);

  // Local midnight → next local midnight, returned as ISO strings
  const getTodayRangeISO = () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()); // local 00:00
    const end = new Date(start);
    end.setDate(start.getDate() + 1); // next local 00:00
    return { startISO: start.toISOString(), endISO: end.toISOString() };
  };

  // Return next Sunday (week ending) as YYYY-MM-DD
  const getCurrentWeekEnding = () => {
    const today = new Date();
    const d = new Date(today);
    const daysUntilSunday = (7 - d.getDay()) % 7; // 0=Sun, 6=Sat
    d.setDate(d.getDate() + daysUntilSunday);
    return d.toISOString().split('T')[0];
  };

  // Robust “did employee submit any vehicle checks today?” detector.
  // Tries submitted_at, then created_at, then inspection_date (DATE), using .limit(1)
  const didSubmitVehicleCheckToday = async (employeeId: string): Promise<boolean> => {
    const { startISO, endISO } = getTodayRangeISO();

    // 1) Try submitted_at
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

    // If the error is “column does not exist”, try created_at
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

      // If created_at also fails, try DATE column inspection_date = today (local)
      const todayStr = new Date().toISOString().split('T')[0];
      const dateResp = await supabase
        .from('vehicle_inspections')
        .select('id')
        .eq('employee_id', employeeId)
        .eq('inspection_date', todayStr) // only works if you actually have a DATE column
        .limit(1);

      if (!dateResp.error) {
        return Array.isArray(dateResp.data) && dateResp.data.length > 0;
      }

      // Fallthrough: all failed
      console.warn('Vehicle check date fallback failed:', createdResp.error || dateResp.error);
      return false;
    }

    // Other errors (network, RLS, etc.)
    console.warn('Vehicle check query error:', error);
    return false;
  };

  const checkComplianceStatus = async () => {
    try {
      setCompliance(prev => ({ ...prev, loading: true }));

      const employeeId = selectedEmployee.id;
      const weekEndingStr = getCurrentWeekEnding();

      const todayDone = await didSubmitVehicleCheckToday(employeeId);

      const { data: havs } = await supabase
        .from('havs_timesheets')
        .select('id')
        .eq('employee_id', employeeId)
        .eq('week_ending', weekEndingStr)
        .eq('status', 'submitted')
        .limit(1);

      setCompliance({
        todayVehicleCheck: todayDone,
        currentWeekHavs: Array.isArray(havs) && havs.length > 0,
        loading: false,
      });
    } catch (error) {
      console.error('Error checking compliance status:', error);
      setCompliance(prev => ({ ...prev, loading: false }));
    }
  };

  const tasks = [
    {
      id: 'inspection' as const,
      title: 'Daily Vehicle & Plant Check',
      description: 'Complete daily safety checks for all vehicles and equipment',
      icon: ClipboardList,
      color: 'bg-blue-600',
      lightColor: 'bg-blue-50',
      iconColor: 'text-blue-600',
      borderColor: 'border-blue-200',
      hoverColor: 'hover:border-blue-400',
      frequency: 'Daily',
      isCompleted: compliance.todayVehicleCheck,
      urgency: 'high'
    },
    {
      id: 'havs' as const,
      title: 'HAVs Timesheet',
      description: 'Record vibrating equipment exposure time in minutes',
      icon: HardHat,
      color: 'bg-orange-600',
      lightColor: 'bg-orange-50',
      iconColor: 'text-orange-600',
      borderColor: 'border-orange-200',
      hoverColor: 'hover:border-orange-400',
      frequency: 'Weekly',
      isCompleted: compliance.currentWeekHavs,
      urgency: 'medium'
    }
  ];

  const getStatusIcon = (isCompleted: boolean, urgency: string) => {
    if (compliance.loading) {
      return <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-slate-400"></div>;
    }
    if (isCompleted) return <CheckCircle className="h-5 w-5 text-green-600" />;
    if (urgency === 'high') return <AlertTriangle className="h-5 w-5 text-red-600" />;
    return <X className="h-5 w-5 text-amber-600" />;
  };

  const getStatusText = (isCompleted: boolean, frequency: string) => {
    if (compliance.loading) return 'Checking...';
    return isCompleted ? `${frequency} - Complete` : `${frequency} - Pending`;
  };

  const getStatusColor = (isCompleted: boolean, urgency: string) => {
    if (compliance.loading) return 'text-slate-500';
    if (isCompleted) return 'text-green-600';
    return urgency === 'high' ? 'text-red-600' : 'text-amber-600';
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Welcome Header */}
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-2xl mb-4">
          <User className="h-8 w-8 text-blue-600" />
        </div>
        <h1 className="text-3xl font-bold text-slate-900 mb-2">
          Welcome, {selectedEmployee.full_name}
        </h1>
        <p className="text-lg text-slate-600 mb-1">{selectedEmployee.role}</p>
        {selectedEmployee.assigned_vehicle && (
          <p className="text-sm text-blue-600 font-medium">
            Assigned Vehicle: {selectedEmployee.assigned_vehicle.registration_number}
          </p>
        )}
      </div>

      {/* Compliance Status Overview */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <Calendar className="h-6 w-6 text-slate-600" />
            <div>
              <h2 className="text-xl font-bold text-slate-900">Your Compliance Status</h2>
              <p className="text-slate-600">Track your daily and weekly requirements</p>
            </div>
          </div>
          <button
            onClick={checkComplianceStatus}
            className="text-sm text-blue-600 hover:text-blue-700 transition-colors"
          >
            Refresh Status
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {tasks.map((task) => {
            const Icon = task.icon;
            const statusIcon = getStatusIcon(task.isCompleted, task.urgency);
            const statusText = getStatusText(task.isCompleted, task.frequency);
            const statusColor = getStatusColor(task.isCompleted, task.urgency);
            
            return (
              <div
                key={task.id}
                className={`p-4 rounded-xl border-2 transition-all duration-200 ${
                  task.isCompleted 
                    ? 'border-green-200 bg-green-50' 
                    : task.urgency === 'high'
                    ? 'border-red-200 bg-red-50'
                    : 'border-amber-200 bg-amber-50'
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className={`p-2 rounded-lg ${task.lightColor}`}>
                    <Icon className={`h-5 w-5 ${task.iconColor}`} />
                  </div>
                  {statusIcon}
                </div>
                <h3 className="font-semibold text-slate-900 mb-1">{task.title}</h3>
                <p className={`text-sm font-medium ${statusColor}`}>{statusText}</p>
              </div>
            );
          })}
        </div>

        {/* Quick Actions */}
        <div className="mt-6 pt-6 border-t border-slate-200">
          <div className="flex flex-wrap gap-3">
            {!compliance.loading && !compliance.todayVehicleCheck && (
              <button
                onClick={() => onTaskSelect('inspection')}
                className="flex items-center space-x-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg transition-colors text-sm font-medium"
              >
                <AlertTriangle className="h-4 w-4" />
                <span>Complete Daily Check</span>
              </button>
            )}
            {!compliance.loading && !compliance.currentWeekHavs && (
              <button
                onClick={() => onTaskSelect('havs')}
                className="flex items-center space-x-2 bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-lg transition-colors text-sm font-medium"
              >
                <HardHat className="h-4 w-4" />
                <span>Submit HAVs</span>
              </button>
            )}

            {!compliance.loading && compliance.todayVehicleCheck && compliance.currentWeekHavs && (
              <div className="w-full text-center py-4">
                <div className="inline-flex items-center space-x-2 bg-green-100 text-green-800 px-4 py-2 rounded-lg">
                  <CheckCircle className="h-5 w-5" />
                  <span className="font-medium">All compliance requirements completed!</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Task Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {tasks.map((task) => {
          const Icon = task.icon;
          return (
            <div
              key={task.id}
              className={`bg-white rounded-2xl shadow-sm hover:shadow-lg transition-all duration-300 overflow-hidden group cursor-pointer border-2 ${
                task.isCompleted 
                  ? 'border-green-200 hover:border-green-300' 
                  : `${task.borderColor} ${task.hoverColor}`
              }`}
              onClick={() => onTaskSelect(task.id)}
            >
              <div className={`${task.lightColor} p-6 border-b border-slate-100`}>
                <div className="flex items-center justify-between mb-4">
                  <div className={`p-3 ${task.lightColor} rounded-xl border-2 border-white shadow-sm group-hover:scale-110 transition-transform duration-200`}>
                    <Icon className={`h-8 w-8 ${task.iconColor}`} />
                  </div>
                  <div className="flex flex-col items-end space-y-1">
                    {getStatusIcon(task.isCompleted, task.urgency)}
                    <span className={`text-xs font-medium ${getStatusColor(task.isCompleted, task.urgency)}`}>
                      {task.frequency}
                    </span>
                  </div>
                </div>
                <h3 className="text-xl font-bold text-slate-900 group-hover:text-slate-700 transition-colors mb-2">
                  {task.title}
                </h3>
                <p className="text-slate-600 leading-relaxed">{task.description}</p>
              </div>
              <div className="p-4">
                <div className="flex items-center justify-between">
                  <span className={`text-sm font-medium ${getStatusColor(task.isCompleted, task.urgency)}`}>
                    {getStatusText(task.isCompleted, task.frequency)}
                  </span>
                  <div className={`w-8 h-8 ${task.color} rounded-full flex items-center justify-center group-hover:scale-110 transition-transform duration-200`}>
                    <Icon className="h-4 w-4 text-white" />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Weekly Reminder */}
      <div className="bg-gradient-to-r from-slate-50 to-blue-50 rounded-2xl p-6 border border-slate-200">
        <div className="text-center">
          <Calendar className="h-8 w-8 text-blue-600 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-slate-900 mb-2">Weekly Reminder</h3>
          <p className="text-slate-600 text-sm">
            Submit your HAVs records by Monday 10:00 AM following the week ending.
            Daily vehicle checks must be completed each working day.
          </p>
        </div>
      </div>
    </div>
  );
};
