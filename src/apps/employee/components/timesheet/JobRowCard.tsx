import React, { useState } from 'react';
import { Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import {
  DAYS_OF_WEEK,
  DAY_LABELS_FULL,
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
  onJobFieldChange: (
    jobRowId: string,
    field: 'job_number' | 'job_address',
    value: string
  ) => void;
  onDayEntryChange: (
    jobRowId: string,
    day: DayOfWeek,
    field: 'start_time' | 'finish_time',
    value: string
  ) => void;
  onDeleteRow: (jobRowId: string) => void;
  readOnly: boolean;
}

export const JobRowCard: React.FC<JobRowCardProps> = ({
  jobRow,
  index,
  localEntries,
  onJobFieldChange,
  onDayEntryChange,
  onDeleteRow,
  readOnly,
}) => {
  const [expanded, setExpanded] = useState(true);

  const rowTotal = localEntries.reduce((sum, e) => sum + e.hours_total, 0);

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
      <div className="px-5 py-4 bg-gradient-to-r from-slate-50 to-white border-b border-slate-100">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs font-bold text-white bg-slate-500 rounded px-1.5 py-0.5">
                {index + 1}
              </span>
              <span className="text-sm font-semibold text-slate-700">Job</span>
              <button
                onClick={() => setExpanded(!expanded)}
                className="ml-auto p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
              >
                {expanded ? (
                  <ChevronUp className="h-5 w-5" />
                ) : (
                  <ChevronDown className="h-5 w-5" />
                )}
              </button>
            </div>

            {readOnly ? (
              <div className="space-y-1">
                <p className="text-base font-semibold text-slate-900">
                  {jobRow.job_number || 'No job number'}
                </p>
                <p className="text-sm text-slate-500">
                  {jobRow.job_address || 'No address'}
                </p>
              </div>
            ) : (
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
                    placeholder="e.g. 12 High Street, London"
                    className="w-full px-4 py-3 text-base border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-200">
          <div className="text-sm font-semibold text-teal-700 tabular-nums">
            Job Total: {formatHoursDecimal(rowTotal)}h
          </div>
          {!readOnly && (
            <button
              onClick={() => onDeleteRow(jobRow.id)}
              className="px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors flex items-center gap-1.5"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </button>
          )}
        </div>
      </div>

      {expanded && (
        <div className="divide-y divide-slate-100">
          {DAYS_OF_WEEK.map((day) => {
            const entry = localEntries.find((e) => e.day_of_week === day) || {
              day_of_week: day,
              start_time: '',
              finish_time: '',
              hours_total: 0,
            };

            if (readOnly && !entry.start_time && !entry.finish_time) {
              return null;
            }

            return (
              <DayRow
                key={day}
                day={day}
                entry={entry}
                jobRowId={jobRow.id}
                onDayEntryChange={onDayEntryChange}
                readOnly={readOnly}
              />
            );
          })}
        </div>
      )}
    </div>
  );
};

function DayRow({
  day,
  entry,
  jobRowId,
  onDayEntryChange,
  readOnly,
}: {
  day: DayOfWeek;
  entry: LocalDayEntry;
  jobRowId: string;
  onDayEntryChange: JobRowCardProps['onDayEntryChange'];
  readOnly: boolean;
}) {
  const hasData = entry.start_time || entry.finish_time;
  const isWeekend = day === 'saturday' || day === 'sunday';

  return (
    <div
      className={`px-5 py-3.5 ${
        hasData ? 'bg-white' : isWeekend ? 'bg-slate-50/70' : 'bg-white'
      }`}
    >
      <div className="flex items-center justify-between mb-2.5">
        <span
          className={`text-sm font-bold ${
            isWeekend ? 'text-slate-400' : 'text-slate-700'
          }`}
        >
          {DAY_LABELS_FULL[day]}
        </span>
        {entry.hours_total > 0 && (
          <span className="text-sm font-bold text-teal-700 tabular-nums bg-teal-50 px-2.5 py-0.5 rounded">
            {formatHoursDecimal(entry.hours_total)}h
          </span>
        )}
      </div>

      {readOnly ? (
        <ReadOnlyDayFields entry={entry} />
      ) : (
        <EditableDayFields
          entry={entry}
          jobRowId={jobRowId}
          day={day}
          onDayEntryChange={onDayEntryChange}
        />
      )}
    </div>
  );
}

function ReadOnlyDayFields({ entry }: { entry: LocalDayEntry }) {
  if (!entry.start_time && !entry.finish_time) {
    return <p className="text-sm text-slate-300 italic">No entry</p>;
  }

  return (
    <div className="grid grid-cols-2 gap-4">
      <div>
        <p className="text-xs text-slate-400 mb-0.5">Start</p>
        <p className="text-sm font-medium text-slate-800 tabular-nums">
          {entry.start_time || '-'}
        </p>
      </div>
      <div>
        <p className="text-xs text-slate-400 mb-0.5">Finish</p>
        <p className="text-sm font-medium text-slate-800 tabular-nums">
          {entry.finish_time || '-'}
        </p>
      </div>
    </div>
  );
}

function EditableDayFields({
  entry,
  jobRowId,
  day,
  onDayEntryChange,
}: {
  entry: LocalDayEntry;
  jobRowId: string;
  day: DayOfWeek;
  onDayEntryChange: JobRowCardProps['onDayEntryChange'];
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <label className="text-xs font-medium text-slate-500 mb-1 block">
          Start
        </label>
        <input
          type="time"
          value={entry.start_time}
          onChange={(e) =>
            onDayEntryChange(jobRowId, day, 'start_time', e.target.value)
          }
          className="w-full px-3 py-3 text-base border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 tabular-nums bg-white"
        />
      </div>
      <div>
        <label className="text-xs font-medium text-slate-500 mb-1 block">
          Finish
        </label>
        <input
          type="time"
          value={entry.finish_time}
          onChange={(e) =>
            onDayEntryChange(jobRowId, day, 'finish_time', e.target.value)
          }
          className="w-full px-3 py-3 text-base border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 tabular-nums bg-white"
        />
      </div>
    </div>
  );
}
