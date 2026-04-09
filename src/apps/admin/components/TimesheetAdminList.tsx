import React, { useState, useEffect } from 'react';
import {
  FileText,
  Search,
  Filter,
  ChevronRight,
  Clock,
  Calendar,
  User,
  Car,
} from 'lucide-react';
import {
  TimesheetWeek,
  loadAllSubmittedTimesheets,
} from '../../../lib/timesheetService';
import {
  formatWeekEnding,
  formatHoursDecimal,
  getStatusInfo,
} from '../../../lib/timesheetUtils';

interface TimesheetAdminListProps {
  onViewTimesheet: (timesheetId: string) => void;
}

export const TimesheetAdminList: React.FC<TimesheetAdminListProps> = ({
  onViewTimesheet,
}) => {
  const [timesheets, setTimesheets] = useState<TimesheetWeek[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadTimesheets();
  }, []);

  const loadTimesheets = async () => {
    try {
      setLoading(true);
      const data = await loadAllSubmittedTimesheets();
      setTimesheets(data);
    } catch (err) {
      console.error('Failed to load timesheets:', err);
    } finally {
      setLoading(false);
    }
  };

  const filtered = timesheets.filter((t) => {
    if (statusFilter !== 'all' && t.status !== statusFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchName = t.ganger_name_snapshot?.toLowerCase().includes(q);
      const matchVehicle =
        t.vehicle_registration_snapshot?.toLowerCase().includes(q);
      const matchWeek = formatWeekEnding(t.week_ending)
        .toLowerCase()
        .includes(q);
      if (!matchName && !matchVehicle && !matchWeek) return false;
    }
    return true;
  });

  const submittedCount = timesheets.filter(
    (t) => t.status === 'submitted'
  ).length;
  const returnedCount = timesheets.filter(
    (t) => t.status === 'returned'
  ).length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 rounded-lg">
              <FileText className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">
                {timesheets.length}
              </p>
              <p className="text-xs text-slate-500">Total Timesheets</p>
            </div>
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 rounded-lg">
              <Clock className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-blue-700">
                {submittedCount}
              </p>
              <p className="text-xs text-slate-500">Awaiting Review</p>
            </div>
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-50 rounded-lg">
              <FileText className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-red-700">
                {returnedCount}
              </p>
              <p className="text-xs text-slate-500">Returned</p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="relative flex-1 w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by ganger, vehicle, or week..."
                className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-slate-400" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
              >
                <option value="all">All Status</option>
                <option value="submitted">Submitted</option>
                <option value="returned">Returned</option>
              </select>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-6 h-6 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="h-8 w-8 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-500">No timesheets found</p>
            {timesheets.length === 0 && (
              <p className="text-xs text-slate-400 mt-1">
                Timesheets will appear here when gangers submit them
              </p>
            )}
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filtered.map((sheet) => {
              const statusInfo = getStatusInfo(sheet.status);
              const gangerName =
                (sheet.ganger as any)?.full_name ||
                sheet.ganger_name_snapshot ||
                'Unknown';

              return (
                <button
                  key={sheet.id}
                  onClick={() => onViewTimesheet(sheet.id)}
                  className="w-full px-5 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors text-left"
                >
                  <div className="flex items-start gap-4 flex-1 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
                      <span className="text-sm font-bold text-slate-600">
                        {gangerName
                          .split(' ')
                          .map((n: string) => n[0])
                          .join('')
                          .toUpperCase()
                          .slice(0, 2)}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-sm font-semibold text-slate-900">
                          {gangerName}
                        </p>
                        <span
                          className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded border ${statusInfo.color} ${statusInfo.bgColor} ${statusInfo.borderColor}`}
                        >
                          {statusInfo.label}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          WE {formatWeekEnding(sheet.week_ending)}
                        </span>
                        {sheet.vehicle_registration_snapshot && (
                          <span className="flex items-center gap-1">
                            <Car className="h-3 w-3" />
                            {sheet.vehicle_registration_snapshot}
                          </span>
                        )}
                        <span className="font-medium text-slate-700">
                          {formatHoursDecimal(sheet.weekly_total_hours)} hrs
                        </span>
                        {sheet.labourer_1_name && (
                          <span className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            {sheet.labourer_1_name}
                            {sheet.labourer_2_name &&
                              `, ${sheet.labourer_2_name}`}
                          </span>
                        )}
                      </div>
                      {sheet.submitted_at && (
                        <p className="text-xs text-slate-400 mt-1">
                          Submitted{' '}
                          {new Date(sheet.submitted_at).toLocaleDateString(
                            'en-GB',
                            {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            }
                          )}
                        </p>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-400 flex-shrink-0 ml-2" />
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
