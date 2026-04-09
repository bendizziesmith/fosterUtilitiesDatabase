import React, { useState, useEffect } from 'react';
import {
  FileText,
  Search,
  Download,
  Eye,
  ChevronRight,
  Calendar,
  Car,
  User,
  Clock,
} from 'lucide-react';
import {
  TimesheetWeek,
  TimesheetJobRow,
  loadTimesheetsForWeek,
} from '../../../lib/timesheetService';
import {
  DAYS_OF_WEEK,
  DAY_LABELS_FULL,
  DayOfWeek,
  formatWeekEnding,
  formatHoursDecimal,
  getStatusInfo,
} from '../../../lib/timesheetUtils';

interface TimesheetAdminListProps {
  onViewTimesheet: (timesheetId: string) => void;
  weekEnding?: string;
}

function escapeCSV(val: string): string {
  if (val.includes(',') || val.includes('"') || val.includes('\n')) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

function downloadTimesheetCSV(ts: TimesheetWeek) {
  const empName =
    (ts.ganger as any)?.full_name || ts.ganger_name_snapshot || 'Unknown';
  const role = (ts.ganger as any)?.role || '';
  const vehicle = ts.vehicle_registration_snapshot || '';
  const lab1 = ts.labourer_1_name || '';
  const lab2 = ts.labourer_2_name || '';

  const headers = [
    'Week Ending',
    'Employee Name',
    'Role',
    'Vehicle',
    'Labourer 1',
    'Labourer 2',
    'Job Number',
    'Job Address / Location',
    'Day of Week',
    'Start',
    'Finish',
    'Hours',
    'Weekly Total Hours',
  ];

  const rows: string[] = [headers.join(',')];

  for (const jobRow of ts.job_rows || []) {
    for (const day of DAYS_OF_WEEK) {
      const entry = (jobRow.day_entries || []).find(
        (e) => e.day_of_week === day
      );
      if (!entry || (!entry.start_time && !entry.finish_time)) continue;

      rows.push(
        [
          escapeCSV(formatWeekEnding(ts.week_ending)),
          escapeCSV(empName),
          escapeCSV(role),
          escapeCSV(vehicle),
          escapeCSV(lab1),
          escapeCSV(lab2),
          escapeCSV(jobRow.job_number || ''),
          escapeCSV(jobRow.job_address || ''),
          escapeCSV(DAY_LABELS_FULL[day as DayOfWeek]),
          escapeCSV(entry.start_time || ''),
          escapeCSV(entry.finish_time || ''),
          formatHoursDecimal(entry.hours_total || 0),
          formatHoursDecimal(ts.weekly_total_hours),
        ].join(',')
      );
    }
  }

  const safeName = empName.replace(/[^a-zA-Z0-9]/g, '_');
  const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `Timesheet_${safeName}_WE_${ts.week_ending}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export const TimesheetAdminList: React.FC<TimesheetAdminListProps> = ({
  onViewTimesheet,
  weekEnding,
}) => {
  const [timesheets, setTimesheets] = useState<TimesheetWeek[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (weekEnding) {
      loadData();
    }
  }, [weekEnding]);

  const loadData = async () => {
    if (!weekEnding) return;
    try {
      setLoading(true);
      const data = await loadTimesheetsForWeek(weekEnding);
      setTimesheets(data);
    } catch (err) {
      console.error('Failed to load timesheets:', err);
    } finally {
      setLoading(false);
    }
  };

  const filtered = timesheets.filter((t) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const name =
      ((t.ganger as any)?.full_name || t.ganger_name_snapshot || '')
        .toLowerCase();
    const veh = (t.vehicle_registration_snapshot || '').toLowerCase();
    return name.includes(q) || veh.includes(q);
  });

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="px-5 py-3.5 border-b border-slate-200">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="flex items-center gap-2 flex-shrink-0">
            <FileText className="h-4 w-4 text-slate-400" />
            <h3 className="text-sm font-bold text-slate-900">
              Submitted Timesheets
            </h3>
            <span className="text-xs text-slate-500 bg-slate-100 rounded-full px-2 py-0.5">
              {filtered.length}
            </span>
          </div>
          <div className="relative flex-1 w-full sm:max-w-xs ml-auto">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search ganger or vehicle..."
              className="w-full pl-8 pr-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
            />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <div className="w-5 h-5 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-10">
          <FileText className="h-7 w-7 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-500">
            {timesheets.length === 0
              ? 'No submitted timesheets for this week'
              : 'No matching timesheets'}
          </p>
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {filtered.map((sheet) => (
            <TimesheetRow
              key={sheet.id}
              sheet={sheet}
              onView={() => onViewTimesheet(sheet.id)}
              onDownload={() => downloadTimesheetCSV(sheet)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

function TimesheetRow({
  sheet,
  onView,
  onDownload,
}: {
  sheet: TimesheetWeek;
  onView: () => void;
  onDownload: () => void;
}) {
  const gangerName =
    (sheet.ganger as any)?.full_name ||
    sheet.ganger_name_snapshot ||
    'Unknown';
  const statusInfo = getStatusInfo(sheet.status);
  const initials = gangerName
    .split(' ')
    .map((n: string) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const statusBg =
    sheet.status === 'submitted'
      ? 'bg-emerald-100 text-emerald-700'
      : sheet.status === 'returned'
      ? 'bg-amber-100 text-amber-700'
      : 'bg-slate-100 text-slate-600';

  return (
    <div className="px-5 py-3.5 flex items-center gap-4 hover:bg-slate-50 transition-colors group">
      <div
        className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${statusBg}`}
      >
        <span className="text-xs font-bold">{initials}</span>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <p className="text-sm font-semibold text-slate-900 truncate">
            {gangerName}
          </p>
          <span
            className={`inline-flex items-center px-2 py-0.5 text-[10px] font-semibold rounded border ${statusInfo.color} ${statusInfo.bgColor} ${statusInfo.borderColor}`}
          >
            {statusInfo.label}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500">
          {sheet.vehicle_registration_snapshot && (
            <span className="flex items-center gap-1">
              <Car className="h-3 w-3" />
              {sheet.vehicle_registration_snapshot}
            </span>
          )}
          <span className="flex items-center gap-1 font-medium text-slate-700">
            <Clock className="h-3 w-3" />
            {formatHoursDecimal(sheet.weekly_total_hours)}h
          </span>
          {sheet.labourer_1_name && (
            <span className="flex items-center gap-1">
              <User className="h-3 w-3" />
              {sheet.labourer_1_name}
              {sheet.labourer_2_name && `, ${sheet.labourer_2_name}`}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1.5 flex-shrink-0">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDownload();
          }}
          title="Download CSV"
          className="p-2 rounded-lg text-slate-400 hover:text-teal-700 hover:bg-teal-50 transition-colors"
        >
          <Download className="h-4 w-4" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onView();
          }}
          title="View Timesheet"
          className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
        >
          <Eye className="h-4 w-4" />
        </button>
        <ChevronRight className="h-4 w-4 text-slate-300 hidden sm:block" />
      </div>
    </div>
  );
}
