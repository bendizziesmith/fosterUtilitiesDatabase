import { useState, useEffect } from 'react';
import {
  Calendar,
  Users,
  Clock,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  Eye,
  ChevronLeft,
  ChevronRight,
  FileCheck,
  FileX
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

  const getWeeksInMonth = (date: Date): WeekDate[] => {
    const weeks: WeekDate[] = [];
    const year = date.getFullYear();
    const month = date.getMonth();

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    let current = new Date(firstDay);
    const dayOfWeek = current.getDay();
    if (dayOfWeek !== 0) {
      current.setDate(current.getDate() + (7 - dayOfWeek));
    }

    if (current > lastDay) {
      current = new Date(firstDay);
      current.setDate(current.getDate() - dayOfWeek);
      if (current.getMonth() !== month) {
        current.setDate(current.getDate() + 7);
      }
    }

    const startDate = new Date(year, month, 1);
    startDate.setDate(startDate.getDate() - startDate.getDay());

    for (let i = 0; i < 5; i++) {
      const weekEnd = new Date(startDate);
      weekEnd.setDate(startDate.getDate() + (i * 7) + 7);

      if (weekEnd.getMonth() === month || (i === 0 && weekEnd.getDate() <= 7)) {
        const dateStr = weekEnd.toISOString().split('T')[0];
        weeks.push({
          date: dateStr,
          label: weekEnd.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
          shortLabel: weekEnd.getDate().toString()
        });
      }
    }

    const uniqueWeeks = weeks.filter((w, i, arr) =>
      arr.findIndex(x => x.date === w.date) === i
    );

    return uniqueWeeks.slice(0, 5);
  };

  const monthWeeks = getWeeksInMonth(currentMonth);

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
          .order('full_name')
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

  const getWeekStatus = (gangerId: string, weekEnding: string): { status: string; weekId: string | null; minutes: number } | null => {
    const week = weeks.find(w => w.ganger_id === gangerId && w.week_ending === weekEnding);
    if (!week) return null;
    return {
      status: week.week_status,
      weekId: week.week_id,
      minutes: week.total_gang_minutes
    };
  };

  const getStatusCell = (gangerId: string, weekEnding: string) => {
    const result = getWeekStatus(gangerId, weekEnding);
    const isPast = new Date(weekEnding) < new Date();

    if (!result) {
      if (isPast) {
        return (
          <div className="flex items-center justify-center">
            <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center" title="Missing">
              <FileX className="w-4 h-4 text-red-500" />
            </div>
          </div>
        );
      }
      return (
        <div className="flex items-center justify-center">
          <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center" title="Not started">
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

  const gangers = employees.filter(e => e.role === 'Ganger');

  const stats = {
    totalSubmitted: weeks.filter(w => w.week_status === 'submitted').length,
    totalDraft: weeks.filter(w => w.week_status === 'draft').length,
    totalMinutes: weeks.reduce((sum, w) => sum + Number(w.total_gang_minutes), 0),
    totalMembers: weeks.reduce((sum, w) => sum + Number(w.total_members), 0)
  };

  const currentWeekEnding = (() => {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const daysUntilSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
    const sunday = new Date(now);
    sunday.setDate(now.getDate() + daysUntilSunday);
    return sunday.toISOString().split('T')[0];
  })();

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

      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">Submitted</p>
              <p className="text-3xl font-bold text-slate-900 mt-1">{stats.totalSubmitted}</p>
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
              <p className="text-3xl font-bold text-slate-900 mt-1">{stats.totalDraft}</p>
            </div>
            <div className="w-12 h-12 bg-amber-50 rounded-xl flex items-center justify-center">
              <AlertCircle className="w-6 h-6 text-amber-600" />
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">Total Members</p>
              <p className="text-3xl font-bold text-slate-900 mt-1">{stats.totalMembers}</p>
            </div>
            <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center">
              <Users className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">Total Exposure</p>
              <p className="text-3xl font-bold text-slate-900 mt-1">
                {Math.floor(stats.totalMinutes / 60)}h {stats.totalMinutes % 60}m
              </p>
            </div>
            <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center">
              <Clock className="w-6 h-6 text-slate-600" />
            </div>
          </div>
        </div>
      </div>

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
              {currentMonth.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
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
                      week.date === currentWeekEnding
                        ? 'text-blue-600 bg-blue-50'
                        : 'text-slate-500'
                    }`}
                  >
                    <div className="flex flex-col items-center">
                      <span>Week {week.label}</span>
                      {week.date === currentWeekEnding && (
                        <span className="text-[10px] font-medium text-blue-500 mt-0.5">Current</span>
                      )}
                    </div>
                  </th>
                ))}
                <th className="text-center px-4 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {gangers.length === 0 ? (
                <tr>
                  <td colSpan={monthWeeks.length + 2} className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <Users className="w-8 h-8 text-slate-300" />
                      <p className="text-slate-500">No gangers found</p>
                    </div>
                  </td>
                </tr>
              ) : (
                gangers.map((ganger) => {
                  const gangerWeeks = weeks.filter(w => w.ganger_id === ganger.id);
                  const totalMinutes = gangerWeeks.reduce((sum, w) => sum + Number(w.total_gang_minutes), 0);

                  return (
                    <tr key={ganger.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center">
                            <span className="text-sm font-semibold text-slate-600">
                              {ganger.full_name.split(' ').map(n => n[0]).join('').toUpperCase()}
                            </span>
                          </div>
                          <div>
                            <p className="text-sm font-medium text-slate-900">{ganger.full_name}</p>
                            <p className="text-xs text-slate-500">
                              {totalMinutes > 0
                                ? `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m total`
                                : 'No exposure recorded'
                              }
                            </p>
                          </div>
                        </div>
                      </td>
                      {monthWeeks.map((week) => (
                        <td key={week.date} className={`px-4 py-4 ${
                          week.date === currentWeekEnding ? 'bg-blue-50/50' : ''
                        }`}>
                          {getStatusCell(ganger.id, week.date)}
                        </td>
                      ))}
                      <td className="px-4 py-4 text-center">
                        <button
                          onClick={() => {
                            const latestWeek = gangerWeeks[0];
                            if (latestWeek) setSelectedWeekId(latestWeek.week_id);
                          }}
                          disabled={gangerWeeks.length === 0}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Eye className="w-4 h-4" />
                          View
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200">
          <h3 className="font-semibold text-slate-900">Recent Submissions</h3>
          <p className="text-sm text-slate-500 mt-1">Latest HAVS records across all gangers</p>
        </div>
        <div className="divide-y divide-slate-100">
          {weeks.slice(0, 10).map((week) => {
            const hours = Math.floor(Number(week.total_gang_minutes) / 60);
            const mins = Number(week.total_gang_minutes) % 60;

            return (
              <div
                key={week.week_id}
                className="px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    week.week_status === 'submitted' ? 'bg-emerald-100' : 'bg-amber-100'
                  }`}>
                    {week.week_status === 'submitted'
                      ? <CheckCircle className="w-5 h-5 text-emerald-600" />
                      : <AlertCircle className="w-5 h-5 text-amber-600" />
                    }
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-900">{week.ganger_name}</p>
                    <p className="text-xs text-slate-500">
                      Week ending {new Date(week.week_ending).toLocaleDateString('en-GB', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric'
                      })}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <p className="text-sm font-medium text-slate-900">{hours}h {mins}m</p>
                    <p className="text-xs text-slate-500">{week.total_members} members</p>
                  </div>
                  <span className={`px-2.5 py-1 text-xs font-medium rounded-full ${
                    week.week_status === 'submitted'
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-amber-100 text-amber-700'
                  }`}>
                    {week.week_status === 'submitted' ? 'Submitted' : 'Draft'}
                  </span>
                  <button
                    onClick={() => setSelectedWeekId(week.week_id)}
                    className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                  >
                    <Eye className="w-4 h-4 text-slate-400" />
                  </button>
                </div>
              </div>
            );
          })}
          {weeks.length === 0 && (
            <div className="px-6 py-12 text-center">
              <p className="text-slate-500">No HAVS records found</p>
            </div>
          )}
        </div>
      </div>

      {selectedWeekId && (
        <HavsWeekDetail weekId={selectedWeekId} onClose={() => setSelectedWeekId(null)} />
      )}
    </div>
  );
};
