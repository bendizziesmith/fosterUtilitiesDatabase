import React, { useState, useEffect } from 'react';
import { Calendar, Users, Clock, CheckCircle, AlertCircle, RefreshCw, FileText, Eye } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { HavsWeekDetail } from './HavsWeekDetail';
import { HavsWeeklyComplianceTable } from './HavsWeeklyComplianceTable';

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

interface FilterState {
  weekEnding: string;
  status: 'all' | 'draft' | 'submitted';
  ganger: string;
}

export const HavsEmployerDashboard: React.FC = () => {
  const [weeks, setWeeks] = useState<WeekOverview[]>([]);
  const [filteredWeeks, setFilteredWeeks] = useState<WeekOverview[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedWeekId, setSelectedWeekId] = useState<string | null>(null);
  const [activeWeekEnding, setActiveWeekEnding] = useState<string | null>(null);

  const [filters, setFilters] = useState<FilterState>({
    weekEnding: '',
    status: 'all',
    ganger: 'all',
  });

  const [availableWeeks, setAvailableWeeks] = useState<string[]>([]);
  const [availableGangers, setAvailableGangers] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    initializeDashboard();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [weeks, filters]);

  const initializeDashboard = async () => {
    try {
      const { data: activeWeek, error: weekError } = await supabase.rpc('get_active_havs_week');

      if (weekError) throw weekError;

      setActiveWeekEnding(activeWeek);
      setFilters(prev => ({ ...prev, weekEnding: activeWeek }));

      await loadWeeks();
    } catch (error) {
      console.error('Error initializing dashboard:', error);
      await loadWeeks();
    }
  };

  const loadWeeks = async () => {
    try {
      setLoading(true);

      const { data, error } = await supabase
        .from('havs_employer_weekly_overview')
        .select('*')
        .order('week_ending', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) throw error;

      setWeeks(data || []);

      const uniqueWeeks = Array.from(new Set((data || []).map((w) => w.week_ending))).sort().reverse();
      setAvailableWeeks(uniqueWeeks);

      const uniqueGangers = Array.from(
        new Map((data || []).map((w) => [w.ganger_id, { id: w.ganger_id, name: w.ganger_name }])).values()
      ).sort((a, b) => a.name.localeCompare(b.name));
      setAvailableGangers(uniqueGangers);
    } catch (error) {
      console.error('Error loading HAVS weeks:', error);
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...weeks];

    if (filters.weekEnding && filters.weekEnding !== 'all') {
      filtered = filtered.filter((w) => w.week_ending === filters.weekEnding);
    }

    if (filters.status !== 'all') {
      filtered = filtered.filter((w) => w.week_status === filters.status);
    }

    if (filters.ganger !== 'all') {
      filtered = filtered.filter((w) => w.ganger_id === filters.ganger);
    }

    setFilteredWeeks(filtered);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadWeeks();
    setRefreshing(false);
  };

  const getStatusBadge = (status: string) => {
    if (status === 'submitted') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-green-700 bg-green-100 rounded">
          <CheckCircle className="h-3.5 w-3.5" />
          Submitted
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-amber-700 bg-amber-100 rounded">
        <AlertCircle className="h-3.5 w-3.5" />
        Draft
      </span>
    );
  };

  const totalSubmitted = filteredWeeks.filter((w) => w.week_status === 'submitted').length;
  const totalDraft = filteredWeeks.filter((w) => w.week_status === 'draft').length;
  const totalMembers = filteredWeeks.reduce((sum, w) => sum + Number(w.total_members), 0);
  const totalMinutes = filteredWeeks.reduce((sum, w) => sum + Number(w.total_gang_minutes), 0);
  const totalHours = Math.floor(totalMinutes / 60);
  const remainingMinutes = totalMinutes % 60;

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center py-12">
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 border-3 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
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
          <h2 className="text-2xl font-bold text-slate-900">HAVS Compliance Dashboard</h2>
          <p className="text-sm text-slate-600 mt-1">
            Legal health & safety exposure records
            {activeWeekEnding && (
              <span className="ml-2 font-medium text-blue-600">
                • Active Week: {new Date(activeWeekEnding).toLocaleDateString('en-GB', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric'
                })}
              </span>
            )}
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {filters.weekEnding && (
        <HavsWeeklyComplianceTable
          weekEnding={filters.weekEnding}
          onViewDetails={(employeeId, havsWeekId) => {
            if (havsWeekId) {
              setSelectedWeekId(havsWeekId);
            }
          }}
        />
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <CheckCircle className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wide">Submitted</p>
              <p className="text-2xl font-bold text-slate-900">{totalSubmitted}</p>
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-100 rounded-lg">
              <AlertCircle className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wide">Draft</p>
              <p className="text-2xl font-bold text-slate-900">{totalDraft}</p>
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Users className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wide">Total Members</p>
              <p className="text-2xl font-bold text-slate-900">{totalMembers}</p>
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-violet-100 rounded-lg">
              <Clock className="h-5 w-5 text-violet-600" />
            </div>
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wide">Total Exposure</p>
              <p className="text-2xl font-bold text-slate-900">
                {totalHours}h {remainingMinutes}m
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg p-4">
        <div className="flex items-center gap-3 mb-4">
          <FileText className="h-5 w-5 text-slate-600" />
          <h3 className="font-semibold text-slate-900">Historical Lookup & Filters</h3>
          <span className="text-xs text-slate-500">(Active week shown by default)</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Week Ending</label>
            <select
              value={filters.weekEnding}
              onChange={(e) => setFilters({ ...filters, weekEnding: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {availableWeeks.map((week) => (
                <option key={week} value={week}>
                  {new Date(week).toLocaleDateString('en-GB')}
                  {week === activeWeekEnding && ' (Active Week)'}
                </option>
              ))}
              <option value="all">View All Weeks (Historical)</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
            <select
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value as any })}
              className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Statuses</option>
              <option value="submitted">Submitted</option>
              <option value="draft">Draft</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Ganger</label>
            <select
              value={filters.ganger}
              onChange={(e) => setFilters({ ...filters, ganger: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Gangers</option>
              {availableGangers.map((ganger) => (
                <option key={ganger.id} value={ganger.id}>
                  {ganger.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
          <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wide">
            Gang Submissions (Ganger-Level Overview)
          </h3>
          <p className="text-xs text-slate-600 mt-1">
            Individual gang submissions by gangers. For per-employee compliance, see table above.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Week Ending
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Ganger
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Status
                </th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Members
                </th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Total Exposure
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Submitted
                </th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Revisions
                </th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredWeeks.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                    No HAVS records found matching filters
                  </td>
                </tr>
              ) : (
                filteredWeeks.map((week) => {
                  const weekHours = Math.floor(Number(week.total_gang_minutes) / 60);
                  const weekMinutes = Number(week.total_gang_minutes) % 60;

                  return (
                    <tr key={week.week_id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-sm text-slate-900 font-medium">
                        {new Date(week.week_ending).toLocaleDateString('en-GB')}
                      </td>
                      <td className="px-4 py-3">
                        <div>
                          <p className="text-sm font-medium text-slate-900">{week.ganger_name}</p>
                          <p className="text-xs text-slate-600">{week.ganger_role}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3">{getStatusBadge(week.week_status)}</td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-sm font-semibold text-slate-900">{week.total_members}</span>
                        <span className="text-xs text-slate-600"> ({week.operative_count} ops)</span>
                      </td>
                      <td className="px-4 py-3 text-center text-sm font-medium text-slate-900">
                        {weekHours}h {weekMinutes}m
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">
                        {week.week_submitted_at
                          ? new Date(week.week_submitted_at).toLocaleDateString('en-GB')
                          : '-'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {week.revision_number > 0 ? (
                          <span className="inline-flex items-center px-2 py-1 text-xs font-medium bg-blue-100 text-blue-700 rounded">
                            {week.revision_number}
                          </span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => setSelectedWeekId(week.week_id)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded transition-colors"
                        >
                          <Eye className="h-4 w-4" />
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

      {selectedWeekId && (
        <HavsWeekDetail weekId={selectedWeekId} onClose={() => setSelectedWeekId(null)} />
      )}
    </div>
  );
};
