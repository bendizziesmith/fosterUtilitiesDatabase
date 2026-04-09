import React from 'react';
import { Calendar, User, Car, Users } from 'lucide-react';
import { TimesheetWeek } from '../../../../lib/timesheetService';
import { formatWeekEnding, getRecentSundays } from '../../../../lib/timesheetUtils';

interface TimesheetHeaderProps {
  timesheet: TimesheetWeek;
  weekEnding: string;
  labourer1: string;
  labourer2: string;
  onLabourer1Change: (value: string) => void;
  onLabourer2Change: (value: string) => void;
  onWeekEndingChange: (value: string) => void;
  readOnly: boolean;
}

export const TimesheetHeader: React.FC<TimesheetHeaderProps> = ({
  timesheet,
  weekEnding,
  labourer1,
  labourer2,
  onLabourer1Change,
  onLabourer2Change,
  onWeekEndingChange,
  readOnly,
}) => {
  const sundayOptions = getRecentSundays(8);

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
      <div className="px-5 py-4 bg-gradient-to-r from-slate-800 to-slate-700">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-white/10 rounded-lg">
            <Calendar className="h-5 w-5 text-white" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-white">
              Timesheet Details
            </h3>
            <p className="text-xs text-slate-300">
              Week ending {formatWeekEnding(weekEnding)}
            </p>
          </div>
        </div>
      </div>

      <div className="p-5 space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
              <Calendar className="h-3.5 w-3.5" />
              Week Ending (Sunday)
            </label>
            {readOnly ? (
              <p className="text-base font-semibold text-slate-900">
                {formatWeekEnding(weekEnding)}
              </p>
            ) : (
              <select
                value={weekEnding}
                onChange={(e) => onWeekEndingChange(e.target.value)}
                className="w-full px-4 py-3 text-base border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 bg-white"
              >
                {sundayOptions.map((sunday) => (
                  <option key={sunday} value={sunday}>
                    {formatWeekEnding(sunday)}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
              <User className="h-3.5 w-3.5" />
              Ganger
            </label>
            <p className="text-base font-semibold text-slate-900">
              {timesheet.ganger_name_snapshot}
            </p>
          </div>
        </div>

        <div>
          <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
            <Car className="h-3.5 w-3.5" />
            Assigned Vehicle
          </label>
          {timesheet.vehicle_registration_snapshot ? (
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-slate-100 rounded-lg">
              <Car className="h-4 w-4 text-slate-500" />
              <span className="text-base font-medium text-slate-900">
                {timesheet.vehicle_registration_snapshot}
              </span>
            </div>
          ) : (
            <p className="text-sm text-slate-400 italic">
              No vehicle assigned
            </p>
          )}
        </div>

        <div className="border-t border-slate-200 pt-5">
          <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
            <Users className="h-3.5 w-3.5" />
            Labourers
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-slate-500 mb-1 block">
                Labourer 1
              </label>
              {readOnly ? (
                <p className="text-sm text-slate-900">
                  {labourer1 || <span className="text-slate-400 italic">-</span>}
                </p>
              ) : (
                <input
                  type="text"
                  value={labourer1}
                  onChange={(e) => onLabourer1Change(e.target.value)}
                  placeholder="Full name"
                  className="w-full px-4 py-3 text-base border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                />
              )}
            </div>

            <div>
              <label className="text-xs text-slate-500 mb-1 block">
                Labourer 2
              </label>
              {readOnly ? (
                <p className="text-sm text-slate-900">
                  {labourer2 || <span className="text-slate-400 italic">-</span>}
                </p>
              ) : (
                <input
                  type="text"
                  value={labourer2}
                  onChange={(e) => onLabourer2Change(e.target.value)}
                  placeholder="Full name"
                  className="w-full px-4 py-3 text-base border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
