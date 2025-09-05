import React, { useState, useEffect } from 'react';
import { CheckCircle, X, User, Calendar, Download, RefreshCw, HardHat } from 'lucide-react';
import { supabase, Employee, HavsTimesheet } from '../../../lib/supabase';

interface HavsComplianceTableProps {
  employees: Employee[];
}

interface WeekData {
  weekEnding: string;
  employees: EmployeeWeekData[];
}

interface EmployeeWeekData {
  employee: Employee;
  havsTimesheet: HavsTimesheet | null;
  hasSubmitted: boolean;
}

export const HavsComplianceTable: React.FC<HavsComplianceTableProps> = ({
  employees,
}) => {
  const [weekData, setWeekData] = useState<WeekData[]>([]);
  const [havsTimesheets, setHavsTimesheets] = useState<HavsTimesheet[]>([]);
  const [selectedWeek, setSelectedWeek] = useState<string>('');
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadHavsTimesheets();
  }, []);

  useEffect(() => {
    if (havsTimesheets.length > 0) {
      generateWeekData();
    }
  }, [havsTimesheets, employees]);

  const loadHavsTimesheets = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('havs_timesheets')
        .select(`
          *,
          employee:employees(*)
        `)
        .order('week_ending', { ascending: false });

      if (error) throw error;
      setHavsTimesheets(data || []);
    } catch (error) {
      console.error('Error loading HAVs timesheets:', error);
    } finally {
      setLoading(false);
    }
  };

  const generateWeekData = () => {
    const weeks: WeekData[] = [];
    const today = new Date();
    
    // Generate 8 weeks of data (2 months)
    for (let weekOffset = 0; weekOffset < 8; weekOffset++) {
      // Calculate the Sunday (week ending) for this week
      const currentWeekSunday = new Date(today);
      const daysUntilSunday = (7 - today.getDay()) % 7;
      currentWeekSunday.setDate(today.getDate() + daysUntilSunday - (7 * weekOffset));
      currentWeekSunday.setHours(23, 59, 59, 999);
      
      const weekEnding = currentWeekSunday.toISOString().split('T')[0];
      
      const employeeWeekData: EmployeeWeekData[] = employees.map(employee => {
        // Find HAVs timesheet for this employee and week
        const havsTimesheet = havsTimesheets.find(timesheet => 
          timesheet.employee_id === employee.id && 
          timesheet.week_ending === weekEnding
        );
        
        return {
          employee,
          havsTimesheet: havsTimesheet || null,
          hasSubmitted: havsTimesheet?.status === 'submitted' || false
        };
      });
      
      weeks.push({
        weekEnding,
        employees: employeeWeekData
      });
    }
    
    setWeekData(weeks);
    if (!selectedWeek && weeks.length > 0) {
      setSelectedWeek(weeks[0].weekEnding);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadHavsTimesheets();
    setRefreshing(false);
  };

  const exportWeekToCSV = () => {
    const selectedWeekData = weekData.find(w => w.weekEnding === selectedWeek);
    if (!selectedWeekData) return;

    const headers = ['Employee', 'Role', 'HAVs Timesheet Status', 'Total Exposure (min)', 'Submitted Date'];
    const rows = selectedWeekData.employees.map(empData => {
      return [
        empData.employee.full_name,
        empData.employee.role,
        empData.hasSubmitted ? 'SUBMITTED' : 'NOT SUBMITTED',
        empData.havsTimesheet?.total_hours?.toString() || '0',
        empData.havsTimesheet?.submitted_at 
          ? new Date(empData.havsTimesheet.submitted_at).toLocaleDateString('en-GB')
          : 'Not submitted'
      ];
    });

    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `havs-compliance-week-${selectedWeek}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const selectedWeekData = weekData.find(w => w.weekEnding === selectedWeek);

  // Calculate stats for selected week
  const weekStats = selectedWeekData ? {
    totalEmployees: selectedWeekData.employees.length,
    submittedCount: selectedWeekData.employees.filter(emp => emp.hasSubmitted).length,
    pendingCount: selectedWeekData.employees.filter(emp => !emp.hasSubmitted).length,
    totalExposure: selectedWeekData.employees.reduce((sum, emp) => 
      sum + (emp.havsTimesheet?.total_hours || 0), 0
    )
  } : { totalEmployees: 0, submittedCount: 0, pendingCount: 0, totalExposure: 0 };

  const complianceRate = weekStats.totalEmployees > 0 
    ? Math.round((weekStats.submittedCount / weekStats.totalEmployees) * 100)
    : 0;

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-8 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600 mx-auto"></div>
        <p className="mt-2 text-slate-600">Loading HAVs compliance data...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-orange-50 to-red-50 rounded-xl p-6 border border-orange-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="p-3 bg-orange-100 rounded-xl">
              <HardHat className="h-8 w-8 text-orange-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">HAVs Timesheet Compliance</h1>
              <p className="text-orange-700 font-medium">Hand Arm Vibration Syndrome Weekly Tracking</p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold text-orange-600">
              {new Date().getDate()}
            </div>
            <div className="text-sm text-orange-600">
              {new Date().toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}
            </div>
          </div>
        </div>
      </div>

      {/* Controls and Stats */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Weekly HAVs Compliance Overview</h2>
            <p className="text-slate-600">Monitor employee HAVs timesheet submissions</p>
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center space-x-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 disabled:bg-orange-400 text-white rounded-lg transition-colors"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              <span>{refreshing ? 'Refreshing...' : 'Refresh'}</span>
            </button>
          </div>
        </div>

        {/* Week Selection */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-slate-700 mb-2">Select Week Ending</label>
          <select
            value={selectedWeek}
            onChange={(e) => setSelectedWeek(e.target.value)}
            className="w-full md:w-auto px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
          >
            {weekData.map((week) => (
              <option key={week.weekEnding} value={week.weekEnding}>
                Week Ending: {new Date(week.weekEnding).toLocaleDateString('en-GB', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric'
                })}
              </option>
            ))}
          </select>
        </div>

        {/* Week Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-orange-50 rounded-lg p-4 border border-orange-200">
            <div className="text-2xl font-bold text-orange-700">{weekStats.submittedCount}</div>
            <div className="text-sm text-orange-600">Submitted</div>
          </div>
          <div className="bg-green-50 rounded-lg p-4 border border-green-200">
            <div className="text-2xl font-bold text-green-700">{complianceRate}%</div>
            <div className="text-sm text-green-600">Compliance Rate</div>
          </div>
          <div className="bg-red-50 rounded-lg p-4 border border-red-200">
            <div className="text-2xl font-bold text-red-700">{weekStats.pendingCount}</div>
            <div className="text-sm text-red-600">Pending</div>
          </div>
          <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
            <div className="text-2xl font-bold text-blue-700">{weekStats.totalExposure}</div>
            <div className="text-sm text-blue-600">Total Minutes</div>
          </div>
        </div>

        {/* Export Button */}
        <div className="mb-6">
          <button
            onClick={exportWeekToCSV}
            disabled={!selectedWeek}
            className="flex items-center space-x-2 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white rounded-lg transition-colors"
          >
            <Download className="h-4 w-4" />
            <span>Export Week Summary</span>
          </button>
        </div>
      </div>

      {/* Compliance Table */}
      {selectedWeekData && (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-200">
            <h3 className="text-lg font-semibold text-slate-900">
              Week Ending: {new Date(selectedWeek).toLocaleDateString('en-GB', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                year: 'numeric'
              })}
            </h3>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider sticky left-0 bg-slate-50">
                    Employee
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">HAVs Status</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">Total Exposure (min)</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">Submitted Date</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-200">
                {selectedWeekData.employees.map((empData) => (
                  <tr key={empData.employee.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4 whitespace-nowrap sticky left-0 bg-white">
                      <div className="flex items-center space-x-3">
                        <div className="p-2 bg-blue-100 rounded-lg">
                          <User className="h-4 w-4 text-blue-600" />
                        </div>
                        <div>
                          <div className="text-sm font-medium text-slate-900">
                            {empData.employee.full_name}
                          </div>
                          <div className="text-xs text-slate-500">
                            {empData.employee.role}
                          </div>
                        </div>
                      </div>
                    </td>
                    
                    {/* HAVs Status */}
                    <td className="px-4 py-4 text-center">
                      <div className="flex flex-col items-center space-y-1">
                        {empData.hasSubmitted ? (
                          <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
                            <CheckCircle className="h-5 w-5 text-green-600" />
                          </div>
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center">
                            <X className="h-5 w-5 text-red-600" />
                          </div>
                        )}
                      </div>
                    </td>
                    
                    {/* Total Exposure */}
                    <td className="px-4 py-4 text-center">
                      <div className="text-sm font-medium text-slate-900">
                        {empData.havsTimesheet?.total_hours || 0} min
                      </div>
                      {empData.havsTimesheet?.total_hours && empData.havsTimesheet.total_hours > 0 && (
                        <div className="text-xs text-slate-500">
                          ({(empData.havsTimesheet.total_hours / 60).toFixed(1)}h)
                        </div>
                      )}
                    </td>
                    
                    {/* Submitted Date */}
                    <td className="px-4 py-4 text-center">
                      <div className="text-sm text-slate-900">
                        {empData.havsTimesheet?.submitted_at 
                          ? new Date(empData.havsTimesheet.submitted_at).toLocaleDateString('en-GB')
                          : '-'
                        }
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Legend</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex items-center space-x-2">
            <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle className="h-4 w-4 text-green-600" />
            </div>
            <span className="text-sm text-slate-700">HAVs timesheet submitted</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-6 h-6 rounded-full bg-red-100 flex items-center justify-center">
              <X className="h-4 w-4 text-red-600" />
            </div>
            <span className="text-sm text-slate-700">HAVs timesheet not submitted</span>
          </div>
        </div>
      </div>
    </div>
  );
};