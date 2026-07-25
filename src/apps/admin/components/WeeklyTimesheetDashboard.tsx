import React, { useState } from 'react';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
} from 'lucide-react';
import { TimesheetComplianceCard, ComplianceCounts } from './TimesheetComplianceCard';
import { formatWeekEnding } from '../../../lib/timesheetUtils';
import { loadTimesheetsForWeek } from '../../../lib/timesheetService';
import { downloadTimesheetsZip } from '../../../lib/timesheetBulkExport';

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
  const [counts, setCounts] = useState<ComplianceCounts | null>(null);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [note, setNote] = useState<string | null>(null);

  const changeWeek = (direction: number) => {
    setWeekEnding(shiftWeek(weekEnding, direction));
    setCounts(null); // counts belong to the previous week until the card reloads
    setNote(null);
  };

  const countsReady = counts !== null;
  const downloadable = counts ? counts.downloadable : 0;
  const noneToDownload = countsReady && downloadable === 0;

  const handleDownloadAll = async () => {
    setNote(null);
    setGenerating(true);
    setProgress({ done: 0, total: 0 });
    try {
      const timesheets = await loadTimesheetsForWeek(weekEnding);
      if (timesheets.length === 0) {
        setNote('No timesheets to download for this week.');
        return;
      }
      const summary = await downloadTimesheetsZip(timesheets, weekEnding, {
        onProgress: (done, total) => setProgress({ done, total }),
      });
      if (summary.failed.length > 0) {
        setNote(
          `Downloaded ${summary.succeeded} of ${summary.total}. ${summary.failed.length} could not be generated.`
        );
      }
    } catch (err) {
      console.error('Failed to download timesheets:', err);
      setNote('Download failed. Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  let buttonLabel: string;
  if (generating) {
    buttonLabel = `Generating ${progress.done}/${progress.total} PDFs…`;
  } else if (noneToDownload) {
    buttonLabel = 'No timesheets to download';
  } else {
    buttonLabel = `Download all${downloadable > 0 ? ` (${downloadable})` : ''}`;
  }

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
              onClick={() => changeWeek(-1)}
              aria-label="Previous week"
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
              onClick={() => changeWeek(1)}
              aria-label="Next week"
              className="p-1.5 hover:bg-slate-200 rounded-md transition-colors"
            >
              <ChevronRight className="h-4 w-4 text-slate-600" />
            </button>
          </div>
        </div>

        <div className="mt-3.5 pt-3.5 border-t border-slate-100 flex items-center justify-between gap-3">
          <p
            className={`text-xs ${note ? 'text-amber-700' : 'text-slate-500'}`}
            role={note ? 'status' : undefined}
            aria-live="polite"
          >
            {note ??
              (generating
                ? 'Building one PDF per ganger, then a single ZIP…'
                : 'One PDF per submitted ganger, bundled into a single ZIP.')}
          </p>
          <button
            onClick={handleDownloadAll}
            disabled={generating || !countsReady || downloadable === 0}
            className="flex items-center gap-2 px-5 py-2.5 bg-teal-600 text-white rounded-lg font-medium text-sm hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap shrink-0"
          >
            {generating ? (
              <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            {buttonLabel}
          </button>
        </div>
      </div>

      <TimesheetComplianceCard
        weekEnding={weekEnding}
        onViewTimesheet={onViewTimesheet}
        onCountsChange={setCounts}
      />
    </div>
  );
};
