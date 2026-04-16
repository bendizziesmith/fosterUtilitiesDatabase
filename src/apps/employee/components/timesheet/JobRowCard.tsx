import React from 'react';
import { Trash2 } from 'lucide-react';
import {
  DAYS_OF_WEEK,
  DAY_LABELS,
  DayOfWeek,
  formatHoursDecimal,
} from '../../../../lib/timesheetUtils';
import { TimesheetJobRow } from '../../../../lib/timesheetService';

export interface LocalDayEntry {
  day_of_week: DayOfWeek;
  start_time: string;
  finish_time: string;
  hours_total: number;
}

interface JobRowCardProps {
  jobRow: TimesheetJobRow;
  index: number;
  localEntries: LocalDayEntry[];
  defaultStart: string;
  defaultFinish: string;
  onJobFieldChange: (
    jobRowId: string,
    field: 'job_number' | 'job_address' | 'default_start_time' | 'default_finish_time',
    value: string
  ) => void;
  onDayEntryChange: (
    jobRowId: string,
    day: DayOfWeek,
    field: 'start_time' | 'finish_time',
    value: string
  ) => void;
  onDayToggle: (jobRowId: string, day: DayOfWeek, selected: boolean) => void;
  onDeleteRow: (jobRowId: string) => void;
  readOnly: boolean;
}

export const JobRowCard: React.FC<JobRowCardProps> = ({
  jobRow,
  index,
  localEntries,
  defaultStart,
  defaultFinish,
  onJobFieldChange,
  onDayEntryChange,
  onDayToggle,
  onDeleteRow,
  readOnly,
}) => {
  const selectedDays = localEntries.filter(
    (e) => e.start_time || e.finish_time
  );
  const rowTotal = localEntries.reduce((sum, e) => sum + e.hours_total, 0);

  const isDaySelected = (day: DayOfWeek) => {
    const entry = localEntries.find((e) => e.day_of_week === day);
    return !!(entry && (entry.start_time || entry.finish_time));
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
      <div className="px-5 py-4 border-b border-slate-100">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-white bg-slate-500 rounded px-1.5 py-0.5">
              {index + 1}
            </span>
            <span className="text-sm font-semibold text-slate-700">Job</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-teal-700 tabular-nums bg-teal-50 px-2.5 py-0.5 rounded">
              {formatHoursDecimal(rowTotal)}h
            </span>
            {!readOnly && (
              <button
                onClick={() => onDeleteRow(jobRow.id)}
                className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {readOnly ? (
          <div className="space-y-1">
            <p className="text-base font-semibold text-slate-900">
              {jobRow.job_number || 'No job number'}
            </p>
            <p className="text-sm text-slate-500">
              {jobRow.job_address || 'No address'}
            </p>
            {(defaultStart || defaultFinish) && (
              <p className="text-xs text-slate-400 mt-2">
                Default hours: {defaultStart || '--:--'} - {defaultFinish || '--:--'}
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">
                  Job Number
                </label>
                <input
                  type="text"
                  value={jobRow.job_number}
                  onChange={(e) =>
                    onJobFieldChange(jobRow.id, 'job_number', e.target.value)
                  }
                  placeholder="e.g. J-1234"
                  className="w-full px-4 py-3 text-base border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">
                  Job Address
                </label>
                <input
                  type="text"
                  value={jobRow.job_address}
                  onChange={(e) =>
                    onJobFieldChange(jobRow.id, 'job_address', e.target.value)
                  }
                  placeholder="e.g. 12 High Street"
                  className="w-full px-4 py-3 text-base border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">
                  Default Start
                </label>
                <input
                  type="time"
                  value={defaultStart}
                  onChange={(e) =>
                    onJobFieldChange(jobRow.id, 'default_start_time', e.target.value)
                  }
                  className="w-full px-4 py-3 text-base border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 tabular-nums bg-white"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">
                  Default Finish
                </label>
                <input
                  type="time"
                  value={defaultFinish}
                  onChange={(e) =>
                    onJobFieldChange(jobRow.id, 'default_finish_time', e.target.value)
                  }
                  className="w-full px-4 py-3 text-base border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 tabular-nums bg-white"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {!readOnly && (
        <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/50">
          <label className="text-xs font-medium text-slate-500 mb-2 block">
            Days Worked
          </label>
          <div className="flex gap-1.5">
            {DAYS_OF_WEEK.map((day) => {
              const selected = isDaySelected(day);
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => onDayToggle(jobRow.id, day, !selected)}
                  className={`flex-1 py-2.5 rounded-lg text-xs font-semibold transition-all ${
                    selected
                      ? 'bg-teal-600 text-white shadow-sm'
                      : 'bg-white text-slate-500 border border-slate-200 hover:border-teal-300 hover:text-teal-600'
                  }`}
                >
                  {DAY_LABELS[day]}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {selectedDays.length > 0 && (
        <div className="divide-y divide-slate-100">
          {DAYS_OF_WEEK.map((day) => {
            const entry = localEntries.find((e) => e.day_of_week === day);
            if (!entry || (!entry.start_time && !entry.finish_time)) return null;

            const isOverridden =
              (entry.start_time && entry.start_time !== defaultStart) ||
              (entry.finish_time && entry.finish_time !== defaultFinish);

            return (
              <div
                key={day}
                className="px-5 py-3 flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-2 w-12 flex-shrink-0">
                  <span className="text-sm font-bold text-slate-700">
                    {DAY_LABELS[day]}
                  </span>
                </div>

                {readOnly ? (
                  <div className="flex items-center gap-4 flex-1">
                    <span className="text-sm text-slate-700 tabular-nums">
                      {entry.start_time || '-'}
                    </span>
                    <span className="text-xs text-slate-400">to</span>
                    <span className="text-sm text-slate-700 tabular-nums">
                      {entry.finish_time || '-'}
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 flex-1">
                    <input
                      type="time"
                      value={entry.start_time}
                      onChange={(e) =>
                        onDayEntryChange(jobRow.id, day, 'start_time', e.target.value)
                      }
                      className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 tabular-nums bg-white"
                    />
                    <span className="text-xs text-slate-400 flex-shrink-0">to</span>
                    <input
                      type="time"
                      value={entry.finish_time}
                      onChange={(e) =>
                        onDayEntryChange(jobRow.id, day, 'finish_time', e.target.value)
                      }
                      className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 tabular-nums bg-white"
                    />
                  </div>
                )}

                <div className="flex items-center gap-2 flex-shrink-0">
                  {isOverridden && !readOnly && (
                    <span className="text-[10px] font-medium text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                      edited
                    </span>
                  )}
                  <span className="text-sm font-semibold text-teal-700 tabular-nums w-12 text-right">
                    {entry.hours_total > 0
                      ? `${formatHoursDecimal(entry.hours_total)}h`
                      : '-'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selectedDays.length === 0 && !readOnly && (
        <div className="px-5 py-6 text-center">
          <p className="text-sm text-slate-400">
            Select days above to add work hours
          </p>
        </div>
      )}
    </div>
  );
};
