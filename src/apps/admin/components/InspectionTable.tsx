import React, { useState, useEffect, useMemo } from 'react';
import {
  Eye, AlertTriangle, CheckCircle, Download, User, Calendar,
  X, Car, Trash2, RefreshCw, Search, Filter, ChevronDown,
  FileText, Clock, Shield, TrendingUp, AlertCircle
} from 'lucide-react';
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

interface SearchFilters {
  searchTerm: string;
  vehicle: string;
  employee: string;
  dateFrom: string;
  dateTo: string;
  status: 'all' | 'defects' | 'clear';
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
  const [activeView, setActiveView] = useState<'compliance' | 'defects' | 'history'>('compliance');
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<SearchFilters>({
    searchTerm: '',
    vehicle: '',
    employee: '',
    dateFrom: '',
    dateTo: '',
    status: 'all',
  });
  const [deleteConfirmation, setDeleteConfirmation] = useState<{
    show: boolean;
    inspection: VehicleInspection | null;
  }>({ show: false, inspection: null });
  const [deleting, setDeleting] = useState(false);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  useEffect(() => {
    generateWeekData();
  }, [allInspections, employees]);

  const generateWeekData = () => {
    const weeks: WeekData[] = [];
    const currentDate = new Date();
    currentDate.setHours(0, 0, 0, 0);

    for (let weekOffset = 0; weekOffset < 12; weekOffset++) {
      const currentWeekSunday = new Date(currentDate);
      const daysUntilSunday = (7 - currentDate.getDay()) % 7;
      currentWeekSunday.setDate(currentDate.getDate() + daysUntilSunday - (7 * weekOffset));
      currentWeekSunday.setHours(23, 59, 59, 999);

      const weekEnding = currentWeekSunday.toISOString().split('T')[0];
      const monday = new Date(currentWeekSunday);
      monday.setDate(currentWeekSunday.getDate() - 6);
      monday.setHours(0, 0, 0, 0);

      const employeeWeekData: EmployeeWeekData[] = employees.map(employee => {
        const dailyChecks: DailyCheckStatus[] = [];

        for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
          const checkDate = new Date(monday);
          checkDate.setDate(monday.getDate() + dayOffset);
          checkDate.setHours(0, 0, 0, 0);

          const dateStr = checkDate.toISOString().split('T')[0];
          const dayName = checkDate.toLocaleDateString('en-US', { weekday: 'short' });

          const inspection = allInspections.find(insp => {
            if (insp.employee_id !== employee.id) return false;
            const inspectionDate = new Date(insp.submitted_at);
            inspectionDate.setHours(0, 0, 0, 0);
            return inspectionDate.toISOString().split('T')[0] === dateStr;
          });

          dailyChecks.push({
            date: dateStr,
            dayName,
            hasCheck: !!inspection,
            hasDefects: inspection?.has_defects || false,
            inspection
          });
        }

        return { employee, dailyChecks };
      });

      weeks.push({ weekEnding, employees: employeeWeekData });
    }

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
      const { error: itemsError } = await supabase
        .from('inspection_items')
        .delete()
        .eq('inspection_id', deleteConfirmation.inspection.id);

      if (itemsError) throw itemsError;

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

  const selectedWeekData = weekData.find(w => w.weekEnding === selectedWeek);

  const weekStats = useMemo(() => {
    if (!selectedWeekData) {
      return { totalEmployees: 0, totalPossibleChecks: 0, completedChecks: 0, defectsFound: 0, totalAllChecks: 0, complianceRate: 0 };
    }

    const totalEmployees = selectedWeekData.employees.length;
    const totalPossibleChecks = totalEmployees * 5;
    const completedChecks = selectedWeekData.employees.reduce((sum, emp) =>
      sum + emp.dailyChecks.slice(0, 5).filter(check => check.hasCheck).length, 0
    );
    const defectsFound = selectedWeekData.employees.reduce((sum, emp) => {
      return sum + emp.dailyChecks.filter(check => {
        if (!check.inspection?.inspection_items) return false;
        return check.inspection.inspection_items.some(item =>
          item.status === 'defect' && (!item.defect_status || item.defect_status === 'active')
        );
      }).length;
    }, 0);
    const totalAllChecks = selectedWeekData.employees.reduce((sum, emp) =>
      sum + emp.dailyChecks.filter(check => check.hasCheck).length, 0
    );
    const complianceRate = totalPossibleChecks > 0
      ? Math.round((completedChecks / totalPossibleChecks) * 100)
      : 0;

    return { totalEmployees, totalPossibleChecks, completedChecks, defectsFound, totalAllChecks, complianceRate };
  }, [selectedWeekData]);

