import React, { useState, useEffect } from 'react';
import { Eye, AlertTriangle, CheckCircle, Download, User, Calendar, Filter, X, Clock, Car, Trash2, RefreshCw, ChevronDown, ChevronRight, Triangle as ExclamationTriangle } from 'lucide-react';
import { VehicleInspection, Employee, supabase } from '../../../lib/supabase';

interface InspectionTableProps {
  inspections: VehicleInspection[];
  onViewInspection: (inspection: VehicleInspection) => void;
  employees: Employee[];
  allInspections: VehicleInspection[];
  onInspectionsUpdate: () => void;
}

interface WeekData {
  weekEnding: string;
  employees: EmployeeWeekData[];
}

interface EmployeeWeekData {
  employee: Employee;
  dailyChecks: DailyCheckStatus[];
}

interface DailyCheckStatus {
  date: string;
  dayName: string;
  hasCheck: boolean;
  hasDefects: boolean;
  inspection?: VehicleInspection;
}

interface DefectSummary {
  employee: Employee;
  inspection: VehicleInspection;
  defectCount: number;
  date: string;
}

export const InspectionTable: React.FC<InspectionTableProps> = ({
  inspections,
  onViewInspection,
  employees,
  allInspections,
  onInspectionsUpdate,
}) => {
  const [weekData, setWeekData] = useState<WeekData[]>([]);
  const [selectedWeek, setSelectedWeek] = useState<string>('');
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'defects'>('overview');
  const [deleteConfirmation, setDeleteConfirmation] = useState<{
    show: boolean;
    inspection: VehicleInspection | null;
  }>({ show: false, inspection: null });
  const [deleting, setDeleting] = useState(false);
  
  // Get current date for calendar display
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().split('T')[0];
  
  const currentDateStr = today.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
  
  const todayInspections = allInspections.filter(inspection => {
    const inspectionDateStr = new Date(inspection.submitted_at).toISOString().split('T')[0];
    console.log('Comparing inspection date:', inspectionDateStr, 'with today:', todayStr);
    return inspectionDateStr === todayStr;
  });
  
  console.log('DailyComplianceChart - Today is:', today.toDateString(), 'Day of week:', today.getDay(), 'Date string:', todayStr);
  console.log('Found', todayInspections.length, 'inspections for today');

  useEffect(() => {
    generateWeekData();
  }, [allInspections, employees]);

  const generateWeekData = () => {
    const weeks: WeekData[] = [];
    
    // Start from today and work backwards
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    console.log('=== REBUILDING WEEK DATA ===');
    console.log('Today is:', today.toDateString(), 'Day of week:', today.getDay());
    
    // Generate 8 weeks of data
    for (let weekOffset = 0; weekOffset < 8; weekOffset++) {
      // Calculate the Sunday (week ending) for this week
      // Start from today and find the next Sunday (or current Sunday if today is Sunday)
      const currentWeekSunday = new Date(today);
      const daysUntilSunday = (7 - today.getDay()) % 7; // Days until next Sunday (0 if today is Sunday)
      currentWeekSunday.setDate(today.getDate() + daysUntilSunday - (7 * weekOffset));
      currentWeekSunday.setHours(23, 59, 59, 999);
      
      const weekEnding = currentWeekSunday.toISOString().split('T')[0];
      
      // Calculate Monday of this week (6 days before Sunday)
      const monday = new Date(currentWeekSunday);
      monday.setDate(currentWeekSunday.getDate() - 6);
      monday.setHours(0, 0, 0, 0);
      
      console.log(`\nWeek ${weekOffset}:`);
      console.log('  Sunday (week ending):', currentWeekSunday.toDateString());
      console.log('  Monday (week start):', monday.toDateString());
      
      const employeeWeekData: EmployeeWeekData[] = employees.map(employee => {
        const dailyChecks: DailyCheckStatus[] = [];
        
        // Generate 7 days starting from Monday
        for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
          const checkDate = new Date(monday);
          checkDate.setDate(monday.getDate() + dayOffset);
          checkDate.setHours(0, 0, 0, 0);
          
          const dateStr = checkDate.toISOString().split('T')[0];
          const dayName = checkDate.toLocaleDateString('en-US', { weekday: 'short' });
          
          // Find inspection for this employee on this exact date
          const inspection = allInspections.find(insp => {
            if (insp.employee_id !== employee.id) return false;
            
            const inspectionDate = new Date(insp.submitted_at);
            inspectionDate.setHours(0, 0, 0, 0);
            const inspectionDateStr = inspectionDate.toISOString().split('T')[0];
            
            return inspectionDateStr === dateStr;
          });
          
          console.log(`    ${dayName} ${checkDate.getDate()}/${checkDate.getMonth() + 1}: ${dateStr} - ${inspection ? 'HAS CHECK' : 'NO CHECK'}`);
          
          dailyChecks.push({
            date: dateStr,
            dayName,
            hasCheck: !!inspection,
            hasDefects: inspection?.has_defects || false,
            inspection
          });
        }
        
        return {
          employee,
          dailyChecks
        };
      });
      
      weeks.push({
        weekEnding,
        employees: employeeWeekData
      });
    }
    
    console.log('=== WEEK DATA COMPLETE ===\n');
    
    setWeekData(weeks);
    if (!selectedWeek && weeks.length > 0) {
      setSelectedWeek(weeks[0].weekEnding);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await onInspectionsUpdate();
    setRefreshing(false);
  };

  const handleDeleteInspection = async (inspection: VehicleInspection) => {
    setDeleteConfirmation({ show: true, inspection });
  };

  const confirmDelete = async () => {
    if (!deleteConfirmation.inspection) return;

    setDeleting(true);
    try {
      // First delete all inspection items
      const { error: itemsError } = await supabase
        .from('inspection_items')
        .delete()
        .eq('inspection_id', deleteConfirmation.inspection.id);

      if (itemsError) throw itemsError;

      // Then delete the inspection
      const { error } = await supabase
        .from('vehicle_inspections')
        .delete()
        .eq('id', deleteConfirmation.inspection.id);

      if (error) throw error;

      setDeleteConfirmation({ show: false, inspection: null });
      await onInspectionsUpdate();
    } catch (error) {
      console.error('Error deleting inspection:', error);
      alert('Failed to delete inspection. Please try again.');
    } finally {
      setDeleting(false);
    }
  };

  const cancelDelete = () => {
    setDeleteConfirmation({ show: false, inspection: null });
  };

  const exportWeekToCSV = () => {
    const selectedWeekData = weekData.find(w => w.weekEnding === selectedWeek);
    if (!selectedWeekData) return;

    const headers = ['Employee', 'Role', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun', 'Weekday Compliance', 'Total Checks', 'Defects Found'];
    const rows = selectedWeekData.employees.map(empData => {
      const weekdayChecks = empData.dailyChecks.slice(0, 5).filter(check => check.hasCheck).length;
      const totalChecks = empData.dailyChecks.filter(check => check.hasCheck).length;
      const defectDays = empData.dailyChecks.filter(check => check.hasDefects).length;
      
      return [
        empData.employee.full_name,
        empData.employee.role,
        ...empData.dailyChecks.map(check => 
          check.hasCheck ? (check.hasDefects ? 'DEFECT' : 'OK') : '-'
        ),
        `${weekdayChecks}/5 (${Math.round((weekdayChecks / 5) * 100)}%)`,
        totalChecks.toString(),
        defectDays.toString()
      ];
    });

    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vehicle-checks-week-${selectedWeek}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const exportEntireWeekToCSV = () => {
    const selectedWeekData = weekData.find(w => w.weekEnding === selectedWeek);
    if (!selectedWeekData) return;

    // Create detailed CSV with all inspection data
    const headers = [
      'Date', 'Day', 'Employee', 'Role', 'Vehicle', 'Status', 'Defects Found', 
      'Inspection Time', 'Defect Items', 'Comments'
    ];
    
    const rows: string[][] = [];
    
    selectedWeekData.employees.forEach(empData => {
      empData.dailyChecks.forEach(dayCheck => {
        if (dayCheck.hasCheck && dayCheck.inspection) {
          const inspection = dayCheck.inspection;
          const defectItems = inspection.inspection_items?.filter(item => item.status === 'defect') || [];
          const defectItemNames = defectItems.map(item => item.item_name).join('; ');
          const defectComments = defectItems.map(item => item.comments || '').filter(Boolean).join('; ');
          
          rows.push([
            new Date(dayCheck.date).toLocaleDateString('en-GB'),
            dayCheck.dayName,
            empData.employee.full_name,
            empData.employee.role,
            inspection.override_vehicle_registration || inspection.vehicle?.registration_number || 'Unknown',
            inspection.has_defects ? 'DEFECTS FOUND' : 'ALL CLEAR',
            defectItems.length.toString(),
            new Date(inspection.submitted_at).toLocaleTimeString('en-GB'),
            defectItemNames || 'None',
            defectComments || 'None'
          ]);
        }
      });
    });

    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `detailed-vehicle-checks-week-${selectedWeek}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const selectedWeekData = weekData.find(w => w.weekEnding === selectedWeek);

  // Calculate stats for selected week
  const weekStats = selectedWeekData ? {
    totalEmployees: selectedWeekData.employees.length,
    // Only count Monday-Friday for compliance (5 days)
    totalPossibleChecks: selectedWeekData.employees.length * 5,
    completedChecks: selectedWeekData.employees.reduce((sum, emp) => 
      // Only count Monday-Friday checks (first 5 days)
      sum + emp.dailyChecks.slice(0, 5).filter(check => check.hasCheck).length, 0
    ),
    defectsFound: selectedWeekData.employees.reduce((sum, emp) => 
      sum + emp.dailyChecks.filter(check => check.hasDefects).length, 0
    ),
    totalAllChecks: selectedWeekData.employees.reduce((sum, emp) => 
      sum + emp.dailyChecks.filter(check => check.hasCheck).length, 0
    )
  } : { totalEmployees: 0, totalPossibleChecks: 0, completedChecks: 0, defectsFound: 0, totalAllChecks: 0 };

  const complianceRate = weekStats.totalPossibleChecks > 0 
    ? Math.round((weekStats.completedChecks / weekStats.totalPossibleChecks) * 100)
    : 0;

  // Get defects summary for selected week
  const getDefectsSummary = (): DefectSummary[] => {
    if (!selectedWeekData) return [];
    
    const defects: DefectSummary[] = [];
    
    selectedWeekData.employees.forEach(empData => {
      empData.dailyChecks.forEach(dayCheck => {
        if (dayCheck.hasDefects && dayCheck.inspection) {
          const defectCount = dayCheck.inspection.inspection_items?.filter(item => item.status === 'defect').length || 0;
          defects.push({
            employee: empData.employee,
            inspection: dayCheck.inspection,
            defectCount,
            date: dayCheck.date
          });
        }
      });
    });
    
    return defects.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  };

  const defectsSummary = getDefectsSummary();

  return (
    <div className="space-y-6">
      {/* Calendar Background Header */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-6 border border-blue-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="p-3 bg-blue-100 rounded-xl">
              <Calendar className="h-8 w-8 text-blue-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Daily Vehicle Checks</h1>
              <p className="text-blue-700 font-medium">Today: {currentDateStr}</p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold text-blue-600">
              {today.getDate()}
            </div>
            <div className="text-sm text-blue-600">
              {today.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}
            </div>
          </div>
        </div>
      </div>

      {/* Header with Stats and Controls */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Weekly Compliance Overview</h2>
            <p className="text-slate-600">Monitor employee daily vehicle check compliance</p>
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg transition-colors"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              <span>{refreshing ? 'Refreshing...' : 'Refresh'}</span>
            </button>
          </div>
        </div>

        {/* Week Selection Dropdown */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-slate-700 mb-2">Select Week Ending</label>
          <select
            value={selectedWeek}
            onChange={(e) => setSelectedWeek(e.target.value)}
            className="w-full md:w-auto px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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

        {/* Tab Navigation */}
        <div className="border-b border-slate-200 mb-6">
          <nav className="flex space-x-8">
            <button
              onClick={() => setActiveTab('overview')}
              className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'overview'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }`}
            >
              Weekly Overview
            </button>
            <button
              onClick={() => setActiveTab('defects')}
              className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'defects'
                  ? 'border-red-500 text-red-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }`}
            >
              Defects Found ({defectsSummary.length})
            </button>
          </nav>
        </div>

        {/* Week Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
            <div className="text-2xl font-bold text-blue-700">{weekStats.completedChecks}</div>
            <div className="text-sm text-blue-600">Weekday Checks (Mon-Fri)</div>
          </div>
          <div className="bg-green-50 rounded-lg p-4 border border-green-200">
            <div className="text-2xl font-bold text-green-700">{complianceRate}%</div>
            <div className="text-sm text-green-600">Weekday Compliance</div>
          </div>
          <div className="bg-amber-50 rounded-lg p-4 border border-amber-200">
            <div className="text-2xl font-bold text-amber-700">{weekStats.defectsFound}</div>
            <div className="text-sm text-amber-600">Defects Found</div>
          </div>
          <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
            <div className="text-2xl font-bold text-purple-700">{weekStats.totalAllChecks}</div>
            <div className="text-sm text-purple-600">Total Checks (Inc. Weekends)</div>
          </div>
        </div>

        {/* Download Buttons */}
        <div className="flex space-x-3 mb-6">
          <button
            onClick={exportWeekToCSV}
            disabled={!selectedWeek}
            className="flex items-center space-x-2 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white rounded-lg transition-colors"
          >
            <Download className="h-4 w-4" />
            <span>Export Week Summary</span>
          </button>
          <button
            onClick={exportEntireWeekToCSV}
            disabled={!selectedWeek}
            className="flex items-center space-x-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-lg transition-colors"
          >
            <Download className="h-4 w-4" />
            <span>Export Detailed Week Data</span>
          </button>
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && selectedWeekData && (
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
                  <th className="px-4 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">Mon</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">Tue</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">Wed</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">Thu</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">Fri</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">Sat</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">Sun</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">Summary</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-200">
                {selectedWeekData.employees.map((empData) => {
                  const weekdayChecks = empData.dailyChecks.slice(0, 5).filter(check => check.hasCheck).length;
                  const weekendChecks = empData.dailyChecks.slice(5).filter(check => check.hasCheck).length;
                  const defectDays = empData.dailyChecks.filter(check => check.hasDefects).length;
                  
                  return (
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
                      
                      {/* Daily Check Status */}
                      {empData.dailyChecks.map((dayCheck) => (
                        <td key={dayCheck.date} className="px-4 py-4 text-center">
                          <div className="flex flex-col items-center space-y-1">
                            {dayCheck.hasCheck ? (
                              <>
                                <div
                                  className={`w-8 h-8 rounded-full flex items-center justify-center cursor-pointer transition-colors ${
                                    dayCheck.hasDefects
                                      ? 'bg-red-100 hover:bg-red-200'
                                      : 'bg-green-100 hover:bg-green-200'
                                  }`}
                                  onClick={() => dayCheck.inspection && onViewInspection(dayCheck.inspection)}
                                  title={`Click to view details - ${dayCheck.hasDefects ? 'Has defects' : 'All clear'}`}
                                >
                                  {dayCheck.hasDefects ? (
                                    <AlertTriangle className="h-4 w-4 text-red-600" />
                                  ) : (
                                    <CheckCircle className="h-4 w-4 text-green-600" />
                                  )}
                                </div>
                                <div className="flex space-x-1">
                                  <button
                                    onClick={() => dayCheck.inspection && onViewInspection(dayCheck.inspection)}
                                    className="p-1 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                    title="View details"
                                  >
                                    <Eye className="h-3 w-3" />
                                  </button>
                                  <button
                                    onClick={() => dayCheck.inspection && handleDeleteInspection(dayCheck.inspection)}
                                    className="p-1 text-red-600 hover:bg-red-50 rounded transition-colors"
                                    title="Delete inspection"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </button>
                                </div>
                              </>
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center">
                                <X className="h-4 w-4 text-slate-400" />
                              </div>
                            )}
                            <div className="text-xs text-slate-500">
                            </div>
                          </div>
                        </td>
                      ))}
                      
                      {/* Summary */}
                      <td className="px-6 py-4 text-center">
                        <div className="space-y-1">
                          <div className="text-sm font-medium text-slate-900">
                            {weekdayChecks}/5 weekdays
                          </div>
                          {weekendChecks > 0 && (
                            <div className="text-xs text-blue-600">
                              +{weekendChecks} weekend
                            </div>
                          )}
                          {defectDays > 0 && (
                            <div className="text-xs text-red-600">
                              {defectDays} defect{defectDays !== 1 ? 's' : ''}
                            </div>
                          )}
                          <div className={`text-xs font-medium ${
                            weekdayChecks === 5 ? 'text-green-600' :
                            weekdayChecks >= 3 ? 'text-amber-600' : 'text-red-600'
                          }`}>
                            {Math.round((weekdayChecks / 5) * 100)}%
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Defects Tab */}
      {activeTab === 'defects' && (
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">
            Defects Found - Week Ending {new Date(selectedWeek).toLocaleDateString('en-GB')}
          </h3>
          
          {defectsSummary.length === 0 ? (
            <div className="text-center py-8">
              <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
              <p className="text-slate-600">No defects found for this week!</p>
            </div>
          ) : (
            <div className="space-y-4">
              {defectsSummary.map((defect) => (
                <div key={defect.inspection.id} className="border border-red-200 rounded-lg p-4 bg-red-50">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center space-x-3">
                      <div className="p-2 bg-red-100 rounded-lg">
                        <AlertTriangle className="h-5 w-5 text-red-600" />
                      </div>
                      <div>
                        <h4 className="font-semibold text-slate-900">{defect.employee.full_name}</h4>
                        <p className="text-sm text-slate-600">{defect.employee.role}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-medium text-slate-900">
                        {new Date(defect.date).toLocaleDateString('en-GB')}
                      </div>
                      <div className="text-xs text-red-600">
                        {defect.defectCount} defect{defect.defectCount !== 1 ? 's' : ''}
                      </div>
                    </div>
                  </div>
                  
                  <div className="mb-3">
                    <p className="text-sm text-slate-700">
                      <strong>Vehicle:</strong> {defect.inspection.override_vehicle_registration || defect.inspection.vehicle?.registration_number}
                    </p>
                  </div>

                  {/* Defect Items */}
                  {defect.inspection.inspection_items && (
                    <div className="mb-3">
                      <p className="text-sm font-medium text-slate-700 mb-2">Defect Items:</p>
                      <div className="space-y-1">
                        {defect.inspection.inspection_items
                          .filter(item => item.status === 'defect')
                          .map((item, index) => (
                            <div key={index} className="text-sm text-red-700 bg-white rounded p-2">
                              • {item.item_name}
                              {item.comments && (
                                <div className="text-xs text-slate-600 mt-1">
                                  Comment: {item.comments}
                                </div>
                              )}
                            </div>
                          ))}
                      </div>
                    </div>
                  )}

                  <div className="flex space-x-2">
                    <button
                      onClick={() => onViewInspection(defect.inspection)}
                      className="flex items-center space-x-1 px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm transition-colors"
                    >
                      <Eye className="h-3 w-3" />
                      <span>View Full Details</span>
                    </button>
                    <button
                      onClick={() => handleDeleteInspection(defect.inspection)}
                      className="flex items-center space-x-1 px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-sm transition-colors"
                    >
                      <Trash2 className="h-3 w-3" />
                      <span>Delete</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Legend */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Legend</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="flex items-center space-x-2">
            <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle className="h-4 w-4 text-green-600" />
            </div>
            <span className="text-sm text-slate-700">Check completed - All clear</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-6 h-6 rounded-full bg-red-100 flex items-center justify-center">
              <AlertTriangle className="h-4 w-4 text-red-600" />
            </div>
            <span className="text-sm text-slate-700">Check completed - Defects found</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center">
              <X className="h-4 w-4 text-slate-400" />
            </div>
            <span className="text-sm text-slate-700">No check completed</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="flex space-x-1">
              <Eye className="h-4 w-4 text-blue-600" />
              <Trash2 className="h-4 w-4 text-red-600" />
            </div>
            <span className="text-sm text-slate-700">View / Delete actions</span>
          </div>
        </div>
        <div className="mt-4 text-center text-xs text-slate-500">
          Compliance based on Monday-Friday. Weekend checks are optional but tracked.
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirmation.show && deleteConfirmation.inspection && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full">
            <div className="p-6">
              <div className="flex items-center justify-center mb-4">
                <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                  <Trash2 className="w-6 h-6 text-red-600" />
                </div>
              </div>
              
              <h3 className="text-xl font-bold text-slate-900 text-center mb-4">
                Delete Vehicle Inspection
              </h3>
              
              <p className="text-slate-600 text-center mb-6">
                Are you sure you want to delete this vehicle inspection? This action cannot be undone.
              </p>
              
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 mb-6">
                <div className="text-sm space-y-1">
                  <div><strong>Vehicle:</strong> {deleteConfirmation.inspection.override_vehicle_registration || deleteConfirmation.inspection.vehicle?.registration_number}</div>
                  <div><strong>Employee:</strong> {deleteConfirmation.inspection.employee?.full_name}</div>
                  <div><strong>Date:</strong> {new Date(deleteConfirmation.inspection.submitted_at).toLocaleDateString()}</div>
                  <div><strong>Status:</strong> {deleteConfirmation.inspection.has_defects ? 'Has Defects' : 'All Clear'}</div>
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
                      <span>Delete Inspection</span>
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

// Legacy component for backward compatibility
export const InspectionTableLegacy: React.FC<{
  inspections: VehicleInspection[];
  onViewInspection: (inspection: VehicleInspection) => void;
}> = ({ inspections, onViewInspection }) => {
  if (inspections.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-8 text-center">
        <p className="text-slate-600">No daily vehicle checks found matching your criteria.</p>
      </div>
    );
  }

  // This is now handled by the main InspectionTable component
  return null;
};