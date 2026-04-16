import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ArrowLeft,
  Save,
  Send,
  Plus,
  AlertTriangle,
  Clock,
  RotateCcw,
  FileText,
} from 'lucide-react';
import { Employee } from '../../../lib/supabase';
import {
  TimesheetWeek,
  TimesheetJobRow,
  loadTimesheetForWeek,
  createTimesheetWeek,
  saveTimesheetHeader,
  addJobRow,
  updateJobRow,
  deleteJobRow,
  deleteDayEntry,
  upsertDayEntry,
  recalculateWeeklyTotal,
  submitTimesheet,
} from '../../../lib/timesheetService';
import {
  DAYS_OF_WEEK,
  DayOfWeek,
  calculateDayHours,
  parseTimeToMinutes,
  formatHoursDecimal,
  formatWeekEnding,
  getStatusInfo,
} from '../../../lib/timesheetUtils';
import { TimesheetHeader } from './timesheet/TimesheetHeader';
import { JobRowCard, LocalDayEntry } from './timesheet/JobRowCard';

interface TimesheetEditorProps {
  employee: Employee;
  weekEnding: string;
  onBack: () => void;
}

interface LocalJobRow extends TimesheetJobRow {
  localEntries: LocalDayEntry[];
  localDefaultStart: string;
  localDefaultFinish: string;
}