  const activeDefects = useMemo(() => {
    if (!selectedWeekData) return [];

    const defects: Array<{
      employee: Employee;
      inspection: VehicleInspection;
      defectItems: any[];
      date: string;
    }> = [];

    selectedWeekData.employees.forEach(empData => {
      empData.dailyChecks.forEach(dayCheck => {
        if (dayCheck.inspection?.inspection_items) {
          const activeDefectItems = dayCheck.inspection.inspection_items.filter(item =>
            item.status === 'defect' && (!item.defect_status || item.defect_status === 'active')
          );

          if (activeDefectItems.length > 0) {
            defects.push({
              employee: empData.employee,
              inspection: dayCheck.inspection,
              defectItems: activeDefectItems,
              date: dayCheck.date
            });
          }
        }
      });
    });

    return defects.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [selectedWeekData]);

  const filteredHistory = useMemo(() => {
    let filtered = [...allInspections];

    if (filters.searchTerm) {
      const term = filters.searchTerm.toLowerCase();
      filtered = filtered.filter(insp =>
        insp.employee?.full_name.toLowerCase().includes(term) ||
        insp.vehicle?.registration_number.toLowerCase().includes(term) ||
        insp.override_vehicle_registration?.toLowerCase().includes(term)
      );
    }

    if (filters.vehicle) {
      filtered = filtered.filter(insp =>
        insp.vehicle?.registration_number.toLowerCase().includes(filters.vehicle.toLowerCase()) ||
        insp.override_vehicle_registration?.toLowerCase().includes(filters.vehicle.toLowerCase())
      );
    }

    if (filters.employee) {
      filtered = filtered.filter(insp =>
        insp.employee?.full_name.toLowerCase().includes(filters.employee.toLowerCase())
      );
    }

    if (filters.dateFrom) {
      filtered = filtered.filter(insp =>
        new Date(insp.submitted_at) >= new Date(filters.dateFrom)
      );
    }

    if (filters.dateTo) {
      filtered = filtered.filter(insp =>
        new Date(insp.submitted_at) <= new Date(filters.dateTo + 'T23:59:59')
      );
    }

    if (filters.status === 'defects') {
      filtered = filtered.filter(insp => insp.has_defects);
    } else if (filters.status === 'clear') {
      filtered = filtered.filter(insp => !insp.has_defects);
    }

    return filtered;
  }, [allInspections, filters]);

  const exportWeekSummary = () => {
    if (!selectedWeekData) return;

    const headers = ['Employee', 'Role', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun', 'Weekday Compliance', 'Total Checks', 'Defects'];
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

    downloadCSV(csvContent, `compliance-summary-week-${selectedWeek}.csv`);
  };

  const exportDetailedInspections = () => {
    if (!selectedWeekData) return;

    const headers = [
      'Date', 'Time', 'Employee', 'Role', 'Vehicle Registration', 'Vehicle Make/Model',
      'Overall Status', 'Defect Count', 'Defect Items', 'Defect Comments'
    ];

    const rows: string[][] = [];

    selectedWeekData.employees.forEach(empData => {
      empData.dailyChecks.forEach(dayCheck => {
        if (dayCheck.hasCheck && dayCheck.inspection) {
          const inspection = dayCheck.inspection;
          const defectItems = inspection.inspection_items?.filter(item => item.status === 'defect') || [];

          rows.push([
            new Date(dayCheck.date).toLocaleDateString('en-GB'),
            new Date(inspection.submitted_at).toLocaleTimeString('en-GB'),
            empData.employee.full_name,
            empData.employee.role,
            inspection.override_vehicle_registration || inspection.vehicle?.registration_number || 'Unknown',
            inspection.vehicle?.make_model || 'Manual Entry',
            inspection.has_defects ? 'DEFECTS FOUND' : 'ALL CLEAR',
            defectItems.length.toString(),
            defectItems.map(item => item.item_name).join('; ') || 'None',
            defectItems.map(item => item.notes || '').filter(Boolean).join('; ') || 'None'
          ]);
        }
      });
    });

    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');

    downloadCSV(csvContent, `detailed-inspections-week-${selectedWeek}.csv`);
  };

  const exportHistoricalData = () => {
    const headers = [
      'Date', 'Time', 'Employee', 'Role', 'Vehicle Registration', 'Vehicle Make/Model',
      'Overall Status', 'Defect Count', 'Defect Items', 'Defect Comments', 'Photo Evidence'
    ];

    const rows = filteredHistory.map(inspection => {
      const defectItems = inspection.inspection_items?.filter(item => item.status === 'defect') || [];
      const hasPhotos = defectItems.some(item => item.photo_url);

      return [
        new Date(inspection.submitted_at).toLocaleDateString('en-GB'),
        new Date(inspection.submitted_at).toLocaleTimeString('en-GB'),
        inspection.employee?.full_name || 'Unknown',
        inspection.employee?.role || '',
        inspection.override_vehicle_registration || inspection.vehicle?.registration_number || 'Unknown',
        inspection.vehicle?.make_model || 'Manual Entry',
        inspection.has_defects ? 'DEFECTS FOUND' : 'ALL CLEAR',
        defectItems.length.toString(),
        defectItems.map(item => item.item_name).join('; ') || 'None',
        defectItems.map(item => item.notes || '').filter(Boolean).join('; ') || 'None',
        hasPhotos ? 'Yes' : 'No'
      ];
    });

    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');

    downloadCSV(csvContent, `vehicle-inspections-export-${new Date().toISOString().split('T')[0]}.csv`);
  };

  const downloadCSV = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const getComplianceColor = (rate: number) => {
    if (rate >= 90) return 'text-emerald-600';
    if (rate >= 70) return 'text-amber-600';
    return 'text-red-600';
  };

  const getComplianceBg = (rate: number) => {
    if (rate >= 90) return 'bg-emerald-50 border-emerald-200';
    if (rate >= 70) return 'bg-amber-50 border-amber-200';
    return 'bg-red-50 border-red-200';
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-lg">
        <div className="px-6 py-5 border-b border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold text-slate-900">Daily Vehicle & Plant Checks</h1>
              <p className="text-sm text-slate-500 mt-1">
                {today.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <select
                value={selectedWeek}
                onChange={(e) => setSelectedWeek(e.target.value)}
                className="px-3 py-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                {weekData.map((week) => (
                  <option key={week.weekEnding} value={week.weekEnding}>
                    Week ending {new Date(week.weekEnding).toLocaleDateString('en-GB', {
                      day: 'numeric', month: 'short', year: 'numeric'
                    })}
                  </option>
                ))}
              </select>
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors"
                title="Refresh data"
              >
                <RefreshCw className={`h-5 w-5 ${refreshing ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-4 divide-x divide-slate-200">
          <div className="px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-50 rounded-lg">
                <TrendingUp className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-semibold text-slate-900">{weekStats.complianceRate}%</p>
                <p className="text-xs text-slate-500 uppercase tracking-wide">Weekday Compliance</p>
              </div>
            </div>
          </div>
          <div className="px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-50 rounded-lg">
                <CheckCircle className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-2xl font-semibold text-slate-900">{weekStats.completedChecks}<span className="text-base text-slate-400">/{weekStats.totalPossibleChecks}</span></p>
                <p className="text-xs text-slate-500 uppercase tracking-wide">Checks Complete</p>
              </div>
            </div>
          </div>
          <div className="px-6 py-4">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${weekStats.defectsFound > 0 ? 'bg-red-50' : 'bg-slate-50'}`}>
                <AlertTriangle className={`h-5 w-5 ${weekStats.defectsFound > 0 ? 'text-red-600' : 'text-slate-400'}`} />
              </div>
              <div>
                <p className="text-2xl font-semibold text-slate-900">{weekStats.defectsFound}</p>
                <p className="text-xs text-slate-500 uppercase tracking-wide">Active Defects</p>
              </div>
            </div>
          </div>
          <div className="px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-slate-50 rounded-lg">
                <User className="h-5 w-5 text-slate-600" />
              </div>
              <div>
                <p className="text-2xl font-semibold text-slate-900">{weekStats.totalEmployees}</p>
                <p className="text-xs text-slate-500 uppercase tracking-wide">Employees</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg">
        <div className="border-b border-slate-200">
          <nav className="flex">
            <button
              onClick={() => setActiveView('compliance')}
              className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeView === 'compliance'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4" />
                Weekly Compliance
              </div>
            </button>
            <button
              onClick={() => setActiveView('defects')}
              className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeView === 'defects'
                  ? 'border-red-600 text-red-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                Defects
                {activeDefects.length > 0 && (
                  <span className="px-1.5 py-0.5 text-xs font-medium bg-red-100 text-red-700 rounded-full">
                    {activeDefects.length}
                  </span>
                )}
              </div>
            </button>
            <button
              onClick={() => setActiveView('history')}
              className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeView === 'history'
                  ? 'border-slate-600 text-slate-900'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Historical Records
              </div>
            </button>
          </nav>
        </div>

        {activeView === 'compliance' && selectedWeekData && (
          <div>
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <p className="text-sm text-slate-600">
                Showing compliance for week ending{' '}
                <span className="font-medium text-slate-900">
                  {new Date(selectedWeek).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                </span>
              </p>
              <div className="flex gap-2">
                <button
                  onClick={exportWeekSummary}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 rounded-md transition-colors"
                >
                  <Download className="h-4 w-4" />
                  Summary CSV
                </button>
                <button
                  onClick={exportDetailedInspections}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 rounded-md transition-colors"
                >
                  <Download className="h-4 w-4" />
                  Detailed CSV
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Employee</th>
                    <th className="px-3 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider w-12">Mon</th>
                    <th className="px-3 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider w-12">Tue</th>
                    <th className="px-3 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider w-12">Wed</th>
                    <th className="px-3 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider w-12">Thu</th>
                    <th className="px-3 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider w-12">Fri</th>
                    <th className="px-3 py-3 text-center text-xs font-medium text-slate-400 uppercase tracking-wider w-12">Sat</th>
                    <th className="px-3 py-3 text-center text-xs font-medium text-slate-400 uppercase tracking-wider w-12">Sun</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Compliance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {selectedWeekData.employees.map((empData) => {
                    const weekdayChecks = empData.dailyChecks.slice(0, 5).filter(check => check.hasCheck).length;
                    const employeeCompliance = Math.round((weekdayChecks / 5) * 100);

                    return (
                      <tr key={empData.employee.id} className="hover:bg-slate-50">
                        <td className="px-6 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center">
                              <span className="text-xs font-medium text-slate-600">
                                {empData.employee.full_name.split(' ').map(n => n[0]).join('')}
                              </span>
                            </div>
                            <div>
                              <p className="text-sm font-medium text-slate-900">{empData.employee.full_name}</p>
                              <p className="text-xs text-slate-500">{empData.employee.role}</p>
                            </div>
                          </div>
                        </td>

                        {empData.dailyChecks.map((dayCheck, idx) => (
                          <td key={dayCheck.date} className={`px-3 py-3 text-center ${idx >= 5 ? 'bg-slate-50/50' : ''}`}>
                            {dayCheck.hasCheck ? (
                              <button
                                onClick={() => dayCheck.inspection && onViewInspection(dayCheck.inspection)}
                                className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
                                  dayCheck.hasDefects
                                    ? 'bg-red-100 hover:bg-red-200 text-red-600'
                                    : 'bg-emerald-100 hover:bg-emerald-200 text-emerald-600'
                                }`}
                                title={dayCheck.hasDefects ? 'Defects found - Click to view' : 'All clear - Click to view'}
                              >
                                {dayCheck.hasDefects ? (
                                  <AlertTriangle className="h-4 w-4" />
                                ) : (
                                  <CheckCircle className="h-4 w-4" />
                                )}
                              </button>
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center mx-auto">
                                <X className="h-4 w-4 text-slate-300" />
                              </div>
                            )}
                          </td>
                        ))}

                        <td className="px-6 py-3 text-right">
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${getComplianceBg(employeeCompliance)} ${getComplianceColor(employeeCompliance)}`}>
                            {weekdayChecks}/5 ({employeeCompliance}%)
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200">
              <div className="flex items-center gap-6 text-xs text-slate-500">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded-full bg-emerald-100 flex items-center justify-center">
                    <CheckCircle className="h-3 w-3 text-emerald-600" />
                  </div>
                  <span>Check complete - All clear</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded-full bg-red-100 flex items-center justify-center">
                    <AlertTriangle className="h-3 w-3 text-red-600" />
                  </div>
                  <span>Check complete - Defects found</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded-full bg-slate-100 flex items-center justify-center">
                    <X className="h-3 w-3 text-slate-300" />
                  </div>
                  <span>No check submitted</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeView === 'defects' && (
          <div className="p-6">
            {activeDefects.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
                  <CheckCircle className="h-6 w-6 text-emerald-600" />
                </div>
                <h3 className="text-sm font-medium text-slate-900 mb-1">No Active Defects</h3>
                <p className="text-sm text-slate-500">All vehicle checks for this week are clear.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {activeDefects.map((defect, idx) => (
                  <div key={idx} className="border border-red-200 rounded-lg overflow-hidden">
                    <div className="px-4 py-3 bg-red-50 border-b border-red-200 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                          <AlertTriangle className="h-5 w-5 text-red-600" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-slate-900">{defect.employee.full_name}</p>
                          <p className="text-xs text-slate-500">
                            {new Date(defect.date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-slate-500">
                          {defect.inspection.override_vehicle_registration || defect.inspection.vehicle?.registration_number}
                        </span>
                        <button
                          onClick={() => onViewInspection(defect.inspection)}
                          className="px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                        >
                          View Details
                        </button>
                      </div>
                    </div>
                    <div className="px-4 py-3">
                      <div className="grid gap-2">
                        {defect.defectItems.map((item, itemIdx) => (
                          <div key={itemIdx} className="flex items-start gap-3 p-3 bg-slate-50 rounded-md">
                            <div className="w-6 h-6 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                              <span className="text-xs font-medium text-red-600">{itemIdx + 1}</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-slate-900">{item.item_name}</p>
                              {item.notes && (
                                <p className="text-xs text-slate-600 mt-1">{item.notes}</p>
                              )}
                            </div>
                            {item.photo_url && (
                              <span className="text-xs text-slate-400 flex items-center gap-1">
                                <FileText className="h-3 w-3" />
                                Photo
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeView === 'history' && (
          <div>
            <div className="px-6 py-4 border-b border-slate-200">
              <div className="flex items-center justify-between mb-4">
                <div className="flex-1 max-w-md">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search by employee or vehicle..."
                      value={filters.searchTerm}
                      onChange={(e) => setFilters(prev => ({ ...prev, searchTerm: e.target.value }))}
                      className="w-full pl-10 pr-4 py-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowFilters(!showFilters)}
                    className={`flex items-center gap-2 px-3 py-2 text-sm rounded-md transition-colors ${
                      showFilters ? 'bg-slate-200 text-slate-900' : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <Filter className="h-4 w-4" />
                    Filters
                    <ChevronDown className={`h-4 w-4 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
                  </button>
                  <button
                    onClick={exportHistoricalData}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-white bg-slate-800 hover:bg-slate-700 rounded-md transition-colors"
                  >
                    <Download className="h-4 w-4" />
                    Export Results
                  </button>
                </div>
              </div>

              {showFilters && (
                <div className="grid grid-cols-5 gap-4 pt-4 border-t border-slate-200">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Vehicle</label>
                    <input
                      type="text"
                      placeholder="Registration..."
                      value={filters.vehicle}
                      onChange={(e) => setFilters(prev => ({ ...prev, vehicle: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Employee</label>
                    <input
                      type="text"
                      placeholder="Name..."
                      value={filters.employee}
                      onChange={(e) => setFilters(prev => ({ ...prev, employee: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Date From</label>
                    <input
                      type="date"
                      value={filters.dateFrom}
                      onChange={(e) => setFilters(prev => ({ ...prev, dateFrom: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Date To</label>
                    <input
                      type="date"
                      value={filters.dateTo}
                      onChange={(e) => setFilters(prev => ({ ...prev, dateTo: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Status</label>
                    <select
                      value={filters.status}
                      onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value as any }))}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="all">All</option>
                      <option value="defects">With Defects</option>
                      <option value="clear">All Clear</option>
                    </select>
                  </div>
                </div>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Date</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Employee</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Vehicle</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredHistory.slice(0, 50).map((inspection) => (
                    <tr key={inspection.id} className="hover:bg-slate-50">
                      <td className="px-6 py-4">
                        <div>
                          <p className="text-sm font-medium text-slate-900">
                            {new Date(inspection.submitted_at).toLocaleDateString('en-GB')}
                          </p>
                          <p className="text-xs text-slate-500">
                            {new Date(inspection.submitted_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm text-slate-900">{inspection.employee?.full_name || 'Unknown'}</p>
                        <p className="text-xs text-slate-500">{inspection.employee?.role || ''}</p>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm text-slate-900">
                          {inspection.override_vehicle_registration || inspection.vehicle?.registration_number}
                        </p>
                        <p className="text-xs text-slate-500">{inspection.vehicle?.make_model || 'Manual Entry'}</p>
                      </td>
                      <td className="px-6 py-4">
                        {inspection.has_defects ? (
                          <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-red-50 text-red-700 rounded-full">
                            <AlertTriangle className="h-3 w-3" />
                            Defects
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-emerald-50 text-emerald-700 rounded-full">
                            <CheckCircle className="h-3 w-3" />
                            Clear
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => onViewInspection(inspection)}
                            className="p-1.5 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                            title="View details"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteInspection(inspection)}
                            className="p-1.5 text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {filteredHistory.length > 50 && (
              <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 text-center">
                <p className="text-sm text-slate-500">
                  Showing 50 of {filteredHistory.length} records. Use filters to narrow results or export all data.
                </p>
              </div>
            )}

            {filteredHistory.length === 0 && (
              <div className="text-center py-12">
                <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
                  <FileText className="h-6 w-6 text-slate-400" />
                </div>
                <h3 className="text-sm font-medium text-slate-900 mb-1">No Records Found</h3>
                <p className="text-sm text-slate-500">Try adjusting your search or filter criteria.</p>
              </div>
            )}
          </div>
        )}
      </div>

      {deleteConfirmation.show && deleteConfirmation.inspection && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="p-6">
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
                <Trash2 className="h-6 w-6 text-red-600" />
              </div>

              <h3 className="text-lg font-semibold text-slate-900 text-center mb-2">
                Delete Vehicle & Plant Check
              </h3>

              <p className="text-sm text-slate-600 text-center mb-6">
                This action cannot be undone. The inspection record and all associated data will be permanently removed.
              </p>

              <div className="bg-slate-50 rounded-md p-4 mb-6">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-slate-500">Vehicle</p>
                    <p className="font-medium text-slate-900">
                      {deleteConfirmation.inspection.override_vehicle_registration || deleteConfirmation.inspection.vehicle?.registration_number}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-500">Employee</p>
                    <p className="font-medium text-slate-900">
                      {deleteConfirmation.inspection.employee?.full_name}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-500">Date</p>
                    <p className="font-medium text-slate-900">
                      {new Date(deleteConfirmation.inspection.submitted_at).toLocaleDateString('en-GB')}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-500">Status</p>
                    <p className={`font-medium ${deleteConfirmation.inspection.has_defects ? 'text-red-600' : 'text-emerald-600'}`}>
                      {deleteConfirmation.inspection.has_defects ? 'Has Defects' : 'All Clear'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={cancelDelete}
                  disabled={deleting}
                  className="flex-1 px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDelete}
                  disabled={deleting}
                  className="flex-1 px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md transition-colors flex items-center justify-center gap-2"
                >
                  {deleting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    <>
                      <Trash2 className="h-4 w-4" />
                      Delete
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
