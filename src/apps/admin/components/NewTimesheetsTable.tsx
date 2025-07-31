import React, { useState, useEffect } from 'react';
import { Download, User, Calendar, Eye, FileText, DollarSign, RefreshCw, ChevronDown, ChevronRight, Users, Filter, Trash2 } from 'lucide-react';
import { supabase, Timesheet, Employee } from '../../../lib/supabase';

interface NewTimesheetsTableProps {
  employees: Employee[];
}

interface WeeklyTimesheetGroup {
  weekEnding: string;
  teamLeaders: TeamLeaderGroup[];
  totalValue: number;
  totalTimesheets: number;
}

interface TeamLeaderGroup {
  employeeName: string;
  employeeId: string;
  employeeRole: string;
  timesheets: Timesheet[];
  totalValue: number;
  totalTimesheets: number;
}

export const NewTimesheetsTable: React.FC<NewTimesheetsTableProps> = ({
  employees,
}) => {
  const [timesheets, setTimesheets] = useState<Timesheet[]>([]);
  const [weeklyGroups, setWeeklyGroups] = useState<WeeklyTimesheetGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedTimesheet, setSelectedTimesheet] = useState<Timesheet | null>(null);
  const [expandedWeeks, setExpandedWeeks] = useState<Set<string>>(new Set());
  const [expandedTeamLeaders, setExpandedTeamLeaders] = useState<Set<string>>(new Set());
  const [selectedWeekForExport, setSelectedWeekForExport] = useState<string>('');
  const [selectedGangForExport, setSelectedGangForExport] = useState<string>('');
  const [deleteConfirmation, setDeleteConfirmation] = useState<{
    show: boolean;
    timesheet: Timesheet | null;
  }>({ show: false, timesheet: null });
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    loadTimesheets();
  }, []);

  useEffect(() => {
    groupTimesheetsByWeek();
  }, [timesheets]);

  const loadTimesheets = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('new_timesheets')
        .select(`
          *,
          employee:employees(*),
          timesheet_entries(
            *,
            work_rate:work_rates(*),
            ipsom_rate:ipsom_rates(*),
            mollsworth_rate:mollsworth_work_rates(*)
          )
        `)
        .eq('status', 'submitted')
        .order('week_ending', { ascending: false });

      if (error) throw error;
      
      setTimesheets(data || []);
    } catch (error) {
      console.error('Error loading timesheets:', error);
    } finally {
      setLoading(false);
    }
  };

  const groupTimesheetsByWeek = () => {
    const weekGroups: { [key: string]: WeeklyTimesheetGroup } = {};

    timesheets.forEach(timesheet => {
      const weekKey = timesheet.week_ending;
      
      if (!weekGroups[weekKey]) {
        weekGroups[weekKey] = {
          weekEnding: weekKey,
          teamLeaders: [],
          totalValue: 0,
          totalTimesheets: 0
        };
      }

      const employeeName = timesheet.employee?.full_name || timesheet.employee?.name || 'Unknown Employee';
      const employeeId = timesheet.employee_id || '';
      const employeeRole = timesheet.employee?.role || '';
      
      let teamLeader = weekGroups[weekKey].teamLeaders.find(tl => tl.employeeId === employeeId);
      
      if (!teamLeader) {
        teamLeader = {
          employeeName,
          employeeId,
          employeeRole,
          timesheets: [],
          totalValue: 0,
          totalTimesheets: 0
        };
        weekGroups[weekKey].teamLeaders.push(teamLeader);
      }

      teamLeader.timesheets.push(timesheet);
      teamLeader.totalValue += timesheet.total_value;
      teamLeader.totalTimesheets += 1;

      weekGroups[weekKey].totalValue += timesheet.total_value;
      weekGroups[weekKey].totalTimesheets += 1;
    });

    // Sort team leaders by name within each week
    Object.values(weekGroups).forEach(week => {
      week.teamLeaders.sort((a, b) => a.employeeName.localeCompare(b.employeeName));
    });

    const sortedWeeks = Object.values(weekGroups).sort((a, b) => 
      new Date(b.weekEnding).getTime() - new Date(a.weekEnding).getTime()
    );

    setWeeklyGroups(sortedWeeks);
  };

  const refreshTimesheets = async () => {
    setRefreshing(true);
    await loadTimesheets();
    setRefreshing(false);
  };

  const exportToCSV = () => {
    let filteredTimesheets = timesheets;
    
    // Filter by selected week
    if (selectedWeekForExport) {
      filteredTimesheets = filteredTimesheets.filter(t => t.week_ending === selectedWeekForExport);
    }
    
    // Filter by selected gang (team name)
    if (selectedGangForExport) {
      filteredTimesheets = filteredTimesheets.filter(t => 
        t.team_name && t.team_name.toLowerCase().includes(selectedGangForExport.toLowerCase())
      );
    }
    
    const headers = [
      'Week Ending', 'Employee', 'Role', 'Team', 'Job Number', 'Address',
      'Working Days', 'Total Value', 'Work Lines', 'Submitted Date'
    ];
    
    const rows = filteredTimesheets.map(timesheet => {
      // Get working days from timesheet entries
      const workingDays = [];
      if (timesheet.timesheet_entries) {
        const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
        days.forEach(day => {
          const dayKey = day.toLowerCase();
          const hasWork = timesheet.timesheet_entries.some(entry => 
            entry[dayKey as keyof typeof entry] && Number(entry[dayKey as keyof typeof entry]) > 0
          );
          if (hasWork) workingDays.push(day.slice(0, 3));
        });
      }
      
      return [
      new Date(timesheet.week_ending).toLocaleDateString(),
     timesheet.employee?.full_name || timesheet.employee?.name || 'Unknown',
      timesheet.employee?.role || '',
      timesheet.team_name || '',
      timesheet.job_number,
      timesheet.address || '',
      workingDays.join(', ') || 'Not specified',
      timesheet.total_value.toFixed(2),
      timesheet.timesheet_entries?.length || 0,
      new Date(timesheet.submitted_at!).toLocaleDateString(),
      ];
    });

    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    
    // Generate filename based on filters
    let filename = 'timesheets';
    if (selectedWeekForExport) {
      filename += `-week-${selectedWeekForExport}`;
    }
    if (selectedGangForExport) {
      filename += `-gang-${selectedGangForExport.replace(/\s+/g, '-')}`;
    }
    filename += `-${new Date().toISOString().split('T')[0]}.csv`;
    
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const exportIndividualTimesheetCSV = (timesheet: Timesheet) => {
    // Create detailed CSV for individual timesheet
    const headers = [
      'Employee Name',
      'Employee Role', 
      'Job Number',
      'Team Name',
      'Week Ending',
      'Work Item',
      'Column 2',
      'Column 3', 
      'Column 4',
      'Rate (£)',
      'Monday Hours',
      'Tuesday Hours',
      'Wednesday Hours',
      'Thursday Hours',
      'Friday Hours',
      'Saturday Hours',
      'Sunday Hours',
      'Total Hours',
      'Quantity (m)',
      'Line Total (£)',
      'Submitted Date'
    ];

    const rows: string[][] = [];

    // Add timesheet entries
    if (timesheet.timesheet_entries && timesheet.timesheet_entries.length > 0) {
      timesheet.timesheet_entries.forEach(entry => {
        const workItem = entry.work_rate?.work_type || 
                        entry.ipsom_rate?.work_item || 
                        entry.mollsworth_rate?.col1_work_item || 
                        'Unknown';
        
        const col2 = entry.work_rate?.voltage_type || 
                    entry.ipsom_rate?.col2 || 
                    entry.mollsworth_rate?.col2_param || 
                    '-';
        
        const col3 = entry.work_rate?.site_type || 
                    entry.ipsom_rate?.col3 || 
                    entry.mollsworth_rate?.col3_param || 
                    '-';
        
        const col4 = entry.ipsom_rate?.col4 || 
                    entry.mollsworth_rate?.col4_param || 
                    '-';
        
        const rate = entry.work_rate?.rate_value || 
                    entry.ipsom_rate?.rate_gbp || 
                    entry.mollsworth_rate?.rate_gbp || 
                    0;

        rows.push([
          timesheet.employee?.full_name || timesheet.employee?.name || 'Unknown',
          timesheet.employee?.role || '',
          timesheet.job_number,
          timesheet.team_name || '',
          new Date(timesheet.week_ending).toLocaleDateString('en-GB'),
          workItem,
          col2,
          col3,
          col4,
          rate.toFixed(2),
          entry.monday?.toString() || '0',
          entry.tuesday?.toString() || '0',
          entry.wednesday?.toString() || '0',
          entry.thursday?.toString() || '0',
          entry.friday?.toString() || '0',
          entry.saturday?.toString() || '0',
          entry.sunday?.toString() || '0',
          entry.total_hours?.toString() || '0',
          entry.quantity?.toString() || '0',
          entry.line_total.toFixed(2),
          new Date(timesheet.submitted_at!).toLocaleDateString('en-GB')
        ]);
      });
    } else {
      // If no entries, still create a row with basic timesheet info
      rows.push([
        timesheet.employee?.name || 'Unknown',
        timesheet.employee?.role || '',
        timesheet.job_number,
        timesheet.team_name || '',
        new Date(timesheet.week_ending).toLocaleDateString('en-GB'),
        'No work entries',
        '-',
        '-',
        '-',
        '0.00',
        '0',
        '0',
        '0',
        '0',
        '0',
        '0',
        '0',
        '0',
        '0',
        timesheet.total_value.toFixed(2),
        new Date(timesheet.submitted_at!).toLocaleDateString('en-GB')
      ]);
    }

    // Add summary row
    rows.push([
      '',
      '',
      '',
      '',
      '',
      'TOTAL',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      timesheet.total_value.toFixed(2),
      ''
    ]);

    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    
    // Generate filename: employee-name_job-number_week-ending_date.csv
    const employeeName = (timesheet.employee?.name || 'Unknown').replace(/\s+/g, '-');
    const jobNumber = timesheet.job_number.replace(/\s+/g, '-');
    const weekEnding = timesheet.week_ending;
    const today = new Date().toISOString().split('T')[0];
    
    a.download = `${employeeName}_Job-${jobNumber}_Week-${weekEnding}_${today}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const exportWeeklyEmployeeCSV = (teamLeader: TeamLeaderGroup) => {
    // Create comprehensive CSV for all jobs in the week for this employee
    const headers = [
      'Employee Name',
      'Employee Role',
      'Week Ending',
      'Job Number',
      'Team Name',
      'Address',
      'Work Item',
      'Column 2',
      'Column 3',
      'Column 4',
      'Rate (£)',
      'Monday Hours',
      'Tuesday Hours',
      'Wednesday Hours',
      'Thursday Hours',
      'Friday Hours',
      'Saturday Hours',
      'Sunday Hours',
      'Total Hours',
      'Quantity (m)',
      'Line Total (£)',
      'Job Total (£)',
      'Submitted Date'
    ];

    const rows: string[][] = [];
    let weekTotal = 0;

    // Process each timesheet (job) for this employee
    teamLeader.timesheets.forEach((timesheet, timesheetIndex) => {
      const jobTotal = timesheet.total_value;
      weekTotal += jobTotal;

      if (timesheet.timesheet_entries && timesheet.timesheet_entries.length > 0) {
        // Add each work line
        timesheet.timesheet_entries.forEach((entry, entryIndex) => {
          const workItem = entry.work_rate?.work_type || 
                          entry.ipsom_rate?.work_item || 
                          entry.mollsworth_rate?.col1_work_item || 
                          'Day Rate';
          
          const col2 = entry.work_rate?.voltage_type || 
                      entry.ipsom_rate?.col2 || 
                      entry.mollsworth_rate?.col2_param || 
                      '-';
          
          const col3 = entry.work_rate?.site_type || 
                      entry.ipsom_rate?.col3 || 
                      entry.mollsworth_rate?.col3_param || 
                      '-';
          
          const col4 = entry.ipsom_rate?.col4 || 
                      entry.mollsworth_rate?.col4_param || 
                      '-';
          
          const rate = entry.work_rate?.rate_value || 
                      entry.ipsom_rate?.rate_gbp || 
                      entry.mollsworth_rate?.rate_gbp || 
                      0;

          rows.push([
            teamLeader.employeeName,
            teamLeader.employeeRole,
            new Date(timesheet.week_ending).toLocaleDateString('en-GB'),
            timesheet.job_number,
            timesheet.team_name || '',
            timesheet.address || '',
            workItem,
            col2,
            col3,
            col4,
            rate.toFixed(2),
            entry.monday?.toString() || '0',
            entry.tuesday?.toString() || '0',
            entry.wednesday?.toString() || '0',
            entry.thursday?.toString() || '0',
            entry.friday?.toString() || '0',
            entry.saturday?.toString() || '0',
            entry.sunday?.toString() || '0',
            entry.total_hours?.toString() || '0',
            entry.quantity?.toString() || '0',
            entry.line_total.toFixed(2),
            entryIndex === 0 ? jobTotal.toFixed(2) : '', // Only show job total on first line
            entryIndex === 0 ? new Date(timesheet.submitted_at!).toLocaleDateString('en-GB') : ''
          ]);
        });
      } else {
        // If no entries, still create a row for the job
        rows.push([
          timesheet.employee?.full_name || teamLeader.employeeName,
          teamLeader.employeeRole,
          new Date(timesheet.week_ending).toLocaleDateString('en-GB'),
          timesheet.job_number,
          timesheet.team_name || '',
          timesheet.address || '',
          'No work entries',
          '-',
          '-',
          '-',
          '0.00',
          '0',
          '0',
          '0',
          '0',
          '0',
          '0',
          '0',
          '0',
          '0',
          jobTotal.toFixed(2),
          jobTotal.toFixed(2),
          new Date(timesheet.submitted_at!).toLocaleDateString('en-GB')
        ]);
      }

      // Add separator row between jobs (except for last job)
      if (timesheetIndex < teamLeader.timesheets.length - 1) {
        rows.push(Array(headers.length).fill(''));
      }
    });

    // Add week total row
    rows.push([
      '',
      '',
      '',
      '',
      '',
      '',
      'WEEK TOTAL',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      weekTotal.toFixed(2),
      '',
      ''
    ]);

    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    
    // Generate filename: EmployeeName_Week-Ending_AllJobs_Date.csv
    const employeeName = teamLeader.employeeName.replace(/\s+/g, '-');
    const weekEnding = teamLeader.timesheets[0]?.week_ending || '';
    const today = new Date().toISOString().split('T')[0];
    
    a.download = `${employeeName}_Week-${weekEnding}_AllJobs_${today}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const toggleWeekExpansion = (weekEnding: string) => {
    const newExpanded = new Set(expandedWeeks);
    if (newExpanded.has(weekEnding)) {
      newExpanded.delete(weekEnding);
    } else {
      newExpanded.add(weekEnding);
    }
    setExpandedWeeks(newExpanded);
  };

  const toggleTeamLeaderExpansion = (weekEnding: string, employeeId: string) => {
    const key = `${weekEnding}-${employeeId}`;
    const newExpanded = new Set(expandedTeamLeaders);
    if (newExpanded.has(key)) {
      newExpanded.delete(key);
    } else {
      newExpanded.add(key);
    }
    setExpandedTeamLeaders(newExpanded);
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-8 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
        <p className="mt-2 text-slate-600">Loading submitted timesheets...</p>
      </div> 
    );
  }

  if (weeklyGroups.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-8 text-center">
        <FileText className="h-12 w-12 text-slate-400 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-slate-900 mb-2">No Submitted Timesheets Found</h3>
        <p className="text-slate-600 mb-4">Only submitted timesheets appear here for payroll processing.</p>
        <button
          onClick={refreshTimesheets}
          disabled={refreshing}
          className="flex items-center space-x-2 mx-auto px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg transition-colors"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          <span>{refreshing ? 'Refreshing...' : 'Refresh'}</span>
        </button>
      </div>
    );
  }

  const totalAllWeeks = weeklyGroups.reduce((sum, week) => sum + week.totalValue, 0);
  const totalAllTimesheets = weeklyGroups.reduce((sum, week) => sum + week.totalTimesheets, 0);
  const totalActiveEmployees = new Set(timesheets.map(t => t.employee_id)).size;

  // Get unique weeks and gangs for export filters
  const uniqueWeeks = [...new Set(timesheets.map(t => t.week_ending))].sort().reverse();
  const uniqueGangs = [...new Set(timesheets.map(t => t.team_name).filter(Boolean))].sort();

  const handleDeleteTimesheet = async (timesheet: Timesheet) => {
    setDeleteConfirmation({ show: true, timesheet });
  };

  const confirmDelete = async () => {
    if (!deleteConfirmation.timesheet) return;

    setDeleting(true);
    try {
      const { error } = await supabase
        .from('new_timesheets')
        .delete()
        .eq('id', deleteConfirmation.timesheet.id);

      if (error) throw error;

      setDeleteConfirmation({ show: false, timesheet: null });
      loadTimesheets(); // Refresh the list
    } catch (error) {
      console.error('Error deleting timesheet:', error);
      alert('Failed to delete timesheet. Please try again.');
    } finally {
      setDeleting(false);
    }
  };

  const cancelDelete = () => {
    setDeleteConfirmation({ show: false, timesheet: null });
  };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-sm p-4">
          <div className="flex items-center space-x-3">
            <Calendar className="h-8 w-8 text-blue-600" />
            <div>
              <div className="text-2xl font-bold text-slate-900">{weeklyGroups.length}</div>
              <div className="text-sm text-slate-600">Weeks with Timesheets</div>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-xl shadow-sm p-4">
          <div className="flex items-center space-x-3">
            <FileText className="h-8 w-8 text-green-600" />
            <div>
              <div className="text-2xl font-bold text-slate-900">{totalAllTimesheets}</div>
              <div className="text-sm text-slate-600">Total Timesheets</div>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-xl shadow-sm p-4">
          <div className="flex items-center space-x-3">
            <Users className="h-8 w-8 text-purple-600" />
            <div>
              <div className="text-2xl font-bold text-slate-900">{totalActiveEmployees}</div>
              <div className="text-sm text-slate-600">Active Employees</div>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-xl shadow-sm p-4">
          <div className="flex items-center space-x-3">
            <DollarSign className="h-8 w-8 text-green-600" />
            <div>
              <div className="text-2xl font-bold text-slate-900">£{totalAllWeeks.toFixed(0)}</div>
              <div className="text-sm text-slate-600">Total Value</div>
            </div>
          </div>
        </div>
      </div>

      {/* Header */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 mb-2">Professional Timesheets</h2>
            <p className="text-slate-600">Organized by week ending with team leader breakdown</p>
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={refreshTimesheets}
              disabled={refreshing}
              className="flex items-center space-x-2 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white rounded-lg transition-colors"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              <span>{refreshing ? 'Refreshing...' : 'Refresh'}</span>
            </button>
          </div>
        </div>
        
        {/* Export Filters */}
        <div className="mt-6 p-4 bg-slate-50 rounded-lg">
          <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center">
            <Filter className="h-5 w-5 mr-2" />
            Export Filters
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Week Ending</label>
              <select
                value={selectedWeekForExport}
                onChange={(e) => setSelectedWeekForExport(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">All Weeks</option>
                {uniqueWeeks.map(week => (
                  <option key={week} value={week}>
                    {new Date(week).toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric'
                    })}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Gang/Team</label>
              <select
                value={selectedGangForExport}
                onChange={(e) => setSelectedGangForExport(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">All Gangs</option>
                {uniqueGangs.map(gang => (
                  <option key={gang} value={gang}>
                    {gang}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <button
                onClick={exportToCSV}
                className="w-full flex items-center justify-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              >
                <Download className="h-4 w-4" />
                <span>Export CSV</span>
              </button>
            </div>
          </div>
          {(selectedWeekForExport || selectedGangForExport) && (
            <div className="mt-3 text-sm text-slate-600">
              Exporting: {selectedWeekForExport ? `Week ${new Date(selectedWeekForExport).toLocaleDateString()}` : 'All weeks'}
              {selectedWeekForExport && selectedGangForExport && ' • '}
              {selectedGangForExport ? `Gang: ${selectedGangForExport}` : selectedWeekForExport ? '' : 'All gangs'}
            </div>
          )}
        </div>
      </div>

      {/* Weekly Groups */}
      <div className="space-y-4">
        {weeklyGroups.map((weekGroup) => (
          <div key={weekGroup.weekEnding} className="bg-white rounded-xl shadow-sm overflow-hidden">
            {/* Week Header */}
            <div 
              className="bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-blue-200 p-6 cursor-pointer hover:from-blue-100 hover:to-indigo-100 transition-colors"
              onClick={() => toggleWeekExpansion(weekGroup.weekEnding)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  {expandedWeeks.has(weekGroup.weekEnding) ? (
                    <ChevronDown className="h-5 w-5 text-blue-600" />
                  ) : (
                    <ChevronRight className="h-5 w-5 text-blue-600" />
                  )}
                  <div className="flex items-center space-x-3">
                    <Calendar className="h-6 w-6 text-blue-600" />
                    <div>
                      <h3 className="text-xl font-bold text-slate-900">
                        Week Ending: {new Date(weekGroup.weekEnding).toLocaleDateString('en-GB', {
                          weekday: 'long',
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric'
                        })}
                      </h3>
                      <p className="text-blue-700">
                        {weekGroup.teamLeaders.length} team leader{weekGroup.teamLeaders.length !== 1 ? 's' : ''} • {weekGroup.totalTimesheets} timesheet{weekGroup.totalTimesheets !== 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-green-600">£{weekGroup.totalValue.toFixed(2)}</div>
                  <div className="text-sm text-slate-600">Week Total</div>
                </div>
              </div>
            </div>

            {/* Team Leaders */}
            {expandedWeeks.has(weekGroup.weekEnding) && (
              <div className="divide-y divide-slate-200">
                {weekGroup.teamLeaders.map((teamLeader) => {
                  const teamLeaderKey = `${weekGroup.weekEnding}-${teamLeader.employeeId}`;
                  const isExpanded = expandedTeamLeaders.has(teamLeaderKey);
                  
                  return (
                    <div key={teamLeaderKey}>
                      {/* Team Leader Header */}
                      <div 
                        className="p-4 hover:bg-slate-50 cursor-pointer transition-colors"
                        onClick={() => toggleTeamLeaderExpansion(weekGroup.weekEnding, teamLeader.employeeId)}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-4">
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4 text-slate-600" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-slate-600" />
                            )}
                            <div className="flex items-center space-x-3">
                              <div className="p-2 bg-green-100 rounded-lg">
                                <User className="h-5 w-5 text-green-600" />
                              </div>
                              <div>
                                <h4 className="text-lg font-semibold text-slate-900">{teamLeader.employeeName}</h4>
                                <p className="text-sm text-slate-600">{teamLeader.employeeRole}</p>
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-lg font-bold text-green-600">£{teamLeader.totalValue.toFixed(2)}</div>
                            <div className="text-xs text-slate-500">{teamLeader.totalTimesheets} timesheet{teamLeader.totalTimesheets !== 1 ? 's' : ''}</div>
                          </div>
                        </div>
                      </div>

                      {/* Team Leader Timesheets Details */}
                      {isExpanded && (
                        <div className="bg-slate-50 p-4">
                          {/* Weekly Download Button */}
                          <div className="mb-4">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                exportWeeklyEmployeeCSV(teamLeader);
                              }}
                              className="w-full bg-green-600 hover:bg-green-700 text-white py-3 px-4 rounded-lg transition-colors flex items-center justify-center space-x-2 font-medium"
                            >
                              <Download className="h-5 w-5" />
                              <span>Download Complete Week CSV - {teamLeader.employeeName}</span>
                            </button>
                            <p className="text-xs text-slate-600 mt-1 text-center">
                              Downloads all {teamLeader.totalTimesheets} job{teamLeader.totalTimesheets !== 1 ? 's' : ''} for this week ending
                            </p>
                          </div>

                          <div className="space-y-3">
                            {teamLeader.timesheets.map((timesheet) => (
                              <div key={timesheet.id} className="bg-white rounded-lg p-4 border border-slate-200">
                                <div className="flex items-center justify-between mb-3">
                                  <div>
                                    <h5 className="font-semibold text-slate-900">Job: {timesheet.job_number}</h5>
                                    <p className="text-sm text-slate-600">Team: {timesheet.team_name}</p>
                                    {timesheet.address && (
                                      <p className="text-xs text-slate-500">{timesheet.address}</p>
                                    )}
                                  </div>
                                  <div className="text-right">
                                    <div className="text-lg font-bold text-green-600">£{timesheet.total_value.toFixed(2)}</div>
                                    <div className="text-xs text-slate-500">
                                      Submitted: {new Date(timesheet.submitted_at!).toLocaleDateString()}
                                    </div>
                                  </div>
                                </div>

                                {/* Work Lines Summary */}
                                {timesheet.timesheet_entries && timesheet.timesheet_entries.length > 0 && (
                                  <div className="mb-3">
                                    <h6 className="text-sm font-medium text-slate-700 mb-2">Work Lines ({timesheet.timesheet_entries.length}):</h6>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                      {timesheet.timesheet_entries.slice(0, 4).map((entry, index) => (
                                        <div key={index} className="text-xs p-2 rounded bg-slate-100">
                                          <div className="font-medium">
                                            {entry.work_rate?.work_type || entry.ipsom_rate?.work_item || entry.mollsworth_rate?.col1_work_item || 'Unknown'}
                                          </div>
                                          <div className="text-slate-600">
                                            {entry.quantity}m × £{(entry.work_rate?.rate_value || entry.ipsom_rate?.rate_gbp || entry.mollsworth_rate?.rate_gbp || 0).toFixed(2)} = £{entry.line_total.toFixed(2)}
                                          </div>
                                        </div>
                                      ))}
                                      {timesheet.timesheet_entries.length > 4 && (
                                        <div className="text-xs p-2 rounded bg-slate-200 text-slate-600 flex items-center justify-center">
                                          +{timesheet.timesheet_entries.length - 4} more lines
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                )}

                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedTimesheet(timesheet);
                                  }}
                                  className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-lg transition-colors flex items-center justify-center space-x-2"
                                >
                                  <Eye className="h-4 w-4" />
                                  <span>View Full Details</span>
                                </button>

                                <div className="grid grid-cols-2 gap-2 mt-2">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      exportIndividualTimesheetCSV(timesheet);
                                    }}
                                    className="bg-green-600 hover:bg-green-700 text-white py-2 px-4 rounded-lg transition-colors flex items-center justify-center space-x-2"
                                  >
                                    <Download className="h-4 w-4" />
                                    <span>CSV</span>
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDeleteTimesheet(timesheet);
                                    }}
                                    className="bg-red-600 hover:bg-red-700 text-white py-2 px-4 rounded-lg transition-colors flex items-center justify-center space-x-2"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                    <span>Delete</span>
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Timesheet Details Modal */}
      {selectedTimesheet && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-6xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-semibold text-slate-900">Timesheet Details</h3>
                <button
                  onClick={() => setSelectedTimesheet(null)}
                  className="text-slate-400 hover:text-slate-600 transition-colors"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-6">
                {/* Header Info */}
                <div className="bg-slate-50 rounded-xl p-6">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div>
                      <div className="text-sm font-medium text-slate-500">Employee</div>
                      <div className="text-lg font-semibold text-slate-900">
                        {selectedTimesheet.employee?.name}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-slate-500">Job Number</div>
                      <div className="text-lg font-semibold text-slate-900">
                        {selectedTimesheet.job_number}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-slate-500">Week Ending</div>
                      <div className="text-lg font-semibold text-slate-900">
                        {new Date(selectedTimesheet.week_ending).toLocaleDateString()}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-slate-500">Total Value</div>
                      <div className="text-lg font-semibold text-green-600">
                        £{selectedTimesheet.total_value.toFixed(2)}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Work Lines */}
                {selectedTimesheet.timesheet_entries && selectedTimesheet.timesheet_entries.length > 0 && (
                  <div className="bg-white border border-slate-200 rounded-xl p-6">
                    <h4 className="text-lg font-semibold text-slate-900 mb-4">Work Lines</h4>
                    <div className="overflow-x-auto">
                      <table className="w-full border border-slate-300">
                        <thead className="bg-slate-100">
                          <tr>
                            <th className="border border-slate-300 px-2 py-2 text-xs font-medium text-slate-700">Work Type</th>
                            <th className="border border-slate-300 px-2 py-2 text-xs font-medium text-slate-700">Voltage</th>
                            <th className="border border-slate-300 px-2 py-2 text-xs font-medium text-slate-700">Site</th>
                            <th className="border border-slate-300 px-2 py-2 text-xs font-medium text-slate-700">Rate</th>
                            <th className="border border-slate-300 px-2 py-2 text-xs font-medium text-slate-700">M</th>
                            <th className="border border-slate-300 px-2 py-2 text-xs font-medium text-slate-700">T</th>
                            <th className="border border-slate-300 px-2 py-2 text-xs font-medium text-slate-700">W</th>
                            <th className="border border-slate-300 px-2 py-2 text-xs font-medium text-slate-700">TH</th>
                            <th className="border border-slate-300 px-2 py-2 text-xs font-medium text-slate-700">F</th>
                            <th className="border border-slate-300 px-2 py-2 text-xs font-medium text-slate-700">SAT</th>
                            <th className="border border-slate-300 px-2 py-2 text-xs font-medium text-slate-700">SUN</th>
                            <th className="border border-slate-300 px-2 py-2 text-xs font-medium text-slate-700">Metres</th>
                            <th className="border border-slate-300 px-2 py-2 text-xs font-medium text-slate-700">Value</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedTimesheet.timesheet_entries.map((line, index) => (
                            <tr key={index} className="hover:bg-slate-50">
                              <td className="border border-slate-300 p-2 text-xs">{line.work_rate?.work_type || line.ipsom_rate?.work_item || line.mollsworth_rate?.col1_work_item || 'Day Rate'}</td>
                              <td className="border border-slate-300 p-2 text-xs text-center">{line.work_rate?.voltage_type || line.ipsom_rate?.col2 || line.mollsworth_rate?.col2_param}</td>
                              <td className="border border-slate-300 p-2 text-xs text-center">{line.work_rate?.site_type || line.ipsom_rate?.col3 || line.mollsworth_rate?.col3_param || '-'}</td>
                              <td className="border border-slate-300 p-2 text-xs text-center">£{(line.work_rate?.rate_value || line.ipsom_rate?.rate_gbp || line.mollsworth_rate?.rate_gbp || 0).toFixed(2)}</td>
                              <td className="border border-slate-300 p-2 text-xs text-center">{line.monday || '-'}</td>
                              <td className="border border-slate-300 p-2 text-xs text-center">{line.tuesday || '-'}</td>
                              <td className="border border-slate-300 p-2 text-xs text-center">{line.wednesday || '-'}</td>
                              <td className="border border-slate-300 p-2 text-xs text-center">{line.thursday || '-'}</td>
                              <td className="border border-slate-300 p-2 text-xs text-center">{line.friday || '-'}</td>
                              <td className="border border-slate-300 p-2 text-xs text-center">{line.saturday || '-'}</td>
                              <td className="border border-slate-300 p-2 text-xs text-center">{line.sunday || '-'}</td>
                              <td className="border border-slate-300 p-2 text-xs text-center">{line.quantity}</td>
                              <td className="border border-slate-300 p-2 text-xs text-center font-medium">£{line.line_total.toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmation.show && deleteConfirmation.timesheet && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full">
            <div className="p-6">
              <div className="flex items-center justify-center mb-4">
                <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                  <Trash2 className="w-6 h-6 text-red-600" />
                </div>
              </div>
              
              <h3 className="text-xl font-bold text-slate-900 text-center mb-4">
                Delete Timesheet
              </h3>
              
              <p className="text-slate-600 text-center mb-6">
                Are you sure you want to delete this timesheet? This action cannot be undone.
              </p>
              
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 mb-6">
                <div className="text-sm space-y-1">
                  <div><strong>Employee:</strong> {deleteConfirmation.timesheet.employee?.full_name || deleteConfirmation.timesheet.employee?.name}</div>
                  <div><strong>Job Number:</strong> {deleteConfirmation.timesheet.job_number}</div>
                  <div><strong>Week Ending:</strong> {new Date(deleteConfirmation.timesheet.week_ending).toLocaleDateString()}</div>
                  <div><strong>Total Value:</strong> £{deleteConfirmation.timesheet.total_value.toFixed(2)}</div>
                </div>
              </div>
              
              <div className="flex space-x-3">
                <button
                  onClick={cancelDelete}
                  disabled={deleting}
                  className="flex-1 px-4 py-2 bg-slate-200 hover:bg-slate-300 disabled:bg-slate-100 text-slate-700 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDelete}
                  disabled={deleting}
                  className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white rounded-lg transition-colors flex items-center justify-center space-x-2"
                >
                  {deleting ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      <span>Deleting...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="h-4 w-4" />
                      <span>Delete Timesheet</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};