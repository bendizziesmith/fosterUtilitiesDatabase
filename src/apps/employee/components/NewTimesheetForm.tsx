import React from 'react';
import { Trash2 } from 'lucide-react';

/* ---------- shared entry shapes ---------- */
export interface IpsomEntry {
  id: string;
  workItem: string;
  col2: string;
  col3: string;
  col4: string;
  quantity: number;
  rate: number;
  total: number;
}

export interface MollsworthEntry {
  id: string;
  workItem: string;
  voltage: string;
  excavation: string;
  site: string;
  quantity: number;
  rate: number;
  total: number;
}

export interface DayRateEntry {
  id: string;
  day: string;
  hours: number;
  reason: string;
  supervisorName: string;
  total: number;
}

type TimesheetEntry = IpsomEntry | MollsworthEntry | DayRateEntry;

/* ---------- props ---------- */
interface TimesheetEntryCardProps {
  entry: TimesheetEntry;
  onDelete?: () => void;
}

/* ---------- component ---------- */
export const TimesheetEntryCard: React.FC<TimesheetEntryCardProps> = ({
  entry,
  onDelete,
}) => {
  // detect the actual type (remember: ALL rows have `hours = 0`, so use `day`)
  const isIpsom      = 'col2'  in entry;
  const isMollsworth = 'voltage' in entry;
  const isDayRate    = 'day'   in entry && !('workItem' in entry);

  /* ---- UI ---- */
  return (
    <div className="flex justify-between items-start p-6 border rounded-xl bg-white min-h-[120px]">
      {/* left block --------------------------------------------------------- */}
      <div className="flex-1">
        {/* header line (title + pill) */}
        {isIpsom && (
          <div className="mb-2 flex items-center">
            <h4 className="text-lg font-semibold text-slate-900">Ipsom Rate</h4>
            <span className="ml-3 px-3 py-1 text-xs font-semibold rounded-full bg-purple-100 text-purple-700">
              Ipsom Rate
            </span>
          </div>
        )}

        {isMollsworth && (
          <div className="mb-2 flex items-center">
            <h4 className="text-lg font-semibold text-slate-900">Mollsworth Rate</h4>
            <span className="ml-3 px-3 py-1 text-xs font-semibold rounded-full bg-indigo-100 text-indigo-700">
              Mollsworth Rate
            </span>
          </div>
        )}

        {isDayRate && (
          <div className="mb-2 flex items-center">
            <h4 className="text-lg font-semibold text-slate-900">Day Rate</h4>
            <span className="ml-3 px-3 py-1 text-xs font-semibold rounded-full bg-orange-100 text-orange-700">
              Day&nbsp;Rate
            </span>
          </div>
        )}

        {/* main description -------------------------------------------------- */}
        {isIpsom && (
          <>
            <div className="text-xl font-bold text-slate-900 mb-2">
              {(entry as IpsomEntry).workItem}
            </div>
            <p className="text-sm text-slate-500 break-words">
              Ipsom • {(entry as IpsomEntry).col2 || '–'} • {(entry as IpsomEntry).col3 || '–'} • {(entry as IpsomEntry).col4 || '–'}
            </p>
          </>
        )}

        {isMollsworth && (
          <>
            <div className="text-xl font-bold text-slate-900 mb-2">
              {(entry as MollsworthEntry).workItem}
            </div>
            <p className="text-sm text-slate-500 break-words">
              Mollsworth • {(entry as MollsworthEntry).voltage || '–'} • {(entry as MollsworthEntry).excavation || '–'} • {(entry as MollsworthEntry).site || '–'}
            </p>
          </>
        )}

   {isDayRate && (
  <>
    {/* Show merged days */}
    <p className="text-sm text-slate-500">
      Days: <span className="font-semibold text-slate-700">{(entry as DayRateEntry).day}</span>
    </p>
    {/* Show reason + supervisor if provided */}
    <p className="text-sm text-slate-500 break-words">
      {(entry as DayRateEntry).reason || '–'} • {(entry as DayRateEntry).supervisorName || '–'}
    </p>
  </>
)}

{/* green total line -------------------------------------------------- */}
<div className="mt-3 text-lg font-bold text-green-600">
  {isIpsom && (
    `${(entry as IpsomEntry).quantity}m × £${(entry as IpsomEntry).rate.toFixed(2)} = £${(entry as IpsomEntry).total.toFixed(2)}`
  )}
  {isMollsworth && (
    `${(entry as MollsworthEntry).quantity}m × £${(entry as MollsworthEntry).rate.toFixed(2)} = £${(entry as MollsworthEntry).total.toFixed(2)}`
  )}
  {isDayRate && (
    `${(entry as DayRateEntry).quantity}h × £${(entry as DayRateEntry).rate.toFixed(2)} = £${(entry as DayRateEntry).total.toFixed(2)}`
  )}
</div>

      </div>

      {/* right badge + delete btn ------------------------------------------ */}
      <div className="flex items-center ml-6 space-x-3 flex-shrink-0">
        <span className="text-sm text-slate-400">
          {isIpsom      && `${(entry as IpsomEntry).quantity}m`}
          {isMollsworth && `${(entry as MollsworthEntry).quantity}m`}
          {isDayRate    && `${(entry as DayRateEntry).hours}h`}
        </span>

        {onDelete && (
          <button
            onClick={onDelete}
            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
};
