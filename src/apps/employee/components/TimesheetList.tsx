import React, { useState, useEffect } from 'react';
import {
  FileText,
  ChevronRight,
  Clock,
  Calendar,
  ArrowLeft,
} from 'lucide-react';
import { Employee } from '../../../lib/supabase';
import {
  TimesheetWeek,
  loadGangerTimesheets,
  createTimesheetWeek,
} from '../../../lib/timesheetService';
import {
  getWeekEndingSunday,
  formatWeekEnding,
  formatHoursDecimal,
  getStatusInfo,
} from '../../../lib/timesheetUtils';

interface TimesheetListProps {
  employee: Employee;
  onOpenTimesheet: (weekEnding: string) => void;
  onBack: () => void;
}

export const TimesheetList: React.FC<TimesheetListProps> = ({
  employee,
  onOpenTimesheet,
  onBack,
}) => {
  const [timesheets, setTimesheets] = useState<TimesheetWeek[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const currentWeekEnding = getWeekEndingSunday();

  useEffect(() => {
    loadTimesheets();
  }, [employee.id]);

  const loadTimesheets = async () => {
    try {
      setLoading(true);
      const data = await loadGangerTimesheets(employee.id);
      setTimesheets(data);
    } catch (err) {
      console.error('Failed to load timesheets:', err);
    } finally {
      setLoading(false);
    }
  };

  const currentWeekSheet = timesheets.find(
    (t) => t.week_ending === currentWeekEnding
  );

  const handleCreateOrOpen = async () => {
    if (currentWeekSheet) {
      onOpenTimesheet(currentWeekEnding);
      return;
    }

    try {
      setCreating(true);
      await createTimesheetWeek(employee, currentWeekEnding);
      onOpenTimesheet(currentWeekEnding);
    } catch (err) {
      console.error('Failed to create timesheet:', err);
    } finally {
      setCreating(false);
    }
  };

  const previousSheets = timesheets.filter(
    (t) => t.week_ending !== currentWeekEnding
  );

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Home
      </button>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-6 py-5 bg-gradient-to-r from-slate-800 to-slate-700">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-teal-500 rounded-lg">
              <FileText className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">
                Weekly Timesheets
              </h2>
              <p className="text-xs text-slate-300">
                {employee.full_name} - Weekly work records
              </p>
            </div>
          </div>
        </div>

        <div className="p-5">
          <div className="mb-2">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-3">
              Current Week
            </p>
          </div>

          <div
            role="button"
            tabIndex={0}
            onClick={handleCreateOrOpen}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleCreateOrOpen();
              }
            }}
            className={`p-4 rounded-lg border-2 transition-all cursor-pointer group ${
              currentWeekSheet
                ? 'border-slate-200 bg-white hover:border-teal-300 hover:shadow-sm'
                : 'border-dashed border-teal-300 bg-teal-50/50 hover:border-teal-400 hover:bg-teal-50'
            } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 active:bg-slate-50/50`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-teal-100 rounded-lg">
                  <Calendar className="h-5 w-5 text-teal-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    Week Ending {formatWeekEnding(currentWeekEnding)}
                  </p>
                  {currentWeekSheet ? (
                    <div className="flex items-center gap-3 mt-1">
                      <StatusBadge status={currentWeekSheet.status} />
                      {currentWeekSheet.weekly_total_hours > 0 && (
                        <span className="text-xs text-slate-500">
                          {formatHoursDecimal(
                            currentWeekSheet.weekly_total_hours
                          )}{' '}
                          hrs
                        </span>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500 mt-1">
                      Tap to start this week's timesheet
                    </p>
                  )}
                </div>
              </div>

              {creating ? (
                <div className="w-5 h-5 border-2 border-slate-300 border-t-teal-600 rounded-full animate-spin flex-shrink-0" />
              ) : (
                <ChevronRight className="h-5 w-5 text-slate-300 group-hover:text-teal-500 transition-colors flex-shrink-0" />
              )}
            </div>
          </div>
        </div>
      </div>

      {!loading && previousSheets.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-200">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
              Previous Weeks
            </p>
          </div>
          <div className="divide-y divide-slate-100">
            {previousSheets.map((sheet) => (
              <button
                key={sheet.id}
                onClick={() => onOpenTimesheet(sheet.week_ending)}
                className="w-full px-5 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="p-1.5 bg-slate-100 rounded">
                    <FileText className="h-4 w-4 text-slate-500" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-medium text-slate-900">
                      Week Ending {formatWeekEnding(sheet.week_ending)}
                    </p>
                    <div className="flex items-center gap-3 mt-0.5">
                      <StatusBadge status={sheet.status} />
                      {sheet.weekly_total_hours > 0 && (
                        <span className="text-xs text-slate-500">
                          {formatHoursDecimal(sheet.weekly_total_hours)} hrs
                        </span>
                      )}
                      {sheet.submitted_at && (
                        <span className="text-xs text-slate-400">
                          Submitted{' '}
                          {new Date(sheet.submitted_at).toLocaleDateString(
                            'en-GB',
                            { day: 'numeric', month: 'short' }
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-slate-400" />
              </button>
            ))}
          </div>
        </div>
      )}

      {loading && (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
        </div>
      )}

      {!loading && timesheets.length === 0 && (
        <div className="text-center py-8">
          <div className="w-14 h-14 mx-auto mb-4 bg-slate-100 rounded-full flex items-center justify-center">
            <Clock className="h-7 w-7 text-slate-400" />
          </div>
          <p className="text-sm text-slate-500 mb-1">No timesheets yet</p>
          <p className="text-xs text-slate-400">
            Start your first weekly timesheet above
          </p>
        </div>
      )}
    </div>
  );
};

function StatusBadge({ status }: { status: string }) {
  const info = getStatusInfo(status);
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded border ${info.color} ${info.bgColor} ${info.borderColor}`}
    >
      {info.label}
    </span>
  );
}