export const TimesheetEditor: React.FC<TimesheetEditorProps> = ({
  employee,
  weekEnding: initialWeekEnding,
  onBack,
}) => {
  const [timesheet, setTimesheet] = useState<TimesheetWeek | null>(null);
  const [jobRows, setJobRows] = useState<LocalJobRow[]>([]);
  const [labourer1, setLabourer1] = useState('');
  const [labourer2, setLabourer2] = useState('');
  const [weeklyNotes, setWeeklyNotes] = useState('');
  const [weekEnding, setWeekEnding] = useState(initialWeekEnding);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showConfirmSubmit, setShowConfirmSubmit] = useState(false);
  const [weeklyTotal, setWeeklyTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState<string | null>(null);

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const timesheetRef = useRef(timesheet);
  const jobRowsRef = useRef(jobRows);
  const labourer1Ref = useRef(labourer1);
  const labourer2Ref = useRef(labourer2);
  const weeklyNotesRef = useRef(weeklyNotes);

  useEffect(() => { timesheetRef.current = timesheet; }, [timesheet]);
  useEffect(() => { jobRowsRef.current = jobRows; }, [jobRows]);
  useEffect(() => { labourer1Ref.current = labourer1; }, [labourer1]);
  useEffect(() => { labourer2Ref.current = labourer2; }, [labourer2]);
  useEffect(() => { weeklyNotesRef.current = weeklyNotes; }, [weeklyNotes]);

  useEffect(() => {
    loadTimesheet();
  }, [employee.id, weekEnding]);

  const loadTimesheet = async () => {
    try {
      setLoading(true);
      setError(null);

      let sheet = await loadTimesheetForWeek(employee.id, weekEnding);

      if (!sheet) {
        sheet = await createTimesheetWeek(employee, weekEnding);
        sheet.job_rows = [];
      }

      setTimesheet(sheet);
      setLabourer1(sheet.labourer_1_name || '');
      setLabourer2(sheet.labourer_2_name || '');
      setWeeklyNotes(sheet.weekly_notes || '');
      setWeeklyTotal(sheet.weekly_total_hours || 0);

      const rows: LocalJobRow[] = (sheet.job_rows || []).map((row) => ({
        ...row,
        localEntries: buildLocalEntries(row.day_entries || []),
        localDefaultStart: row.default_start_time || '',
        localDefaultFinish: row.default_finish_time || '',
      }));

      setJobRows(rows);
    } catch (err) {
      console.error('Failed to load timesheet:', err);
      setError('Failed to load timesheet. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const buildLocalEntries = (
    dbEntries: { day_of_week: string; start_time: string | null; finish_time: string | null; hours_total: number }[]
  ): LocalDayEntry[] => {
    return DAYS_OF_WEEK.map((day) => {
      const existing = dbEntries.find((e) => e.day_of_week === day);
      if (existing) {
        return {
          day_of_week: day,
          start_time: existing.start_time || '',
          finish_time: existing.finish_time || '',
          hours_total: existing.hours_total || 0,
        };
      }
      return {
        day_of_week: day,
        start_time: '',
        finish_time: '',
        hours_total: 0,
      };
    });
  };

  const isEditable =
    timesheet?.status === 'draft' || timesheet?.status === 'returned';

  const handleJobFieldChange = useCallback(
    (jobRowId: string, field: 'job_number' | 'job_address' | 'default_start_time' | 'default_finish_time', value: string) => {
      setJobRows((prev) =>
        prev.map((row) => {
          if (row.id !== jobRowId) return row;

          if (field === 'default_start_time') {
            const updated = { ...row, localDefaultStart: value };
            updated.localEntries = updated.localEntries.map((entry) => {
              if (!entry.start_time && !entry.finish_time) return entry;
              if (entry.start_time === row.localDefaultStart || !entry.start_time) {
                const newEntry = { ...entry, start_time: value };
                newEntry.hours_total = calculateDayHours(
                  newEntry.start_time || null,
                  newEntry.finish_time || null
                );
                return newEntry;
              }
              return entry;
            });
            return updated;
          }

          if (field === 'default_finish_time') {
            const updated = { ...row, localDefaultFinish: value };
            updated.localEntries = updated.localEntries.map((entry) => {
              if (!entry.start_time && !entry.finish_time) return entry;
              if (entry.finish_time === row.localDefaultFinish || !entry.finish_time) {
                const newEntry = { ...entry, finish_time: value };
                newEntry.hours_total = calculateDayHours(
                  newEntry.start_time || null,
                  newEntry.finish_time || null
                );
                return newEntry;
              }
              return entry;
            });
            return updated;
          }

          return { ...row, [field]: value };
        })
      );
      scheduleSave();
    },
    []
  );

  const handleDayToggle = useCallback(
    (jobRowId: string, day: DayOfWeek, selected: boolean) => {
      setJobRows((prev) =>
        prev.map((row) => {
          if (row.id !== jobRowId) return row;
          const newEntries = row.localEntries.map((entry) => {
            if (entry.day_of_week !== day) return entry;
            if (selected) {
              const updated = {
                ...entry,
                start_time: row.localDefaultStart,
                finish_time: row.localDefaultFinish,
                hours_total: 0,
              };
              updated.hours_total = calculateDayHours(
                updated.start_time || null,
                updated.finish_time || null
              );
              return updated;
            }
            return { ...entry, start_time: '', finish_time: '', hours_total: 0 };
          });
          return { ...row, localEntries: newEntries };
        })
      );
      scheduleSave();
    },
    []
  );

  const handleDayEntryChange = useCallback(
    (
      jobRowId: string,
      day: DayOfWeek,
      field: 'start_time' | 'finish_time',
      value: string
    ) => {
      setJobRows((prev) =>
        prev.map((row) => {
          if (row.id !== jobRowId) return row;
          const newEntries = row.localEntries.map((entry) => {
            if (entry.day_of_week !== day) return entry;
            const updated = { ...entry, [field]: value };
            updated.hours_total = calculateDayHours(
              updated.start_time || null,
              updated.finish_time || null
            );
            return updated;
          });
          return { ...row, localEntries: newEntries };
        })
      );
      scheduleSave();
    },
    []
  );

  const scheduleSave = useCallback(() => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      performSave();
    }, 1500);
  }, []);

  const performSave = async () => {
    const ts = timesheetRef.current;
    if (!ts) return;
    try {
      setSaving(true);

      await saveTimesheetHeader(ts.id, {
        labourer_1_name: labourer1Ref.current || null,
        labourer_2_name: labourer2Ref.current || null,
        weekly_notes: weeklyNotesRef.current || null,
      });

      const currentRows = jobRowsRef.current;
      for (const row of currentRows) {
        await updateJobRow(row.id, {
          job_number: row.job_number,
          job_address: row.job_address,
          sort_order: row.sort_order,
          default_start_time: row.localDefaultStart || null,
          default_finish_time: row.localDefaultFinish || null,
        });

        for (const entry of row.localEntries) {
          if (entry.start_time || entry.finish_time) {
            await upsertDayEntry(
              row.id,
              entry.day_of_week,
              entry.start_time || null,
              entry.finish_time || null
            );
          } else {
            await deleteDayEntry(row.id, entry.day_of_week);
          }
        }
      }

      const total = await recalculateWeeklyTotal(ts.id);
      setWeeklyTotal(total);
      setLastSaved(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }));
    } catch (err) {
      console.error('Save failed:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveDraft = async () => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    await performSave();
  };

  const handleAddJobRow = async () => {
    if (!timesheet) return;
    try {
      const sortOrder = jobRows.length;
      const newRow = await addJobRow(timesheet.id, sortOrder);
      setJobRows((prev) => [
        ...prev,
        {
          ...newRow,
          localEntries: buildLocalEntries([]),
          localDefaultStart: '',
          localDefaultFinish: '',
        },
      ]);
    } catch (err) {
      console.error('Failed to add job row:', err);
    }
  };

  const handleDeleteJobRow = async (jobRowId: string) => {
    try {
      await deleteJobRow(jobRowId);
      setJobRows((prev) => prev.filter((r) => r.id !== jobRowId));
      if (timesheet) {
        const total = await recalculateWeeklyTotal(timesheet.id);
        setWeeklyTotal(total);
      }
    } catch (err) {
      console.error('Failed to delete job row:', err);
    }
  };

  const handleSubmit = async () => {
    if (!timesheet) return;

    const hasAnyData = jobRows.some((row) =>
      row.localEntries.some((e) => e.start_time || e.finish_time)
    );

    if (!hasAnyData) {
      setError('Cannot submit an empty timesheet. Please add work entries first.');
      setShowConfirmSubmit(false);
      return;
    }

    const invalidTimes = jobRows.some((row) =>
      row.localEntries.some((e) => {
        if (e.start_time && e.finish_time) {
          const s = parseTimeToMinutes(e.start_time);
          const f = parseTimeToMinutes(e.finish_time);
          return f <= s;
        }
        return false;
      })
    );

    if (invalidTimes) {
      setError('Some entries have a finish time before the start time. Please correct them.');
      setShowConfirmSubmit(false);
      return;
    }

    try {
      setSubmitting(true);
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      await performSave();
      await submitTimesheet(timesheet.id);
      setTimesheet((prev) =>
        prev ? { ...prev, status: 'submitted' } : prev
      );
      setShowConfirmSubmit(false);
    } catch (err) {
      console.error('Submit failed:', err);
      setError('Failed to submit timesheet. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleWeekEndingChange = (newWeek: string) => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    setWeekEnding(newWeek);
  };

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    const total = jobRows.reduce(
      (sum, row) =>
        sum + row.localEntries.reduce((s, e) => s + e.hours_total, 0),
      0
    );
    setWeeklyTotal(Math.round(total * 100) / 100);
  }, [jobRows]);

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto flex justify-center py-16">
        <div className="w-6 h-6 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!timesheet) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
          <p className="text-sm text-red-700">
            Failed to load timesheet. Please go back and try again.
          </p>
          <button
            onClick={onBack}
            className="mt-3 text-sm text-red-600 hover:text-red-700 font-medium"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const statusInfo = getStatusInfo(timesheet.status);

  return (
    <div className="max-w-3xl mx-auto space-y-4 pb-32">
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>

        <div className="flex items-center gap-3">
          <span
            className={`inline-flex items-center px-2.5 py-1 text-xs font-medium rounded border ${statusInfo.color} ${statusInfo.bgColor} ${statusInfo.borderColor}`}
          >
            {statusInfo.label}
          </span>
          {saving && (
            <span className="text-xs text-slate-400 flex items-center gap-1">
              <div className="w-3 h-3 border-2 border-slate-300 border-t-slate-500 rounded-full animate-spin" />
              Saving
            </span>
          )}
          {!saving && lastSaved && (
            <span className="text-xs text-slate-400">
              Saved {lastSaved}
            </span>
          )}
        </div>
      </div>

      {timesheet.status === 'returned' && timesheet.returned_reason && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <RotateCcw className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-red-800">
                Returned by employer
              </p>
              <p className="text-sm text-red-700 mt-1">
                {timesheet.returned_reason}
              </p>
              <p className="text-xs text-red-500 mt-2">
                Please make corrections and resubmit.
              </p>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-500" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
          <button
            onClick={() => setError(null)}
            className="text-xs text-red-500 mt-1 hover:text-red-700"
          >
            Dismiss
          </button>
        </div>
      )}

      <TimesheetHeader
        timesheet={timesheet}
        weekEnding={weekEnding}
        labourer1={labourer1}
        labourer2={labourer2}
        weeklyNotes={weeklyNotes}
        onLabourer1Change={(v) => {
          setLabourer1(v);
          scheduleSave();
        }}
        onLabourer2Change={(v) => {
          setLabourer2(v);
          scheduleSave();
        }}
        onWeeklyNotesChange={(v) => {
          setWeeklyNotes(v);
          scheduleSave();
        }}
        onWeekEndingChange={handleWeekEndingChange}
        readOnly={!isEditable}
      />

      <div className="space-y-3">
        {jobRows.map((row, index) => (
          <JobRowCard
            key={row.id}
            jobRow={row}
            index={index}
            localEntries={row.localEntries}
            defaultStart={row.localDefaultStart}
            defaultFinish={row.localDefaultFinish}
            onJobFieldChange={handleJobFieldChange}
            onDayEntryChange={handleDayEntryChange}
            onDayToggle={handleDayToggle}
            onDeleteRow={handleDeleteJobRow}
            readOnly={!isEditable}
          />
        ))}

        {isEditable && (
          <button
            onClick={handleAddJobRow}
            className="w-full py-3.5 border-2 border-dashed border-slate-300 rounded-xl text-sm font-medium text-slate-500 hover:border-teal-400 hover:text-teal-600 hover:bg-teal-50/50 transition-all flex items-center justify-center gap-2"
          >
            <Plus className="h-4 w-4" />
            Add New Job
          </button>
        )}
      </div>

      {jobRows.length === 0 && !isEditable && (
        <div className="text-center py-8">
          <p className="text-sm text-slate-400">No job rows recorded</p>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-slate-500" />
            <span className="text-sm font-medium text-slate-700">
              Weekly Total
            </span>
          </div>
          <span className="text-xl font-bold text-slate-900 tabular-nums">
            {formatHoursDecimal(weeklyTotal)} hours
          </span>
        </div>
      </div>

      {!isEditable && weeklyNotes && (
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="flex items-start gap-2">
            <FileText className="h-4 w-4 text-slate-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs font-medium text-slate-500 mb-1">Weekly Notes</p>
              <p className="text-sm text-slate-700 whitespace-pre-wrap">{weeklyNotes}</p>
            </div>
          </div>
        </div>
      )}

      {isEditable && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 p-4 z-40">
          <div className="max-w-3xl mx-auto flex items-center gap-3">
            <button
              onClick={handleSaveDraft}
              disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 border border-slate-300 text-slate-700 rounded-lg font-medium text-sm hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {saving ? 'Saving...' : 'Save Draft'}
            </button>
            <button
              onClick={() => setShowConfirmSubmit(true)}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-medium text-sm transition-colors"
            >
              <Send className="h-4 w-4" />
              Submit
            </button>
          </div>
        </div>
      )}

      {showConfirmSubmit && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-2">
              Submit Timesheet?
            </h3>
            <p className="text-sm text-slate-600 mb-2">
              Are you sure you want to submit this timesheet?
            </p>
            <p className="text-sm text-slate-500 mb-6">
              Week ending {formatWeekEnding(weekEnding)} -{' '}
              {formatHoursDecimal(weeklyTotal)} total hours
            </p>
            <p className="text-xs text-slate-400 mb-6">
              You will not be able to edit it unless the employer returns it.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirmSubmit(false)}
                disabled={submitting}
                className="flex-1 px-4 py-2.5 border border-slate-300 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="flex-1 px-4 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    Submit
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
