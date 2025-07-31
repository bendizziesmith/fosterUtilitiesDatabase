import React, { useState } from 'react';
import { CheckCircle, XCircle, Users, Clock, FileText, ChevronDown, ChevronRight } from 'lucide-react';
import { Timesheet, Employee } from '../../../lib/supabase';

interface TimesheetComplianceChartProps {
  timesheets: Timesheet[];
  employees: Employee[];
}

export const TimesheetComplianceChart: React.FC<TimesheetComplianceChartProps> = ({
  timesheets,
  employees,
}) => {
  const [showDetails, setShowDetails] = useState(false);

  // Get current Monday at 10am (deadline)
  const getCurrentMondayDeadline = (): Date => {
    const now = new Date();
    const currentDay = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
    
    // Calculate days since Monday (0 if today is Monday)
    const daysSinceMonday = currentDay === 0 ? 6 : currentDay - 1;
    
    // Get this Monday
    const monday = new Date(now);
    monday.setDate(now.getDate() - daysSinceMonday);
    monday.setHours(10, 0, 0, 0); // 10:00 AM
    
    return monday;
  };

  // Get the week ending date for current deadline (Sunday before Monday)
  const getCurrentWeekEnding = (): string => {
    const mondayDeadline = getCurrentMondayDeadline();
    const weekEnding = new Date(mondayDeadline);
    weekEnding.setDate(mondayDeadline.getDate() - 1); // Sunday before Monday
    return weekEnding.toISOString().split('T')[0];
  };

  const currentWeekEnding = getCurrentWeekEnding();
  const mondayDeadline = getCurrentMondayDeadline();
  const now = new Date();
  const isAfterDeadline = now > mondayDeadline;

  // Get all timesheets for current week ending
  const currentWeekTimesheets = timesheets.filter(timesheet => {
    if (timesheet.week_ending !== currentWeekEnding) return false;
    if (!timesheet.submitted_at) return false;
    return true;
  });

  // Separate on-time vs late submissions
  const onTimeSubmissions = currentWeekTimesheets.filter(timesheet => {
    const submittedAt = new Date(timesheet.submitted_at!);
    return submittedAt <= mondayDeadline;
  });

  const lateSubmissions = currentWeekTimesheets.filter(timesheet => {
    const submittedAt = new Date(timesheet.submitted_at!);
    return submittedAt > mondayDeadline;
  });

  // Get unique employees who submitted (on time)
  const employeesWithOnTimeTimesheets = new Set(
    onTimeSubmissions
      .filter(timesheet => timesheet.employee_id)
      .map(timesheet => timesheet.employee_id)
  );

  // Get unique employees who submitted late
  const employeesWithLateTimesheets = new Set(
    lateSubmissions
      .filter(timesheet => timesheet.employee_id)
      .map(timesheet => timesheet.employee_id)
  );

  const onTimeCount = employeesWithOnTimeTimesheets.size;
  const lateCount = employeesWithLateTimesheets.size;
  const submittedCount = onTimeCount + lateCount;
  const totalEmployees = employees.length;
  const pendingCount = totalEmployees - submittedCount;
  
  const onTimePercentage = totalEmployees > 0 ? (onTimeCount / totalEmployees) * 100 : 0;
  const latePercentage = totalEmployees > 0 ? (lateCount / totalEmployees) * 100 : 0;
  const pendingPercentage = totalEmployees > 0 ? (pendingCount / totalEmployees) * 100 : 0;

  // Simple pie chart using CSS
  const circumference = 2 * Math.PI * 30; // smaller radius = 30
  const onTimeStroke = (onTimePercentage / 100) * circumference;
  const lateStroke = (latePercentage / 100) * circumference;
  const pendingStroke = (pendingPercentage / 100) * circumference;

  // Get employees who haven't submitted timesheets
  const employeesWithoutTimesheets = employees.filter(
    employee => !employeesWithOnTimeTimesheets.has(employee.id) && !employeesWithLateTimesheets.has(employee.id)
  );

  // Get employees who submitted late
  const employeesWithLateSubmissions = employees.filter(
    employee => employeesWithLateTimesheets.has(employee.id)
  );

  // Format deadline display
  const formatDeadline = () => {
    return mondayDeadline.toLocaleDateString('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    }) + ' at 10:00 AM';
  };

  // Format week ending display
  const formatWeekEnding = () => {
    return new Date(currentWeekEnding).toLocaleDateString('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <FileText className="h-5 w-5 text-green-600" />
          <h3 className="text-xl font-bold text-slate-900">Weekly Timesheet Compliance</h3>
        </div>
        <div className="flex items-center space-x-3">
          <div className="text-right">
            <div className="text-sm text-slate-600">
              Week Ending: {formatWeekEnding()}
            </div>
            <div className={`text-xs ${isAfterDeadline ? 'text-red-600' : 'text-amber-600'}`}>
              Deadline: {formatDeadline()}
            </div>
          </div>
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="flex items-center space-x-1 text-sm text-blue-600 hover:text-blue-700 transition-colors"
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

      <div className="flex items-center space-x-6">
        {/* Compact Pie Chart */}
        <div className="flex flex-col items-center">
          <div className="relative w-24 h-24 mb-3">
            <svg className="w-24 h-24 transform -rotate-90" viewBox="0 0 80 80">
              {/* On-time section (green) */}
              {onTimeCount > 0 && (
                <circle
                  cx="40"
                  cy="40"
                  r="32"
                  fill="none"
                  stroke="#10b981"
                  strokeWidth="10"
                  strokeDasharray={`${onTimeStroke} ${circumference}`}
                  strokeDashoffset="0"
                  className="transition-all duration-500"
                />
              )}
              
              {/* Late section (amber) */}
              {lateCount > 0 && (
                <circle
                  cx="40"
                  cy="40"
                  r="32"
                  fill="none"
                  stroke="#f59e0b"
                  strokeWidth="10"
                  strokeDasharray={`${lateStroke} ${circumference}`}
                  strokeDashoffset={`-${onTimeStroke}`}
                  className="transition-all duration-500"
                />
              )}
              
              {/* Pending section (red) */}
              {pendingCount > 0 && (
                <circle
                  cx="40"
                  cy="40"
                  r="32"
                  fill="none"
                  stroke="#ef4444"
                  strokeWidth="10"
                  strokeDasharray={`${pendingStroke} ${circumference}`}
                  strokeDashoffset={`-${onTimeStroke + lateStroke}`}
                  className="transition-all duration-500"
                />
              )}
            </svg>
            
            {/* Center text */}
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <div className="text-xl font-bold text-slate-900">{submittedCount}</div>
              <div className="text-sm text-slate-500">of {totalEmployees}</div>
            </div>
          </div>

          {/* Compact Legend */}
          <div className="space-y-2 text-center">
            <div className="flex items-center space-x-2 text-sm">
              <div className="w-3 h-3 bg-green-500 rounded-full"></div>
              <span className="text-slate-700 font-medium">On Time ({onTimePercentage.toFixed(0)}%)</span>
            </div>
            {lateCount > 0 && (
              <div className="flex items-center space-x-2 text-sm">
                <div className="w-3 h-3 bg-amber-500 rounded-full"></div>
                <span className="text-slate-700 font-medium">Late ({latePercentage.toFixed(0)}%)</span>
              </div>
            )}
            <div className="flex items-center space-x-2 text-sm">
              <div className="w-3 h-3 bg-red-500 rounded-full"></div>
              <span className="text-slate-700 font-medium">Missing ({pendingPercentage.toFixed(0)}%)</span>
            </div>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="flex-1 grid grid-cols-2 gap-4">
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="flex items-center space-x-3">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <div>
                <div className="text-xl font-bold text-green-700">{submittedCount}</div>
                <div className="text-sm text-green-600 font-medium">Submitted</div>
              </div>
            </div>
          </div>
          
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-center space-x-3">
              <XCircle className="h-5 w-5 text-red-600" />
              <div>
                <div className="text-xl font-bold text-red-700">{pendingCount}</div>
                <div className="text-sm text-red-600 font-medium">Missing</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Expandable Details */}
      {showDetails && (
        <div className="mt-4 pt-4 border-t border-slate-200 space-y-3">
          {/* Deadline Status */}
          <div className={`rounded-lg p-3 border ${
            isAfterDeadline 
              ? 'bg-red-50 border-red-200' 
              : 'bg-amber-50 border-amber-200'
          }`}>
            <div className="flex items-center space-x-2">
              <Clock className={`h-4 w-4 ${isAfterDeadline ? 'text-red-600' : 'text-amber-600'}`} />
              <span className={`text-sm font-medium ${
                isAfterDeadline ? 'text-red-800' : 'text-amber-800'
              }`}>
                {isAfterDeadline ? 'Deadline Passed' : 'Deadline Approaching'}
              </span>
            </div>
            <div className={`text-xs mt-1 ${
              isAfterDeadline ? 'text-red-700' : 'text-amber-700'
            }`}>
              Monday 10:00 AM submission deadline
            </div>
          </div>

          {/* Employees without timesheets */}
          {employeesWithoutTimesheets.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <h4 className="text-sm font-semibold text-red-800 mb-2 flex items-center">
                <Users className="h-4 w-4 mr-1" />
                Employees Missing Timesheets:
              </h4>
              <div className="space-y-1 max-h-20 overflow-y-auto">
                {employeesWithoutTimesheets.map((employee) => (
                  <div key={employee.id} className="text-sm text-red-700">
                    • {employee.full_name} ({employee.role})
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* All submitted message */}
          {employeesWithoutTimesheets.length === 0 && totalEmployees > 0 && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <div className="flex items-center space-x-2 text-green-800">
                <CheckCircle className="h-4 w-4" />
                <span className="text-sm font-medium">
                  All employees have submitted their timesheets on time!
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};