import React, { useState, useEffect } from 'react';
import { Download, Table2, FileText } from 'lucide-react';
import {
  TimesheetWeek,
  loadTimesheetsForWeek,
} from '../../../lib/timesheetService';
import {
  DAYS_OF_WEEK,
  DAY_LABELS_FULL,
  DayOfWeek,
  formatWeekEnding,
  formatHoursDecimal,
} from '../../../lib/timesheetUtils';

interface FlatRow {
  weekEnding: string;
  employeeName: string;
  role: string;
  vehicle: string;
  labourer1: string;
  labourer2: string;
  jobNumber: string;
  jobAddress: string;
  dayOfWeek: string;
  start: string;
  finish: string;
  hours: number;
  weeklyTotalHours: number;
}

interface TimesheetReportTableProps {
  weekEnding: string;
}

function flattenTimesheets(timesheets: TimesheetWeek[]): FlatRow[] {
  const rows: FlatRow[] = [];

  for (const ts of timesheets) {
    const empName =
      (ts.ganger as any)?.full_name || ts.ganger_name_snapshot || 'Unknown';
    const role = (ts.ganger as any)?.role || '';
    const vehicle = ts.vehicle_registration_snapshot || '';
    const lab1 = ts.labourer_1_name || '';
    const lab2 = ts.labourer_2_name || '';

    for (const jobRow of ts.job_rows || []) {
      for (const day of DAYS_OF_WEEK) {
        const entry = (jobRow.day_entries || []).find(
          (e) => e.day_of_week === day
        );
        if (!entry || (!entry.start_time && !entry.finish_time)) continue;

        rows.push({
          weekEnding: ts.week_ending,
          employeeName: empName,
          role,
          vehicle,
          labourer1: lab1,
          labourer2: lab2,
          jobNumber: jobRow.job_number || '',
          jobAddress: jobRow.job_address || '',
          dayOfWeek: DAY_LABELS_FULL[day as DayOfWeek],
          start: entry.start_time || '',
          finish: entry.finish_time || '',
          hours: entry.hours_total || 0,
          weeklyTotalHours: ts.weekly_total_hours,
        });
      }
    }
  }

  return rows;
}

function escapeCSV(val: string): string {
  if (val.includes(',') || val.includes('"') || val.includes('\n')) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

function downloadCSV(rows: FlatRow[], weekEnding: string) {
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

  const csvRows = [
    headers.join(','),
    ...rows.map((r) =>
      [
        escapeCSV(formatWeekEnding(r.weekEnding)),
        escapeCSV(r.employeeName),
        escapeCSV(r.role),
        escapeCSV(r.vehicle),
        escapeCSV(r.labourer1),
        escapeCSV(r.labourer2),
        escapeCSV(r.jobNumber),
        escapeCSV(r.jobAddress),
        escapeCSV(r.dayOfWeek),
        escapeCSV(r.start),
        escapeCSV(r.finish),
        formatHoursDecimal(r.hours),
        formatHoursDecimal(r.weeklyTotalHours),
      ].join(',')
    ),
  ];

  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `Timesheets_WE_${weekEnding}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export const TimesheetReportTable: React.FC<TimesheetReportTableProps> = ({
  weekEnding,
}) => {
  const [timesheets, setTimesheets] = useState<TimesheetWeek[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [weekEnding]);

  const loadData = async () => {
    try {
      setLoading(true);
      const data = await loadTimesheetsForWeek(weekEnding);
      setTimesheets(data);
    } catch (err) {
      console.error('Failed to load report data:', err);
    } finally {
      setLoading(false);
    }
  };

  const flatRows = flattenTimesheets(timesheets);

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <Table2 className="h-5 w-5 text-slate-400" />
          <div>
            <h3 className="font-semibold text-slate-900">
              Timesheet Report
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Week Ending {formatWeekEnding(weekEnding)} -- {flatRows.length}{' '}
              worked-day entries
            </p>
          </div>
        </div>
        <button
          onClick={() => downloadCSV(flatRows, weekEnding)}
          disabled={flatRows.length === 0}
          className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Download className="h-4 w-4" />
          Download CSV
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
        </div>
      ) : flatRows.length === 0 ? (
        <div className="px-6 py-12 text-center">
          <FileText className="h-8 w-8 text-slate-300 mx-auto mb-3" />
          <p className="text-sm text-slate-500">
            No submitted timesheet entries for this week
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[1100px]">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Employee
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Role
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Vehicle
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Lab 1
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Lab 2
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Job No.
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Location
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Day
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Start
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Finish
                </th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Hours
                </th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Week Total
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {flatRows.map((row, i) => {
                const prevRow = i > 0 ? flatRows[i - 1] : null;
                const isNewEmployee =
                  !prevRow || prevRow.employeeName !== row.employeeName;

                return (
                  <tr
                    key={i}
                    className={`hover:bg-slate-50 transition-colors ${
                      isNewEmployee && i > 0
                        ? 'border-t-2 border-t-slate-200'
                        : ''
                    }`}
                  >
                    <td className="px-4 py-2.5 text-sm font-medium text-slate-900 whitespace-nowrap">
                      {isNewEmployee ? row.employeeName : ''}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-500 whitespace-nowrap">
                      {isNewEmployee ? row.role : ''}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-500 whitespace-nowrap">
                      {isNewEmployee ? row.vehicle : ''}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-500 whitespace-nowrap">
                      {isNewEmployee ? row.labourer1 : ''}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-500 whitespace-nowrap">
                      {isNewEmployee ? row.labourer2 : ''}
                    </td>
                    <td className="px-4 py-2.5 text-xs font-medium text-slate-700 whitespace-nowrap">
                      {row.jobNumber}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-600 max-w-[200px] truncate">
                      {row.jobAddress}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-600 whitespace-nowrap">
                      {row.dayOfWeek}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-700 tabular-nums whitespace-nowrap">
                      {row.start}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-700 tabular-nums whitespace-nowrap">
                      {row.finish}
                    </td>
                    <td className="px-4 py-2.5 text-xs font-medium text-slate-700 tabular-nums text-right">
                      {formatHoursDecimal(row.hours)}
                    </td>
                    <td className="px-4 py-2.5 text-xs font-semibold text-slate-900 tabular-nums text-right">
                      {isNewEmployee
                        ? formatHoursDecimal(row.weeklyTotalHours)
                        : ''}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
