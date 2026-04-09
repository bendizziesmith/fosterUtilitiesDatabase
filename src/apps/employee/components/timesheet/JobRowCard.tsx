import React, { useState } from 'react';
import {
  Trash2,
  Copy,
  CopyPlus,
  ChevronDown,
  ChevronUp,
  MapPin,
  Hash,
} from 'lucide-react';
import {
  DAYS_OF_WEEK,
  DAY_LABELS,
  DayOfWeek,
  calculateDayHours,
  formatHoursDecimal,
} from '../../../../lib/timesheetUtils';
import { TimesheetJobRow, TimesheetDayEntry } from '../../../../lib/timesheetService';

export interface LocalDayEntry {
  day_of_week: DayOfWeek;
  start_time: string;
  finish_time: string;
  office_duration: string;
  hours_total: number;
}

interface JobRowCardProps {
  jobRow: TimesheetJobRow;
  index: number;
  localEntries: LocalDayEntry[];
  onJobFieldChange: (
    jobRowId: string,
    field: 'job_number' | 'job_address',
    value: string
  ) => void;
  onDayEntryChange: (
    jobRowId: string,
    day: DayOfWeek,
    field: 'start_time' | 'finish_time' | 'office_duration',
    value: string
  ) => void;
  onDeleteRow: (jobRowId: string) => void;
  onDuplicateRow: (jobRow: TimesheetJobRow, entries: LocalDayEntry[]) => void;
  onCopyJobDetails: (jobRow: TimesheetJobRow) => void;
  readOnly: boolean;
}

