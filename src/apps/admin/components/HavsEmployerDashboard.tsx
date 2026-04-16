import { useState, useEffect, useMemo } from 'react';
import {
  Calendar,
  Users,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  Eye,
  ChevronLeft,
  ChevronRight,
  FileCheck,
  FileX,
  Search,
  ChevronDown,
  Download,
  X,
} from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { HavsWeekDetail } from './HavsWeekDetail';

interface WeekOverview {
  week_id: string;
  week_ending: string;
  week_status: string;
  week_submitted_at: string | null;
  last_saved_at: string | null;
  revision_number: number;
  ganger_id: string;
  ganger_name: string;
  ganger_role: string;
  total_members: number;
  operative_count: number;
  total_gang_minutes: number;
  created_at: string;
}

interface Employee {
  id: string;
  full_name: string;
  role: string;
}

interface WeekDate {
  date: string;
  label: string;
  shortLabel: string;
}

export const HavsEmployerDashboard: React.FC = () => {
  const [weeks, setWeeks] = useState<WeekOverview[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedWeekId, setSelectedWeekId] = useState<string | null>(null);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [gangerSearch, setGangerSearch] = useState('');
  const [selectedLookupGangerId, setSelectedLookupGangerId] = useState<string | null>(null);
  const [showGangerDropdown, setShowGangerDropdown] = useState(false);

  const getWeeksInMonth = (date: Date): WeekDate[] => {
    const result: WeekDate[] = [];
    const year = date.getFullYear();
    const month = date.getMonth();

    const firstOfMonth = new Date(year, month, 1);
    let firstSunday = new Date(firstOfMonth);
    const dayOfWeek = firstOfMonth.getDay();
    if (dayOfWeek !== 0) {
      firstSunday.setDate(firstOfMonth.getDate() + (7 - dayOfWeek));
    }

    if (firstSunday.getMonth() !== month) {
      firstSunday = new Date(year, month + 1, 0);
      while (firstSunday.getDay() !== 0) {
        firstSunday.setDate(firstSunday.getDate() - 1);
      }
    }

    let currentSunday = new Date(firstSunday);
    while (currentSunday.getMonth() === month || result.length === 0) {
      const dateStr = `${currentSunday.getFullYear()}-${String(currentSunday.getMonth() + 1).padStart(2, '0')}-${String(currentSunday.getDate()).padStart(2, '0')}`;

      result.push({
        date: dateStr,
        label: currentSunday.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
        shortLabel: currentSunday.getDate().toString(),
      });

      currentSunday.setDate(currentSunday.getDate() + 7);
      if (result.length >= 5) break;
    }

    return result;
  };

  const monthWeeks = getWeeksInMonth(currentMonth);
  const monthWeekDates = useMemo(() => new Set(monthWeeks.map((w) => w.date)), [monthWeeks]);

  useEffect(() => {
    loadData();
  }, [currentMonth]);

  const loadData = async () => {
    try {
      setLoading(true);

      const [weeksRes, employeesRes] = await Promise.all([
        supabase
          .from('havs_employer_weekly_overview')
          .select('*')
          .order('week_ending', { ascending: false }),
        supabase
          .from('employees')
          .select('id, full_name, role')
          .in('role', ['Ganger', 'Operative'])
          .order('full_name'),
      ]);

      if (weeksRes.error) throw weeksRes.error;
      if (employeesRes.error) throw employeesRes.error;

      setWeeks(weeksRes.data || []);
      setEmployees(employeesRes.data || []);
    } catch (error) {
      console.error('Error loading HAVS data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const prevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  };

  const gangers = employees.filter((e) => e.role === 'Ganger');

  const monthStats = useMemo(() => {
    const now = new Date();
    let submitted = 0;
    let draft = 0;
    let missingCount = 0;

    gangers.forEach((ganger) => {
      monthWeeks.forEach((week) => {
        const record = weeks.find(
          (w) => w.ganger_id === ganger.id && w.week_ending === week.date
        );
        if (record) {
          if (record.week_status === 'submitted') submitted++;
          else draft++;
        } else {
          const weekDate = new Date(week.date);
          if (weekDate < now) missingCount++;
        }
      });
    });

    return {
      submitted,
      draft,
      missing: missingCount,
      activeGangers: gangers.length,
    };
  }, [weeks, gangers, monthWeeks]);

  const getWeekStatus = (
    gangerId: string,
    weekEnding: string
  ): { status: string; weekId: string | null; minutes: number } | null => {
    const week = weeks.find((w) => w.ganger_id === gangerId && w.week_ending === weekEnding);
    if (!week) return null;
    return {
      status: week.week_status,
      weekId: week.week_id,
      minutes: week.total_gang_minutes,
    };
  };

  const getStatusCell = (gangerId: string, weekEnding: string) => {
    const result = getWeekStatus(gangerId, weekEnding);
    const isPast = new Date(weekEnding) < new Date();

    if (!result) {
      if (isPast) {
        return (
          <div className="flex items-center justify-center">
            <div
              className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center"
              title="Missing"
            >
              <FileX className="w-4 h-4 text-red-500" />
            </div>
          </div>
        );
      }
      return (
        <div className="flex items-center justify-center">
          <div
            className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center"
            title="Not started"
          >
            <span className="text-slate-400 text-xs">-</span>
          </div>
        </div>
      );
    }

    if (result.status === 'submitted') {
      return (
        <button
          onClick={() => setSelectedWeekId(result.weekId)}
          className="flex items-center justify-center group"
          title={`Submitted - ${Math.floor(result.minutes / 60)}h ${result.minutes % 60}m exposure`}
        >
          <div className="w-8 h-8 rounded-full bg-emerald-100 group-hover:bg-emerald-200 flex items-center justify-center transition-colors">
            <CheckCircle className="w-4 h-4 text-emerald-600" />
          </div>
        </button>
      );
    }

    return (
      <button
        onClick={() => setSelectedWeekId(result.weekId)}
        className="flex items-center justify-center group"
        title={`Draft - ${Math.floor(result.minutes / 60)}h ${result.minutes % 60}m exposure`}
      >
        <div className="w-8 h-8 rounded-full bg-amber-100 group-hover:bg-amber-200 flex items-center justify-center transition-colors">
          <AlertCircle className="w-4 h-4 text-amber-600" />
        </div>
      </button>
    );
  };

  const currentWeekEnding = (() => {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const daysUntilSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
    const sunday = new Date(now);
    sunday.setDate(now.getDate() + daysUntilSunday);
    return sunday.toISOString().split('T')[0];
  })();

  const filteredGangerOptions = gangers.filter((g) =>
    g.full_name.toLowerCase().includes(gangerSearch.toLowerCase())
  );

  const selectedLookupGanger = gangers.find((g) => g.id === selectedLookupGangerId);
  const selectedLookupGangerWeeks = useMemo(() => {
    if (!selectedLookupGangerId) return [];
    return weeks
      .filter((w) => w.ganger_id === selectedLookupGangerId)
      .sort((a, b) => b.week_ending.localeCompare(a.week_ending));
  }, [weeks, selectedLookupGangerId]);

  const handleExportCSV = async (weekId: string, gangerName: string) => {
    try {
      const { data, error } = await supabase.rpc('get_havs_csv_export', {
        week_id_param: weekId,
      });
      if (error) throw error;
      if (!data || data.length === 0) return;
      const headers = [
        'Week Ending',
        'Ganger',
        'Member Name',
        'Member Type',
        'Source',
        'Role',
        'Equipment',
        'Category',
        'Day',
        'Minutes',
        'Total Member Minutes',
        'Status',
        'Submitted At',
      ];
      const csvRows = [
        headers.join(','),
        ...data.map((row: any) =>
          [
            row.week_ending,
            `"${row.ganger_name}"`,
            `"${row.member_name}"`,
            row.member_type,
            row.member_source,
            `"${row.role}"`,
            `"${row.equipment_name || ''}"`,
            row.equipment_category || '',
            row.day_of_week || '',
            row.minutes || 0,
            row.total_member_minutes || 0,
            row.status,
            row.submitted_at || '',
          ].join(',')
        ),
      ];
      const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `HAVS_${gangerName.replace(/\s+/g, '_')}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export error:', err);
    }
  };

  const monthLabel = currentMonth.toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
  });

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center py-12">
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 border-3 border-slate-200 border-t-slate-600 rounded-full animate-spin" />
            <p className="text-slate-700">Loading HAVS records...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">HAVS Compliance</h2>
          <p className="text-sm text-slate-500 mt-1">
            Hand Arm Vibration Syndrome exposure tracking
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Month-specific summary cards */}
      <div>
        <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">
          {monthLabel}
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500">Submitted</p>
                <p className="text-3xl font-bold text-slate-900 mt-1">{monthStats.submitted}</p>
              </div>
              <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center">
                <FileCheck className="w-6 h-6 text-emerald-600" />
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500">In Progress</p>
                <p className="text-3xl font-bold text-slate-900 mt-1">{monthStats.draft}</p>
              </div>
              <div className="w-12 h-12 bg-amber-50 rounded-xl flex items-center justify-center">
                <AlertCircle className="w-6 h-6 text-amber-600" />
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500">Missing</p>
                <p className="text-3xl font-bold text-slate-900 mt-1">{monthStats.missing}</p>
              </div>
              <div className="w-12 h-12 bg-red-50 rounded-xl flex items-center justify-center">
                <FileX className="w-6 h-6 text-red-500" />
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500">Active Gangers</p>
                <p className="text-3xl font-bold text-slate-900 mt-1">
                  {monthStats.activeGangers}
                </p>
              </div>
              <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center">
                <Users className="w-6 h-6 text-slate-600" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Monthly overview table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Calendar className="w-5 h-5 text-slate-400" />
            <h3 className="font-semibold text-slate-900">Monthly Overview</h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={prevMonth}
              className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <ChevronLeft className="w-5 h-5 text-slate-600" />
            </button>
            <span className="text-sm font-medium text-slate-900 min-w-[140px] text-center">
              {monthLabel}
            </span>
            <button
              onClick={nextMonth}
              className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <ChevronRight className="w-5 h-5 text-slate-600" />
            </button>
          </div>
        </div>

        <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 flex items-center gap-6 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-emerald-100 flex items-center justify-center">
              <CheckCircle className="w-2.5 h-2.5 text-emerald-600" />
            </div>
            <span className="text-slate-600">Submitted</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-amber-100 flex items-center justify-center">
              <AlertCircle className="w-2.5 h-2.5 text-amber-600" />
            </div>
            <span className="text-slate-600">Draft</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-red-100 flex items-center justify-center">
              <FileX className="w-2.5 h-2.5 text-red-500" />
            </div>
            <span className="text-slate-600">Missing</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-slate-100 flex items-center justify-center">
              <span className="text-slate-400 text-[8px]">-</span>
            </div>
            <span className="text-slate-600">Future</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider w-64">
                  Ganger
                </th>
                {monthWeeks.map((week) => (
                  <th
                    key={week.date}
                    className={`text-center px-4 py-4 text-xs font-semibold uppercase tracking-wider min-w-[100px] ${
                      week.date === currentWeekEnding ? 'text-blue-600 bg-blue-50' : 'text-slate-500'
                    }`}
                  >
                    <div className="flex flex-col items-center">
                      <span>Week {week.label}</span>
                      {week.date === currentWeekEnding && (
                        <span className="text-[10px] font-medium text-blue-500 mt-0.5">
                          Current
                        </span>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {gangers.length === 0 ? (
                <tr>
                  <td colSpan={monthWeeks.length + 1} className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <Users className="w-8 h-8 text-slate-300" />
                      <p className="text-slate-500">No gangers found</p>
                    </div>
                  </td>
                </tr>
              ) : (
                gangers.map((ganger) => {
                  const gangerMonthWeeks = weeks.filter(
                    (w) => w.ganger_id === ganger.id && monthWeekDates.has(w.week_ending)
                  );
                  const totalMinutes = gangerMonthWeeks.reduce(
                    (sum, w) => sum + Number(w.total_gang_minutes),
                    0
                  );

                  return (
                    <tr key={ganger.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center">
                            <span className="text-sm font-semibold text-slate-600">
                              {ganger.full_name
                                .split(' ')
                                .map((n) => n[0])
                                .join('')
                                .toUpperCase()}
                            </span>
                          </div>
                          <div>
                            <p className="text-sm font-medium text-slate-900">
                              {ganger.full_name}
                            </p>
                            <p className="text-xs text-slate-500">
                              {totalMinutes > 0
                                ? `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m total`
                                : 'No exposure recorded'}
                            </p>
                          </div>
                        </div>
                      </td>
                      {monthWeeks.map((week) => (
                        <td
                          key={week.date}
                          className={`px-4 py-4 ${
                            week.date === currentWeekEnding ? 'bg-blue-50/50' : ''
                          }`}
                        >
                          {getStatusCell(ganger.id, week.date)}
                        </td>
                      ))}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Ganger lookup section */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200">
          <h3 className="font-semibold text-slate-900">Ganger Lookup</h3>
          <p className="text-sm text-slate-500 mt-1">
            Search for a ganger to view their HAVS submission history
          </p>
        </div>

        <div className="px-6 py-4">
          <div className="relative max-w-sm">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
                type="text"
                value={gangerSearch}
                onChange={(e) => {
                  setGangerSearch(e.target.value);
                  setShowGangerDropdown(true);
                }}
                onFocus={() => setShowGangerDropdown(true)}
                placeholder="Search by ganger name..."
                className="w-full pl-10 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 transition-all"
              />
              {selectedLookupGangerId ? (
                <button
                  onClick={() => {
                    setSelectedLookupGangerId(null);
                    setGangerSearch('');
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 hover:bg-slate-200 rounded transition-colors"
                >
                  <X className="w-3.5 h-3.5 text-slate-400" />
                </button>
              ) : (
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              )}
            </div>

            {showGangerDropdown && !selectedLookupGangerId && (
              <div className="absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
                {filteredGangerOptions.length === 0 ? (
                  <div className="px-4 py-3 text-sm text-slate-500">No gangers found</div>
                ) : (
                  filteredGangerOptions.map((g) => (
                    <button
                      key={g.id}
                      onClick={() => {
                        setSelectedLookupGangerId(g.id);
                        setGangerSearch(g.full_name);
                        setShowGangerDropdown(false);
                      }}
                      className="w-full text-left px-4 py-2.5 text-sm text-slate-900 hover:bg-slate-50 transition-colors flex items-center gap-3"
                    >
                      <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center flex-shrink-0">
                        <span className="text-[11px] font-semibold text-slate-600">
                          {g.full_name
                            .split(' ')
                            .map((n) => n[0])
                            .join('')
                            .toUpperCase()}
                        </span>
                      </div>
                      {g.full_name}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        {!selectedLookupGangerId && (
          <div className="px-6 pb-6">
            <div className="rounded-lg border border-dashed border-slate-200 py-10 flex flex-col items-center gap-2">
              <Users className="w-7 h-7 text-slate-300" />
              <p className="text-sm text-slate-400">Select a ganger to view their HAVS history</p>
            </div>
          </div>
        )}

        {selectedLookupGanger && (
          <div className="px-6 pb-6">
            <div className="mb-3 flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-slate-200 flex items-center justify-center">
                <span className="text-xs font-semibold text-slate-600">
                  {selectedLookupGanger.full_name
                    .split(' ')
                    .map((n) => n[0])
                    .join('')
                    .toUpperCase()}
                </span>
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  {selectedLookupGanger.full_name}
                </p>
                <p className="text-xs text-slate-500">
                  {selectedLookupGangerWeeks.length} record
                  {selectedLookupGangerWeeks.length !== 1 ? 's' : ''}
                </p>
              </div>
            </div>

            {selectedLookupGangerWeeks.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 py-8 text-center">
                <p className="text-sm text-slate-400">
                  No HAVS records found for this ganger
                </p>
              </div>
            ) : (
              <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 overflow-hidden">
                {selectedLookupGangerWeeks.map((week) => {
                  const hours = Math.floor(Number(week.total_gang_minutes) / 60);
                  const mins = Number(week.total_gang_minutes) % 60;

                  return (
                    <div
                      key={week.week_id}
                      className="px-4 py-3 flex items-center justify-between hover:bg-slate-50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center ${
                            week.week_status === 'submitted'
                              ? 'bg-emerald-100'
                              : 'bg-amber-100'
                          }`}
                        >
                          {week.week_status === 'submitted' ? (
                            <CheckCircle className="w-4 h-4 text-emerald-600" />
                          ) : (
                            <AlertCircle className="w-4 h-4 text-amber-600" />
                          )}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-slate-900">
                            WE{' '}
                            {new Date(week.week_ending).toLocaleDateString('en-GB', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                            })}
                          </p>
                          <p className="text-xs text-slate-500">
                            {week.total_members} member
                            {Number(week.total_members) !== 1 ? 's' : ''}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right hidden sm:block">
                          <p className="text-sm font-medium text-slate-900">
                            {hours}h {mins}m
                          </p>
                        </div>
                        <span
                          className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                            week.week_status === 'submitted'
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-amber-100 text-amber-700'
                          }`}
                        >
                          {week.week_status === 'submitted' ? 'Submitted' : 'Draft'}
                        </span>
                        <button
                          onClick={() => setSelectedWeekId(week.week_id)}
                          className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors"
                          title="View details"
                        >
                          <Eye className="w-4 h-4 text-slate-400" />
                        </button>
                        <button
                          onClick={() =>
                            handleExportCSV(
                              week.week_id,
                              selectedLookupGanger?.full_name || ''
                            )
                          }
                          className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors"
                          title="Download CSV"
                        >
                          <Download className="w-4 h-4 text-slate-400" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {selectedWeekId && (
        <HavsWeekDetail weekId={selectedWeekId} onClose={() => setSelectedWeekId(null)} />
      )}
    </div>
  );
};
