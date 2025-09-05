import React, { useState, useEffect } from 'react';
import { ClipboardList, Clock, HardHat, CheckCircle, X, Calendar, AlertTriangle, User } from 'lucide-react';
import { supabase, Employee } from '../../../lib/supabase';

interface EmployeeLandingProps {
  onTaskSelect: (task: 'inspection' | 'timesheet' | 'havs') => void;
  selectedEmployee: Employee;
}

interface ComplianceStatus {
  todayVehicleCheck: boolean;
  currentWeekTimesheet: boolean;
  currentWeekHavs: boolean;
  loading: boolean;
}

export const EmployeeLanding: React.FC<EmployeeLandingProps> = ({ 
  onTaskSelect, 
  selectedEmployee 
}) => {
  const [compliance, setCompliance] = useState<ComplianceStatus>({
    todayVehicleCheck: false,
    currentWeekTimesheet: false,
    currentWeekHavs: false,
    loading: true,
  });

  useEffect(() => {
    checkComplianceStatus();
  }, [selectedEmployee.id]);

  const checkComplianceStatus = async () => {
    try {
      setCompliance(prev => ({ ...prev, loading: true }));

      // Get today's date
      const today = new Date();
      const todayStr = today.toISOString().split('T')[0];

      // Get current week ending (next Sunday)
      const currentSunday = new Date(today);
      const daysUntilSunday = (7 - today.getDay()) % 7;
      currentSunday.setDate(today.getDate() + daysUntilSunday);
      const weekEndingStr = currentSunday.toISOString().split('T')[0];

      // Check today's vehicle inspection
      const { data: todayInspection } = await supabase
        .from('vehicle_inspections')
        .select('id')
        .eq('employee_id', selectedEmployee.id)
        .gte('submitted_at', `${todayStr}T00:00:00`)
        .lte('submitted_at', `${todayStr}T23:59:59`)
        .maybeSingle();

      // Check current week timesheet
      const { data: weekTimesheet } = await supabase
        .from('new_timesheets')
        .select('id')
        .eq('employee_id', selectedEmployee.id)
        .eq('week_ending', weekEndingStr)
        .eq('status', 'submitted')
        .maybeSingle();

      // Check current week HAVs timesheet
      const { data: weekHavs } = await supabase
        .from('havs_timesheets')
        .select('id')
        .eq('employee_id', selectedEmployee.id)
        .eq('week_ending', weekEndingStr)
        .eq('status', 'submitted')
        .maybeSingle();

      setCompliance({
        todayVehicleCheck: !!todayInspection,
        currentWeekTimesheet: !!weekTimesheet,
        currentWeekHavs: !!weekHavs,
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
      urgency: 'high' // Daily tasks are high priority
    },
    {
      id: 'timesheet' as const,
      title: 'Weekly Timesheet',
      description: 'Record your working hours, price work and day rates',
      icon: Clock,
      color: 'bg-green-600',
      lightColor: 'bg-green-50',
      iconColor: 'text-green-600',
      borderColor: 'border-green-200',
      hoverColor: 'hover:border-green-400',
      frequency: 'Weekly',
      isCompleted: compliance.currentWeekTimesheet,
      urgency: 'medium'
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
    
    if (isCompleted) {
      return <CheckCircle className="h-5 w-5 text-green-600" />;
    }
    
    if (urgency === 'high') {
      return <AlertTriangle className="h-5 w-5 text-red-600" />;
    }
    
    return <X className="h-5 w-5 text-amber-600" />;
  };

  const getStatusText = (isCompleted: boolean, frequency: string) => {
    if (compliance.loading) return 'Checking...';
    if (isCompleted) return `${frequency} - Complete`;
    return `${frequency} - Pending`;
  };

  const getStatusColor = (isCompleted: boolean, urgency: string) => {
    if (compliance.loading) return 'text-slate-500';
    if (isCompleted) return 'text-green-600';
    if (urgency === 'high') return 'text-red-600';
    return 'text-amber-600';
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

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
            {!compliance.todayVehicleCheck && (
              <button
                onClick={() => onTaskSelect('inspection')}
                className="flex items-center space-x-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg transition-colors text-sm font-medium"
              >
                <AlertTriangle className="h-4 w-4" />
                <span>Complete Daily Check</span>
              </button>
            )}
            {!compliance.currentWeekTimesheet && (
              <button
                onClick={() => onTaskSelect('timesheet')}
                className="flex items-center space-x-2 bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-lg transition-colors text-sm font-medium"
              >
                <Clock className="h-4 w-4" />
                <span>Submit Timesheet</span>
              </button>
            )}
            {!compliance.currentWeekHavs && (
              <button
                onClick={() => onTaskSelect('havs')}
                className="flex items-center space-x-2 bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-lg transition-colors text-sm font-medium"
              >
                <HardHat className="h-4 w-4" />
                <span>Submit HAVs</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Task Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
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
              {/* Header */}
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
                
                <p className="text-slate-600 leading-relaxed">
                  {task.description}
                </p>
              </div>

              {/* Status Footer */}
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
            Submit your timesheet and HAVs records by Monday 10:00 AM following the week ending.
            Daily vehicle checks must be completed each working day.
          </p>
        </div>
      </div>
    </div>
  );
};