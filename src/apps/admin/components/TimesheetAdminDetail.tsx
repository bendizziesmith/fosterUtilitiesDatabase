import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  RotateCcw,
  Calendar,
  User,
  Car,
  Clock,
  FileText,
  Users,
  CheckCircle,
  AlertTriangle,
  Download,
} from 'lucide-react';
import {
  TimesheetWeek,
  TimesheetJobRow,
  loadTimesheetDetail,
  returnTimesheet,
} from '../../../lib/timesheetService';
import {
  DAYS_OF_WEEK,
  DAY_LABELS,
  formatWeekEnding,
  formatHoursDecimal,
  getStatusInfo,
  downloadTimesheetCSV,
} from '../../../lib/timesheetUtils';

interface TimesheetAdminDetailProps {
  timesheetId: string;
  onBack: () => void;
}

export const TimesheetAdminDetail: React.FC<TimesheetAdminDetailProps> = ({
  timesheetId,
  onBack,
}) => {
  const [timesheet, setTimesheet] = useState<TimesheetWeek | null>(null);
  const [loading, setLoading] = useState(true);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [returnReason, setReturnReason] = useState('');
  const [returning, setReturning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDetail();
  }, [timesheetId]);

  const loadDetail = async () => {
    try {
      setLoading(true);
      const data = await loadTimesheetDetail(timesheetId);
      setTimesheet(data);
    } catch (err) {
      console.error('Failed to load timesheet detail:', err);
      setError('Failed to load timesheet details.');
    } finally {
      setLoading(false);
    }
  };

  const handleReturn = async () => {
    if (!returnReason.trim()) return;
    try {
      setReturning(true);
      await returnTimesheet(timesheetId, returnReason.trim());
      setShowReturnModal(false);
      setReturnReason('');
      await loadDetail();
    } catch (err) {
      console.error('Failed to return timesheet:', err);
      setError('Failed to return timesheet. Please try again.');
    } finally {
      setReturning(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-6 h-6 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!timesheet) {
    return (
      <div className="text-center py-12">
        <p className="text-sm text-slate-500">Timesheet not found.</p>
        <button
          onClick={onBack}
          className="mt-3 text-sm text-blue-600 hover:text-blue-700 font-medium"
        >
          Back to list
        </button>
      </div>
    );
  }

  const gangerName =
    (timesheet.ganger as any)?.full_name ||
    timesheet.ganger_name_snapshot ||
    'Unknown';
  const statusInfo = getStatusInfo(timesheet.status);
  const jobRows = timesheet.job_rows || [];

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Timesheets
      </button>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-red-500" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-6 py-5 bg-gradient-to-r from-slate-800 to-slate-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center">
                <span className="text-base font-bold text-white">
                  {gangerName
                    .split(' ')
                    .map((n: string) => n[0])
                    .join('')
                    .toUpperCase()
                    .slice(0, 2)}
                </span>
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">
                  {gangerName}
                </h2>
                <p className="text-sm text-slate-300">
                  Week Ending {formatWeekEnding(timesheet.week_ending)}
                </p>
              </div>
            </div>
            <span
              className={`inline-flex items-center px-3 py-1 text-xs font-semibold rounded border ${statusInfo.color} ${statusInfo.bgColor} ${statusInfo.borderColor}`}
            >
              {statusInfo.label}
            </span>
          </div>
        </div>

        <div className="p-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            <InfoItem
              icon={Calendar}
              label="Week Ending"
              value={formatWeekEnding(timesheet.week_ending)}
            />
            <InfoItem
              icon={Car}
              label="Vehicle"
              value={timesheet.vehicle_registration_snapshot || 'None'}
            />
            <InfoItem
              icon={Users}
              label="Labourers"
              value={
                [timesheet.labourer_1_name, timesheet.labourer_2_name]
                  .filter(Boolean)
                  .join(', ') || 'None'
              }
            />
            <InfoItem
              icon={Clock}
              label="Total Hours"
              value={`${formatHoursDecimal(timesheet.weekly_total_hours)}h`}
              highlight
            />
          </div>

          {timesheet.submitted_at && (
            <div className="flex items-center gap-2 text-xs text-slate-500 mb-4">
              <CheckCircle className="h-3.5 w-3.5 text-blue-500" />
              Submitted{' '}
              {new Date(timesheet.submitted_at).toLocaleDateString('en-GB', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
              {timesheet.submission_count > 1 && (
                <span className="text-slate-400">
                  ({timesheet.submission_count} submissions)
                </span>
              )}
            </div>
          )}

          {timesheet.status === 'returned' && timesheet.returned_reason && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
              <div className="flex items-start gap-3">
                <RotateCcw className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-red-800">
                    Returned to ganger
                  </p>
                  <p className="text-sm text-red-700 mt-1">
                    {timesheet.returned_reason}
                  </p>
                  {timesheet.returned_at && (
                    <p className="text-xs text-red-500 mt-2">
                      Returned{' '}
                      {new Date(timesheet.returned_at).toLocaleDateString(
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
            </div>
          )}
        </div>
      </div>

      {jobRows.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-lg p-8 text-center">
          <FileText className="h-8 w-8 text-slate-300 mx-auto mb-3" />
          <p className="text-sm text-slate-500">No job rows recorded</p>
        </div>
      ) : (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">
            Job Rows ({jobRows.length})
          </h3>
          {jobRows.map((row, index) => (
            <JobRowDetail key={row.id} row={row} index={index} />
          ))}
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-lg p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-slate-500" />
            <span className="text-base font-semibold text-slate-700">
              Weekly Total
            </span>
          </div>
          <span className="text-2xl font-bold text-slate-900 tabular-nums">
            {formatHoursDecimal(timesheet.weekly_total_hours)} hours
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <button
          onClick={() => downloadTimesheetCSV(timesheet)}
          className="flex items-center gap-2 px-5 py-2.5 border-2 border-teal-300 text-teal-700 rounded-lg font-medium text-sm hover:bg-teal-50 transition-colors"
        >
          <Download className="h-4 w-4" />
          Download CSV
        </button>
        {timesheet.status === 'submitted' && (
          <button
            onClick={() => setShowReturnModal(true)}
            className="flex items-center gap-2 px-5 py-2.5 border-2 border-red-300 text-red-700 rounded-lg font-medium text-sm hover:bg-red-50 transition-colors"
          >
            <RotateCcw className="h-4 w-4" />
            Return to Ganger
          </button>
        )}
      </div>

      {showReturnModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-2">
              Return Timesheet
            </h3>
            <p className="text-sm text-slate-600 mb-4">
              Return this timesheet to {gangerName} for corrections. A reason is
              required.
            </p>

            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Reason for return
            </label>
            <textarea
              value={returnReason}
              onChange={(e) => setReturnReason(e.target.value)}
              placeholder="Explain what needs to be corrected..."
              rows={3}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 resize-none"
            />

            <div className="flex gap-3 mt-5">
              <button
                onClick={() => {
                  setShowReturnModal(false);
                  setReturnReason('');
                }}
                disabled={returning}
                className="flex-1 px-4 py-2.5 border border-slate-300 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleReturn}
                disabled={returning || !returnReason.trim()}
                className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {returning ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <RotateCcw className="h-4 w-4" />
                    Return
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

function InfoItem({
  icon: Icon,
  label,
  value,
  highlight,
}: {
  icon: React.FC<any>;
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className="h-3.5 w-3.5 text-slate-400" />
        <span className="text-xs text-slate-500">{label}</span>
      </div>
      <p
        className={`text-sm font-medium ${
          highlight ? 'text-teal-700' : 'text-slate-900'
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function JobRowDetail({
  row,
  index,
}: {
  row: TimesheetJobRow;
  index: number;
}) {
  const dayEntries = row.day_entries || [];
  const rowTotal = dayEntries.reduce(
    (sum, e) => sum + (e.hours_total || 0),
    0
  );

  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold text-slate-400">#{index + 1}</span>
          <span className="text-sm font-semibold text-slate-900">
            {row.job_number || 'No job number'}
          </span>
          {row.job_address && (
            <span className="text-sm text-slate-500">{row.job_address}</span>
          )}
        </div>
        <span className="text-sm font-semibold text-slate-700 tabular-nums">
          {formatHoursDecimal(rowTotal)}h
        </span>
      </div>

      <div className="p-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="text-left text-xs font-medium text-slate-500 pb-2 pr-2 w-16">
                Day
              </th>
              <th className="text-left text-xs font-medium text-slate-500 pb-2 px-2">
                Start
              </th>
              <th className="text-left text-xs font-medium text-slate-500 pb-2 px-2">
                Finish
              </th>
              <th className="text-right text-xs font-medium text-slate-500 pb-2 pl-2 w-14">
                Hrs
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {DAYS_OF_WEEK.map((day) => {
              const entry = dayEntries.find((e) => e.day_of_week === day);
              if (
                !entry ||
                (!entry.start_time && !entry.finish_time)
              )
                return null;

              return (
                <tr key={day}>
                  <td className="py-2 pr-2">
                    <span className="text-xs font-semibold text-slate-600">
                      {DAY_LABELS[day]}
                    </span>
                  </td>
                  <td className="py-2 px-2 text-xs text-slate-700 tabular-nums">
                    {entry.start_time || '-'}
                  </td>
                  <td className="py-2 px-2 text-xs text-slate-700 tabular-nums">
                    {entry.finish_time || '-'}
                  </td>
                  <td className="py-2 pl-2 text-right text-xs font-medium text-slate-700 tabular-nums">
                    {entry.hours_total > 0
                      ? formatHoursDecimal(entry.hours_total)
                      : '-'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