export const JobRowCard: React.FC<JobRowCardProps> = ({
  jobRow,
  index,
  localEntries,
  onJobFieldChange,
  onDayEntryChange,
  onDeleteRow,
  onDuplicateRow,
  onCopyJobDetails,
  readOnly,
}) => {
  const [expanded, setExpanded] = useState(true);

  const rowTotal = localEntries.reduce((sum, e) => sum + e.hours_total, 0);

  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <button
              onClick={() => setExpanded(!expanded)}
              className="p-1 text-slate-400 hover:text-slate-600 rounded transition-colors"
            >
              {expanded ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </button>

            <span className="text-xs font-bold text-slate-400 w-6 shrink-0">
              #{index + 1}
            </span>

            <div className="flex items-center gap-2 flex-1 min-w-0">
              {readOnly ? (
                <div className="flex items-center gap-4 text-sm">
                  <span className="font-medium text-slate-900">
                    {jobRow.job_number || '-'}
                  </span>
                  <span className="text-slate-500 truncate">
                    {jobRow.job_address || '-'}
                  </span>
                </div>
              ) : (
                <>
                  <div className="relative flex-shrink-0 w-28">
                    <Hash className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                    <input
                      type="text"
                      value={jobRow.job_number}
                      onChange={(e) =>
                        onJobFieldChange(
                          jobRow.id,
                          'job_number',
                          e.target.value
                        )
                      }
                      placeholder="Job No."
                      className="w-full pl-8 pr-2 py-1.5 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                    />
                  </div>
                  <div className="relative flex-1 min-w-0">
                    <MapPin className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                    <input
                      type="text"
                      value={jobRow.job_address}
                      onChange={(e) =>
                        onJobFieldChange(
                          jobRow.id,
                          'job_address',
                          e.target.value
                        )
                      }
                      placeholder="Job Address"
                      className="w-full pl-8 pr-2 py-1.5 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                    />
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 ml-3">
            <span className="text-sm font-semibold text-slate-700 tabular-nums">
              {formatHoursDecimal(rowTotal)}h
            </span>
            {!readOnly && (
              <>
                <button
                  onClick={() => onCopyJobDetails(jobRow)}
                  className="p-1.5 text-slate-400 hover:text-teal-600 hover:bg-teal-50 rounded transition-colors"
                  title="Copy job details to new row"
                >
                  <CopyPlus className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => onDuplicateRow(jobRow, localEntries)}
                  className="p-1.5 text-slate-400 hover:text-teal-600 hover:bg-teal-50 rounded transition-colors"
                  title="Duplicate row with times"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => onDeleteRow(jobRow.id)}
                  className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                  title="Delete row"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {expanded && (
        <div className="p-4">
          <div className="hidden md:block">
            <DesktopDayGrid
              localEntries={localEntries}
              jobRowId={jobRow.id}
              onDayEntryChange={onDayEntryChange}
              readOnly={readOnly}
            />
          </div>
          <div className="md:hidden">
            <MobileDayList
              localEntries={localEntries}
              jobRowId={jobRow.id}
              onDayEntryChange={onDayEntryChange}
              readOnly={readOnly}
            />
          </div>
        </div>
      )}
    </div>
  );
};

function DesktopDayGrid({
  localEntries,
  jobRowId,
  onDayEntryChange,
  readOnly,
}: {
  localEntries: LocalDayEntry[];
  jobRowId: string;
  onDayEntryChange: JobRowCardProps['onDayEntryChange'];
  readOnly: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200">
            <th className="text-left text-xs font-medium text-slate-500 pb-2 pr-2 w-16">
              Day
            </th>
            <th className="text-left text-xs font-medium text-slate-500 pb-2 px-1">
              Start
            </th>
            <th className="text-left text-xs font-medium text-slate-500 pb-2 px-1">
              Finish
            </th>
            <th className="text-left text-xs font-medium text-slate-500 pb-2 px-1">
              Office
            </th>
            <th className="text-right text-xs font-medium text-slate-500 pb-2 pl-1 w-14">
              Hrs
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {DAYS_OF_WEEK.map((day) => {
            const entry = localEntries.find((e) => e.day_of_week === day) || {
              day_of_week: day,
              start_time: '',
              finish_time: '',
              office_duration: '',
              hours_total: 0,
            };

            return (
              <tr key={day}>
                <td className="py-2 pr-2">
                  <span className="text-xs font-semibold text-slate-600">
                    {DAY_LABELS[day]}
                  </span>
                </td>
                <td className="py-2 px-1">
                  {readOnly ? (
                    <span className="text-xs text-slate-700 tabular-nums">
                      {entry.start_time || '-'}
                    </span>
                  ) : (
                    <input
                      type="time"
                      value={entry.start_time}
                      onChange={(e) =>
                        onDayEntryChange(
                          jobRowId,
                          day,
                          'start_time',
                          e.target.value
                        )
                      }
                      className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded focus:ring-2 focus:ring-teal-500 focus:border-teal-500 tabular-nums"
                    />
                  )}
                </td>
                <td className="py-2 px-1">
                  {readOnly ? (
                    <span className="text-xs text-slate-700 tabular-nums">
                      {entry.finish_time || '-'}
                    </span>
                  ) : (
                    <input
                      type="time"
                      value={entry.finish_time}
                      onChange={(e) =>
                        onDayEntryChange(
                          jobRowId,
                          day,
                          'finish_time',
                          e.target.value
                        )
                      }
                      className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded focus:ring-2 focus:ring-teal-500 focus:border-teal-500 tabular-nums"
                    />
                  )}
                </td>
                <td className="py-2 px-1">
                  {readOnly ? (
                    <span className="text-xs text-slate-700 tabular-nums">
                      {entry.office_duration || '-'}
                    </span>
                  ) : (
                    <input
                      type="time"
                      value={entry.office_duration}
                      onChange={(e) =>
                        onDayEntryChange(
                          jobRowId,
                          day,
                          'office_duration',
                          e.target.value
                        )
                      }
                      className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded focus:ring-2 focus:ring-teal-500 focus:border-teal-500 tabular-nums"
                    />
                  )}
                </td>
                <td className="py-2 pl-1 text-right">
                  <span className="text-xs font-medium text-slate-700 tabular-nums">
                    {entry.hours_total > 0
                      ? formatHoursDecimal(entry.hours_total)
                      : '-'}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function MobileDayList({
  localEntries,
  jobRowId,
  onDayEntryChange,
  readOnly,
}: {
  localEntries: LocalDayEntry[];
  jobRowId: string;
  onDayEntryChange: JobRowCardProps['onDayEntryChange'];
  readOnly: boolean;
}) {
  return (
    <div className="space-y-3">
      {DAYS_OF_WEEK.map((day) => {
        const entry = localEntries.find((e) => e.day_of_week === day) || {
          day_of_week: day,
          start_time: '',
          finish_time: '',
          office_duration: '',
          hours_total: 0,
        };

        const hasData =
          entry.start_time || entry.finish_time || entry.office_duration;

        return (
          <div
            key={day}
            className={`p-3 rounded-lg border ${
              hasData
                ? 'border-teal-200 bg-teal-50/30'
                : 'border-slate-200 bg-slate-50/50'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-600 uppercase">
                {DAY_LABELS[day]}
              </span>
              {entry.hours_total > 0 && (
                <span className="text-xs font-semibold text-teal-700 tabular-nums">
                  {formatHoursDecimal(entry.hours_total)}h
                </span>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-[10px] text-slate-400 mb-0.5 block">
                  Start
                </label>
                {readOnly ? (
                  <span className="text-xs text-slate-700 tabular-nums">
                    {entry.start_time || '-'}
                  </span>
                ) : (
                  <input
                    type="time"
                    value={entry.start_time}
                    onChange={(e) =>
                      onDayEntryChange(
                        jobRowId,
                        day,
                        'start_time',
                        e.target.value
                      )
                    }
                    className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded focus:ring-2 focus:ring-teal-500 focus:border-teal-500 tabular-nums"
                  />
                )}
              </div>
              <div>
                <label className="text-[10px] text-slate-400 mb-0.5 block">
                  Finish
                </label>
                {readOnly ? (
                  <span className="text-xs text-slate-700 tabular-nums">
                    {entry.finish_time || '-'}
                  </span>
                ) : (
                  <input
                    type="time"
                    value={entry.finish_time}
                    onChange={(e) =>
                      onDayEntryChange(
                        jobRowId,
                        day,
                        'finish_time',
                        e.target.value
                      )
                    }
                    className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded focus:ring-2 focus:ring-teal-500 focus:border-teal-500 tabular-nums"
                  />
                )}
              </div>
              <div>
                <label className="text-[10px] text-slate-400 mb-0.5 block">
                  Office
                </label>
                {readOnly ? (
                  <span className="text-xs text-slate-700 tabular-nums">
                    {entry.office_duration || '-'}
                  </span>
                ) : (
                  <input
                    type="time"
                    value={entry.office_duration}
                    onChange={(e) =>
                      onDayEntryChange(
                        jobRowId,
                        day,
                        'office_duration',
                        e.target.value
                      )
                    }
                    className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded focus:ring-2 focus:ring-teal-500 focus:border-teal-500 tabular-nums"
                  />
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
