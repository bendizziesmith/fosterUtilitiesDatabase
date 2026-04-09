import React from 'react';
import { Calendar, User, Car } from 'lucide-react';
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
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <div className="px-5 py-4 bg-gradient-to-r from-slate-50 to-white border-b border-slate-200">
        <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">
          Timesheet Details
        </h3>
      </div>

      <div className="p-5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="flex items-center gap-1.5 text-xs font-medium text-slate-500 mb-1.5">
              <Calendar className="h-3.5 w-3.5" />
              Week Ending (Sunday)
            </label>
            {readOnly ? (
              <p className="text-sm font-medium text-slate-900 py-2">
                {formatWeekEnding(weekEnding)}
              </p>
            ) : (
              <select
                value={weekEnding}
                onChange={(e) => onWeekEndingChange(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 bg-white"
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
            <label className="flex items-center gap-1.5 text-xs font-medium text-slate-500 mb-1.5">
              <User className="h-3.5 w-3.5" />
              Ganger
            </label>
            <p className="text-sm font-medium text-slate-900 py-2">
              {timesheet.ganger_name_snapshot}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="flex items-center gap-1.5 text-xs font-medium text-slate-500 mb-1.5">
              <Car className="h-3.5 w-3.5" />
              Vehicle
            </label>
            {timesheet.vehicle_registration_snapshot ? (
              <p className="text-sm font-medium text-slate-900 py-2">
                {timesheet.vehicle_registration_snapshot}
              </p>
            ) : (
              <p className="text-sm text-slate-400 italic py-2">
                No vehicle assigned
              </p>
            )}
          </div>

          <div>
            <label className="text-xs font-medium text-slate-500 mb-1.5 block">
              Labourer 1
            </label>
            {readOnly ? (
              <p className="text-sm text-slate-900 py-2">
                {labourer1 || <span className="text-slate-400 italic">-</span>}
              </p>
            ) : (
              <input
                type="text"
                value={labourer1}
                onChange={(e) => onLabourer1Change(e.target.value)}
                placeholder="Name"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
              />
            )}
          </div>

          <div>
            <label className="text-xs font-medium text-slate-500 mb-1.5 block">
              Labourer 2
            </label>
            {readOnly ? (
              <p className="text-sm text-slate-900 py-2">
                {labourer2 || <span className="text-slate-400 italic">-</span>}
              </p>
            ) : (
              <input
                type="text"
                value={labourer2}
                onChange={(e) => onLabourer2Change(e.target.value)}
                placeholder="Name"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
