import React, { useState, useEffect } from 'react';
import { Download, HardHat, Calendar, Clock, CheckCircle, XCircle, RefreshCw, Eye, Users } from 'lucide-react';
import { supabase, HavsTimesheet, Employee } from '../../../lib/supabase';

interface HavsTimesheetsTableProps {
  employees: Employee[];
}

export const HavsTimesheetsTable: React.FC<HavsTimesheetsTableProps> = ({
  employees,
}) => {
  const [timesheets, setTimesheets] = useState<HavsTimesheet[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedTimesheet, setSelectedTimesheet] = useState<HavsTimesheet | null>(null);
  const [filterWeek, setFilterWeek] = useState('');
  const [filterEmployee, setFilterEmployee] = useState('');

  useEffect(() => {
    loadTimesheets();
  }, []);

  const loadTimesheets = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('havs_timesheets')
        .select(`
          *,
          employee:employees(*),
          havs_entries:havs_timesheet_entries(*)
        `)
        .order('week_ending', { ascending: false });

      if (error) throw error;
      setTimesheets(data || []);
    } catch (error) {
      console.error('Error loading HAVs timesheets:', error);
    } finally {
      setLoading(false);
    }
  };

  const refreshData = async () => {
    setRefreshing(true);
    await loadTimesheets();
    setRefreshing(false);
  };

  const exportToCSV = () => {
    let filteredTimesheets = timesheets;
    
    if (filterWeek) {
      filteredTimesheets = filteredTimesheets.filter(t => t.week_ending === filterWeek);
    }
    
    if (filterEmployee) {
      filteredTimesheets = filteredTimesheets.filter(t => 
        t.employee_name.toLowerCase().includes(filterEmployee.toLowerCase())
      );
    }

    const headers = [
      'Week Ending', 'Employee Name', 'Employee No', 'Status', 'Total Hours (minutes)',
      'Comments', 'Actions', 'Supervisor', 'Submitted Date'
    ];
    
    const rows = filteredTimesheets.map(timesheet => [
      new Date(timesheet.week_ending).toLocaleDateString('en-GB'),
      timesheet.employee_name,
      timesheet.employee_no || '',
      timesheet.status,
      `${timesheet.total_hours} min`,
      timesheet.comments || '',
      timesheet.actions || '',
      timesheet.supervisor_name || '',
      timesheet.submitted_at ? new Date(timesheet.submitted_at).toLocaleDateString('en-GB') : 'Not submitted'
    ]);

    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `havs-timesheets-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const exportDetailedCSV = (timesheet: HavsTimesheet) => {
    const headers = [
      'Employee Name', 'Employee No', 'Week Ending', 'Equipment Category', 'Equipment Name',
      'Monday (min)', 'Tuesday (min)', 'Wednesday (min)', 'Thursday (min)', 'Friday (min)', 'Saturday (min)', 'Sunday (min)', 'Total (min)'
    ];

    const rows: string[][] = [];

    if (timesheet.havs_entries && timesheet.havs_entries.length > 0) {
      timesheet.havs_entries.forEach(entry => {
        rows.push([
          timesheet.employee_name,
          timesheet.employee_no || '',
          new Date(timesheet.week_ending).toLocaleDateString('en-GB'),
          entry.equipment_category,
          entry.equipment_name,
          entry.monday_hours.toString(),
          entry.tuesday_hours.toString(),
          entry.wednesday_hours.toString(),
          entry.thursday_hours.toString(),
          entry.friday_hours.toString(),
          entry.saturday_hours.toString(),
          entry.sunday_hours.toString(),
          entry.total_hours.toString()
        ]);
      });
    }

    // Add summary row
    rows.push([
      '',
      '',
      '',
      '',
      'TOTAL EXPOSURE',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      timesheet.total_hours.toString()
    ]);

    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    
    const employeeName = timesheet.employee_name.replace(/\s+/g, '-');
    const weekEnding = timesheet.week_ending;
    
    a.download = `HAVs-${employeeName}-Week-${weekEnding}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  // Filter timesheets
  const filteredTimesheets = timesheets.filter(timesheet => {
    const matchesWeek = !filterWeek || timesheet.week_ending === filterWeek;
    const matchesEmployee = !filterEmployee || 
      timesheet.employee_name.toLowerCase().includes(filterEmployee.toLowerCase());
    
    return matchesWeek && matchesEmployee;
  });

  // Get unique weeks for filter
  const uniqueWeeks = [...new Set(timesheets.map(t => t.week_ending))].sort().reverse();

  // Calculate stats
  const totalTimesheets = filteredTimesheets.length;
  const submittedTimesheets = filteredTimesheets.filter(t => t.status === 'submitted').length;
  const draftTimesheets = filteredTimesheets.filter(t => t.status === 'draft').length;
  const totalExposureHours = filteredTimesheets.reduce((sum, t) => sum + t.total_hours, 0);

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-8 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600 mx-auto"></div>
        <p className="mt-2 text-slate-600">Loading HAVs timesheets...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Stats */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <div className="p-3 bg-orange-100 rounded-lg">
              <HardHat className="h-6 w-6 text-orange-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">HAVs Timesheets</h1>
              <p className="text-slate-600">Hand Arm Vibration Syndrome Exposure Records</p>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={refreshData}
              disabled={refreshing}
              className="flex items-center space-x-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 disabled:bg-slate-50 rounded-lg transition-colors"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              <span>{refreshing ? 'Refreshing...' : 'Refresh'}</span>
            </button>
            <button
              onClick={exportToCSV}
              className="flex items-center space-x-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg transition-colors"
            >
              <Download className="h-4 w-4" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
            <div className="text-2xl font-bold text-blue-700">{totalTimesheets}</div>
            <div className="text-sm text-blue-600">Total Timesheets</div>
          </div>
          <div className="bg-green-50 rounded-lg p-4 border border-green-200">
            <div className="text-2xl font-bold text-green-700">{submittedTimesheets}</div>
            <div className="text-sm text-green-600">Submitted</div>
          </div>
          <div className="bg-amber-50 rounded-lg p-4 border border-amber-200">
            <div className="text-2xl font-bold text-amber-700">{draftTimesheets}</div>
            <div className="text-sm text-amber-600">Draft</div>
          </div>
          <div className="bg-orange-50 rounded-lg p-4 border border-orange-200">
            <div className="text-2xl font-bold text-orange-700">{totalExposureHours}</div>
            <div className="text-sm text-orange-600">Total Minutes</div>
          </div>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Filter by Week</label>
            <select
              value={filterWeek}
              onChange={(e) => setFilterWeek(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
            >
              <option value="">All Weeks</option>
              {uniqueWeeks.map(week => (
                <option key={week} value={week}>
                  Week Ending: {new Date(week).toLocaleDateString('en-GB')}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Filter by Employee</label>
            <input
              type="text"
              value={filterEmployee}
              onChange={(e) => setFilterEmployee(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              placeholder="Search employee name..."
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={() => {
                setFilterWeek('');
                setFilterEmployee('');
              }}
              className="w-full px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors"
            >
              Clear Filters
            </button>
          </div>
        </div>
      </div>

      {/* Timesheets Table */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-200">
          <h3 className="text-lg font-semibold text-slate-900">
            HAVs Timesheets ({filteredTimesheets.length})
          </h3>
        </div>

        {filteredTimesheets.length === 0 ? (
          <div className="p-8 text-center">
            <HardHat className="h-12 w-12 text-slate-400 mx-auto mb-4" />
            <p className="text-slate-600">No HAVs timesheets found matching your criteria.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Employee
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Week Ending
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Total Exposure
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Supervisor
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-200">
                {filteredTimesheets.map((timesheet) => (
                  <tr key={timesheet.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center space-x-3">
                        <div className="p-2 bg-orange-100 rounded-lg">
                          <Users className="h-4 w-4 text-orange-600" />
                        </div>
                        <div>
                          <div className="text-sm font-medium text-slate-900">
                            {timesheet.employee_name}
                          </div>
                          <div className="text-xs text-slate-500">
                            No: {timesheet.employee_no}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center space-x-2">
                        <Calendar className="h-4 w-4 text-slate-400" />
                        <div>
                          <div className="text-sm text-slate-900">
                            {new Date(timesheet.week_ending).toLocaleDateString('en-GB')}
                          </div>
                          <div className="text-xs text-slate-500">
                            {new Date(timesheet.week_ending).toLocaleDateString('en-GB', { weekday: 'long' })}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center space-x-2">
                        {timesheet.status === 'submitted' ? (
                          <>
                            <CheckCircle className="h-4 w-4 text-green-600" />
                            <span className="text-sm font-medium text-green-700">Submitted</span>
                          </>
                        ) : (
                          <>
                            <XCircle className="h-4 w-4 text-amber-600" />
                            <span className="text-sm font-medium text-amber-700">Draft</span>
                          </>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center space-x-2">
                        <Clock className="h-4 w-4 text-slate-400" />
                        <div>
                          <div className="text-sm font-medium text-slate-900">
                            {timesheet.total_hours} min
                          </div>
                          {timesheet.total_hours > 0 && (
                            <div className="text-xs text-slate-500">
                              {(timesheet.total_hours / 60).toFixed(1)} hours
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">
                      {timesheet.supervisor_name || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex space-x-2">
                        <button
                          onClick={() => setSelectedTimesheet(timesheet)}
                          className="text-blue-600 hover:text-blue-900 transition-colors"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => exportDetailedCSV(timesheet)}
                          className="text-green-600 hover:text-green-900 transition-colors"
                        >
                          <Download className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Timesheet Details Modal */}
      {selectedTimesheet && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-6xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-semibold text-slate-900">HAVs Timesheet Details</h3>
                <button
                  onClick={() => setSelectedTimesheet(null)}
                  className="text-slate-400 hover:text-slate-600 transition-colors"
                >
                  ✕
                </button>
              </div>

              {/* Header Info */}
              <div className="bg-slate-50 rounded-xl p-6 mb-6">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div>
                    <div className="text-sm font-medium text-slate-500">Employee</div>
                    <div className="text-lg font-semibold text-slate-900">
                      {selectedTimesheet.employee_name}
                    </div>
                    <div className="text-sm text-slate-600">
                      No: {selectedTimesheet.employee_no}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-slate-500">Week Ending</div>
                    <div className="text-lg font-semibold text-slate-900">
                      {new Date(selectedTimesheet.week_ending).toLocaleDateString('en-GB')}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-slate-500">Status</div>
                    <div className={`text-lg font-semibold ${
                      selectedTimesheet.status === 'submitted' ? 'text-green-600' : 'text-amber-600'
                    }`}>
                      {selectedTimesheet.status === 'submitted' ? 'Submitted' : 'Draft'}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-slate-500">Total Exposure</div>
                    <div className="text-lg font-semibold text-orange-600">
                      {selectedTimesheet.total_hours} min
                    </div>
                    {selectedTimesheet.total_hours > 0 && (
                      <div className="text-sm text-slate-600">
                        ({(selectedTimesheet.total_hours / 60).toFixed(1)} hours)
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Equipment Details */}
              {selectedTimesheet.havs_entries && selectedTimesheet.havs_entries.length > 0 && (
                <div className="bg-white border border-slate-200 rounded-xl p-6 mb-6">
                  <h4 className="text-lg font-semibold text-slate-900 mb-4">Equipment Usage Details</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full border border-slate-300">
                      <thead className="bg-slate-100">
                        <tr>
                          <th className="border border-slate-300 px-3 py-2 text-left text-xs font-medium text-slate-700">Equipment</th>
                          <th className="border border-slate-300 px-3 py-2 text-center text-xs font-medium text-slate-700">Mon</th>
                          <th className="border border-slate-300 px-3 py-2 text-center text-xs font-medium text-slate-700">Tue</th>
                          <th className="border border-slate-300 px-3 py-2 text-center text-xs font-medium text-slate-700">Wed</th>
                          <th className="border border-slate-300 px-3 py-2 text-center text-xs font-medium text-slate-700">Thu</th>
                          <th className="border border-slate-300 px-3 py-2 text-center text-xs font-medium text-slate-700">Fri</th>
                          <th className="border border-slate-300 px-3 py-2 text-center text-xs font-medium text-slate-700">Sat</th>
                          <th className="border border-slate-300 px-3 py-2 text-center text-xs font-medium text-slate-700">Sun</th>
                          <th className="border border-slate-300 px-3 py-2 text-center text-xs font-medium text-slate-700 bg-blue-50">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedTimesheet.havs_entries
                          .filter(entry => entry.total_hours > 0)
                          .map((entry) => (
                            <tr key={entry.id} className="hover:bg-slate-50">
                              <td className="border border-slate-300 px-3 py-2 text-sm">
                                <div className="font-medium">{entry.equipment_name}</div>
                                <div className="text-xs text-slate-500">{entry.equipment_category}</div>
                              </td>
                              <td className="border border-slate-300 px-3 py-2 text-center text-sm">{entry.monday_hours}</td>
                              <td className="border border-slate-300 px-3 py-2 text-center text-sm">{entry.tuesday_hours}</td>
                              <td className="border border-slate-300 px-3 py-2 text-center text-sm">{entry.wednesday_hours}</td>
                              <td className="border border-slate-300 px-3 py-2 text-center text-sm">{entry.thursday_hours}</td>
                              <td className="border border-slate-300 px-3 py-2 text-center text-sm">{entry.friday_hours}</td>
                              <td className="border border-slate-300 px-3 py-2 text-center text-sm">{entry.saturday_hours}</td>
                              <td className="border border-slate-300 px-3 py-2 text-center text-sm">{entry.sunday_hours}</td>
                              <td className="border border-slate-300 px-3 py-2 text-center text-sm font-bold text-blue-700 bg-blue-50">
                                {entry.total_hours}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Comments and Actions */}
              {(selectedTimesheet.comments || selectedTimesheet.actions) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                  {selectedTimesheet.comments && (
                    <div>
                      <div className="text-sm font-medium text-slate-500 mb-2">Comments</div>
                      <div className="bg-slate-50 rounded-lg p-3 text-sm text-slate-900">
                        {selectedTimesheet.comments}
                      </div>
                    </div>
                  )}
                  {selectedTimesheet.actions && (
                    <div>
                      <div className="text-sm font-medium text-slate-500 mb-2">Actions</div>
                      <div className="bg-slate-50 rounded-lg p-3 text-sm text-slate-900">
                        {selectedTimesheet.actions}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Download Button */}
              <div className="text-center">
                <button
                  onClick={() => exportDetailedCSV(selectedTimesheet)}
                  className="bg-orange-600 hover:bg-orange-700 text-white px-6 py-3 rounded-lg transition-colors flex items-center space-x-2 mx-auto"
                >
                  <Download className="h-4 w-4" />
                  <span>Download Detailed CSV</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};