import React, { useMemo, useState } from 'react';
import { Trash2, AlertCircle, PoundSterling, ChevronDown, FileText } from 'lucide-react';
import {
  DAYS_OF_WEEK,
  DAY_LABELS,
  DayOfWeek,
  formatHoursDecimal,
} from '../../../../lib/timesheetUtils';
import { TimesheetJobRow } from '../../../../lib/timesheetService';
import {
  PriceWorkLocal,
  buildPriceWorkUpdate,
  formatPriceWorkSummary,
  formatMetres,
  liveTrenchTotal,
  liveJointTotal,
  localHasPriceWork,
} from '../../../../lib/priceWork';

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
    field: 'job_number' | 'job_address' | 'default_start_time' | 'default_finish_time' | 'notes',
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
  priceWork: PriceWorkLocal;
  onPriceWorkChange: (
    jobRowId: string,
    field: keyof PriceWorkLocal,
    value: string
  ) => void;
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
  priceWork,
  onPriceWorkChange,
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

  const missingFields = useMemo(() => {
    if (readOnly) return [];
    const missing: string[] = [];
    if (!jobRow.job_number?.trim()) missing.push('Job Number');
    if (!jobRow.job_address?.trim()) missing.push('Job Address');
    if (!defaultStart) missing.push('Start Time');
    if (!defaultFinish) missing.push('Finish Time');
    return missing;
  }, [readOnly, jobRow.job_number, jobRow.job_address, defaultStart, defaultFinish]);

  const daysLocked = missingFields.length > 0;

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
            {jobRow.notes?.trim() && (
              <div className="mt-3 pt-3 border-t border-slate-100">
                <div className="flex items-center gap-1.5 mb-1">
                  <FileText className="h-3.5 w-3.5 text-slate-400" />
                  <span className="text-xs font-medium text-slate-500">Notes</span>
                </div>
                <p className="text-sm text-slate-700 whitespace-pre-wrap">
                  {jobRow.notes}
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">
                  Job Number <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={jobRow.job_number}
                  onChange={(e) =>
                    onJobFieldChange(jobRow.id, 'job_number', e.target.value)
                  }
                  placeholder="e.g. J-1234"
                  className={`w-full px-4 py-3 text-base border rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 ${
                    !jobRow.job_number?.trim() ? 'border-slate-300' : 'border-slate-300'
                  }`}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">
                  Job Address <span className="text-red-500">*</span>
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
                  Start Time <span className="text-red-500">*</span>
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
                  Finish Time <span className="text-red-500">*</span>
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

            <div>
              <label
                htmlFor={`notes-${jobRow.id}`}
                className="flex items-center gap-1.5 text-xs font-medium text-slate-500 mb-1"
              >
                <FileText className="h-3.5 w-3.5 text-slate-400" />
                Notes <span className="text-slate-400">(optional)</span>
              </label>
              <textarea
                id={`notes-${jobRow.id}`}
                value={jobRow.notes || ''}
                onChange={(e) => onJobFieldChange(jobRow.id, 'notes', e.target.value)}
                rows={3}
                placeholder="Anything about this job not covered above - access, delays, materials, extra work..."
                className="w-full px-4 py-3 text-base border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 resize-none"
              />
            </div>
          </div>
        )}
      </div>

      <PriceWorkSection
        jobRowId={jobRow.id}
        priceWork={priceWork}
        onPriceWorkChange={onPriceWorkChange}
        readOnly={readOnly}
      />

      {!readOnly && (
        <div className={`px-5 py-3 border-b border-slate-100 ${daysLocked ? 'bg-slate-50' : 'bg-slate-50/50'}`}>
          <label className="text-xs font-medium text-slate-500 mb-2 block">
            Days Worked
          </label>
          {daysLocked ? (
            <div className="py-2">
              <div className="flex gap-1.5 mb-3 pointer-events-none">
                {DAYS_OF_WEEK.map((day) => (
                  <div
                    key={day}
                    className="flex-1 py-2.5 rounded-lg text-xs font-semibold text-center bg-slate-100 text-slate-300 border border-slate-200"
                  >
                    {DAY_LABELS[day]}
                  </div>
                ))}
              </div>
              <div className="flex items-start gap-1.5">
                <AlertCircle className="h-3.5 w-3.5 text-red-400 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-red-500">
                  Enter {missingFields.join(', ')} before selecting days
                </p>
              </div>
            </div>
          ) : (
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
          )}
        </div>
      )}

      {selectedDays.length > 0 && (
        <div className="divide-y divide-slate-100">
          {DAYS_OF_WEEK.map((day) => {
            const entry = localEntries.find((e) => e.day_of_week === day);
            if (!entry || (!entry.start_time && !entry.finish_time)) return null;

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

                <div className="flex-shrink-0">
                  <span className="text-sm font-semibold text-teal-700 tabular-nums w-12 text-right block">
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

      {selectedDays.length === 0 && !readOnly && !daysLocked && (
        <div className="px-5 py-6 text-center">
          <p className="text-sm text-slate-400">
            Select days above to add work hours
          </p>
        </div>
      )}
    </div>
  );
};

type PriceWorkFieldDef = { field: keyof PriceWorkLocal; label: string };

const TRENCH_FIELDS: PriceWorkFieldDef[] = [
  { field: 'pw_trench_verge', label: 'Verge' },
  { field: 'pw_trench_footway', label: 'F/W' },
  { field: 'pw_trench_carriageway', label: 'C/W' },
];

const JOINT_FIELDS: PriceWorkFieldDef[] = [
  { field: 'pw_joint_verge', label: 'Verge' },
  { field: 'pw_joint_footway', label: 'F/W' },
  { field: 'pw_joint_carriageway', label: 'C/W' },
];

interface PriceWorkSectionProps {
  jobRowId: string;
  priceWork: PriceWorkLocal;
  onPriceWorkChange: (
    jobRowId: string,
    field: keyof PriceWorkLocal,
    value: string
  ) => void;
  readOnly: boolean;
}

const PriceWorkSection: React.FC<PriceWorkSectionProps> = ({
  jobRowId,
  priceWork,
  onPriceWorkChange,
  readOnly,
}) => {
  const [open, setOpen] = useState(false);

  const fields = buildPriceWorkUpdate(priceWork);
  const trenchLive = liveTrenchTotal(priceWork);
  const jointLive = liveJointTotal(priceWork);
  const summary = formatPriceWorkSummary(fields);
  const hasAny = localHasPriceWork(priceWork);

  // Read-only (submitted / returned): show entered values, hide entirely if empty.
  if (readOnly) {
    if (!hasAny) return null;

    const renderReadRow = (
      title: string,
      defs: PriceWorkFieldDef[],
      totalLabel: string
    ) => {
      if (!defs.some((d) => fields[d.field] !== null)) return null;
      return (
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-baseline gap-3 min-w-0">
            <span className="text-sm font-semibold text-slate-700 flex-shrink-0">
              {title}
            </span>
            <span className="text-sm text-slate-600 tabular-nums truncate">
              {defs.map((d) => `${d.label} ${fields[d.field] ?? '–'}`).join(' · ')}
            </span>
          </div>
          <span className="text-sm font-semibold text-teal-700 tabular-nums bg-teal-50 px-2.5 py-0.5 rounded flex-shrink-0">
            {totalLabel}
          </span>
        </div>
      );
    };

    return (
      <div className="px-5 py-3 border-b border-slate-100">
        <p className="text-xs font-medium text-slate-500 mb-2">Price Work</p>
        <div className="space-y-2">
          {renderReadRow('Trench', TRENCH_FIELDS, `${formatMetres(trenchLive)} m`)}
          {renderReadRow('Joint Hole', JOINT_FIELDS, `${jointLive}`)}
        </div>
      </div>
    );
  }

  const panelId = `price-work-${jobRowId}`;

  const renderSection = (
    title: string,
    defs: PriceWorkFieldDef[],
    totalLabel: string,
    unitHint: string,
    inputMode: 'decimal' | 'numeric',
    step: string
  ) => (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-slate-600">{title}</span>
        <span className="text-xs font-semibold text-teal-700 tabular-nums bg-teal-50 px-2.5 py-1 rounded-full">
          {totalLabel}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {defs.map((d) => {
          const id = `${jobRowId}-${d.field}`;
          return (
            <div key={d.field}>
              <label
                htmlFor={id}
                className="text-[11px] font-medium text-slate-500 mb-1 block"
              >
                {d.label}
              </label>
              <div className="relative">
                <input
                  id={id}
                  type="number"
                  inputMode={inputMode}
                  step={step}
                  min="0"
                  value={priceWork[d.field]}
                  onChange={(e) =>
                    onPriceWorkChange(jobRowId, d.field, e.target.value)
                  }
                  tabIndex={open ? undefined : -1}
                  placeholder="0"
                  className="w-full pl-3 pr-8 py-3 text-base border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 tabular-nums bg-white"
                />
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 pointer-events-none">
                  {unitHint}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="px-5 py-3 border-b border-slate-100">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={panelId}
        className="w-full flex items-center justify-between gap-2 min-h-[44px] px-3 py-2.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:border-teal-300 hover:text-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-500 transition-colors cursor-pointer"
      >
        <span className="flex items-center gap-2">
          <PoundSterling className="h-4 w-4" />
          <span className="text-sm font-medium">Price Work</span>
        </span>
        <ChevronDown
          className={`h-4 w-4 transition-transform duration-200 ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>

      {!open && summary && (
        <div className="mt-2">
          <span className="inline-flex items-center text-xs font-medium text-teal-700 bg-teal-50 border border-teal-100 px-2.5 py-1 rounded-full">
            {summary}
          </span>
        </div>
      )}

      <div
        id={panelId}
        className={`grid transition-[grid-template-rows] duration-200 ease-in-out motion-reduce:transition-none ${
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        }`}
      >
        <div className="overflow-hidden">
          <div className="pt-3 space-y-4">
            {renderSection(
              'Trench (metres)',
              TRENCH_FIELDS,
              `${formatMetres(trenchLive)} m`,
              'm',
              'decimal',
              '0.01'
            )}
            {renderSection(
              'Joint Hole (count)',
              JOINT_FIELDS,
              `${jointLive}`,
              'no.',
              'numeric',
              '1'
            )}
            <p className="text-xs text-slate-400">
              F/W = Footway · C/W = Carriageway
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
