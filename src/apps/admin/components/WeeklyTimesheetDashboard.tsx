import React, { useState } from 'react';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  FileText,
} from 'lucide-react';
import { TimesheetComplianceCard } from './TimesheetComplianceCard';
import { TimesheetAdminList } from './TimesheetAdminList';
import { formatWeekEnding } from '../../../lib/timesheetUtils';

function getPreviousSunday(): string {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? 7 : day;
  const prev = new Date(now);
  prev.setDate(now.getDate() - diff);
  const y = prev.getFullYear();
  const m = String(prev.getMonth() + 1).padStart(2, '0');
  const d = String(prev.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function shiftWeek(dateStr: string, direction: number): string {
  const date = new Date(dateStr + 'T00:00:00');
  date.setDate(date.getDate() + 7 * direction);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

interface WeeklyTimesheetDashboardProps {
  onViewTimesheet: (id: string) => void;
}

export const WeeklyTimesheetDashboard: React.FC<WeeklyTimesheetDashboardProps> = ({
  onViewTimesheet,
}) => {
  const [weekEnding, setWeekEnding] = useState(getPreviousSunday());

  return (
    <div className="space-y-5">
      <div className="bg-white border border-slate-200 rounded-xl px-5 py-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FileText className="h-5 w-5 text-teal-600" />
            <h2 className="text-base font-bold text-slate-900">
              Weekly Timesheets
            </h2>
          </div>

          <div className="flex items-center gap-1 bg-slate-50 rounded-lg px-2 py-1.5">
            <button
              onClick={() => setWeekEnding(shiftWeek(weekEnding, -1))}
              className="p-1.5 hover:bg-slate-200 rounded-md transition-colors"
            >
              <ChevronLeft className="h-4 w-4 text-slate-600" />
            </button>
            <div className="flex items-center gap-2 px-2">
              <Calendar className="h-3.5 w-3.5 text-slate-400" />
              <span className="text-sm font-semibold text-slate-800 whitespace-nowrap">
                WE {formatWeekEnding(weekEnding)}
              </span>
            </div>
            <button
              onClick={() => setWeekEnding(shiftWeek(weekEnding, 1))}
              className="p-1.5 hover:bg-slate-200 rounded-md transition-colors"
            >
              <ChevronRight className="h-4 w-4 text-slate-600" />
            </button>
          </div>
        </div>
      </div>

      <TimesheetComplianceCard weekEnding={weekEnding} />

      <TimesheetAdminList
        onViewTimesheet={onViewTimesheet}
        weekEnding={weekEnding}
      />
    </div>
  );
};
