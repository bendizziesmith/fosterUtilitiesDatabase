import React from 'react';
import { Trash2 } from 'lucide-react';

interface IpsomEntry {
  id: string;
  workItem: string;
  col2: string;
  col3: string;
  col4: string;
  quantity: number;
  rate: number;
  total: number;
}

interface MollsworthEntry {
  id: string;
  workItem: string;
  voltage: string;
  excavation: string;
  site: string;
  quantity: number;
  rate: number;
  total: number;
}

interface DayRateEntry {
  id: string;
  day: string;
  hours: number;
  reason: string;
  supervisorName: string;
  total: number;
}

// Additional interface for database entries
interface DatabaseEntry {
  id: string;
  work_item?: string;
  col2?: string;
  col3?: string;
  col4?: string;
  voltage?: string;
  excavation?: string;
  site?: string;
  day?: string;
  hours?: number;
  reason?: string;
  supervisorName?: string;
  quantity?: number;
  rate?: number;
  total?: number;
  type?: 'ipsom' | 'mollsworth' | 'dayrate';
  // Add day fields for proper day rate detection
  monday?: number;
  tuesday?: number;
  wednesday?: number;
  thursday?: number;
  friday?: number;
  saturday?: number;
  sunday?: number;
}

type TimesheetEntry = IpsomEntry | MollsworthEntry | DayRateEntry | DatabaseEntry;

interface TimesheetEntryCardProps {
  entry: TimesheetEntry;
  onDelete?: () => void;
}

export const TimesheetEntryCard: React.FC<TimesheetEntryCardProps> = ({
  entry,
  onDelete,
}) => {
  // Determine entry type based on the 'type' property first, then fallback to property detection
  let isIpsom = false;
  let isMollsworth = false;
  let isDayRate = false;

  if ('type' in entry) {
    isIpsom = entry.type === 'ipsom';
    isMollsworth = entry.type === 'mollsworth';
    isDayRate = entry.type === 'dayrate';
  } else {
    // Improved fallback detection logic
    // Check for day rate first - if it has day fields with hours > 0, it's a day rate
    const dayFields = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    const hasDayHours = dayFields.some(dayField => {
      const dayValue = entry[dayField as keyof typeof entry];
      return dayValue && Number(dayValue) > 0;
    });
    
    if (hasDayHours || ('day' in entry && 'hours' in entry)) {
      isDayRate = true;
    } else if ('voltage' in entry || 'excavation' in entry || 'site' in entry) {
      isMollsworth = true;
    } else if ('workItem' in entry || ('work_item' in entry && 'col2' in entry)) {
      isIpsom = true;
    }
  }

  // Safe value extraction with fallbacks
  const getWorkItem = () => {
    if ('workItem' in entry) return entry.workItem || '';
    if ('work_item' in entry) return entry.work_item || '';
    return '';
  };

  const getQuantity = () => {
    if ('quantity' in entry) return entry.quantity || 0;
    return 0;
  };

  const getRate = () => {
    if ('rate' in entry) return entry.rate || 0;
    return 0;
  };

  const getTotal = () => {
    if ('total' in entry) return entry.total || 0;
    return 0;
  };

  const getHours = () => {
    if ('hours' in entry) return entry.hours || 0;
    return 0;
  };

  const getDay = () => {
    if ('day' in entry) return entry.day || '';
    
    // For database entries, find which day has hours > 0
    if ('monday' in entry || 'tuesday' in entry) {
      const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
      const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
      
      for (let i = 0; i < days.length; i++) {
        const dayValue = entry[days[i] as keyof typeof entry];
        if (dayValue && Number(dayValue) > 0) {
          return dayNames[i];
        }
      }
    }
    
    return '';
  };

  const getReason = () => {
    if ('reason' in entry) return entry.reason || '';
    return '';
  };

  const getSupervisor = () => {
    if ('supervisorName' in entry) return entry.supervisorName || '';
    return '';
  };

  // Get Ipsom specific fields
  const getCol2 = () => {
    if ('col2' in entry) return entry.col2 || '-';
    return '-';
  };

  const getCol3 = () => {
    if ('col3' in entry) return entry.col3 || '-';
    return '-';
  };

  const getCol4 = () => {
    if ('col4' in entry) return entry.col4 || '-';
    return '-';
  };

  // Get Mollsworth specific fields
  const getVoltage = () => {
    if ('voltage' in entry) return entry.voltage || '-';
    return '-';
  };

  const getExcavation = () => {
    if ('excavation' in entry) return entry.excavation || '-';
    return '-';
  };

  const getSite = () => {
    if ('site' in entry) return entry.site || '-';
    return '-';
  };

  // Get all selected days for day rate entries
  const getSelectedDays = () => {
    if (!isDayRate) return [''];
    
    const days = [];
    const dayKeys = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    
    dayKeys.forEach((dayKey, index) => {
      const dayValue = entry[dayKey as keyof typeof entry];
      if (dayValue && Number(dayValue) > 0) {
        days.push(dayNames[index]);
      }
    });
    
    // If no days found in day fields, check if there's a 'day' property
    if (days.length === 0 && 'day' in entry && entry.day) {
      return [entry.day];
    }
    
    return days.length > 0 ? days : ['Unknown'];
  };
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
      {/* Header with Rate Type and Quantity/Delete */}
      <div className="flex items-center justify-between">
        <div>
          {isIpsom && (
            <h3 className="text-xl font-bold text-slate-900">Ipsom Rate</h3>
          )}
          {isMollsworth && (
            <h3 className="text-xl font-bold text-slate-900">Mollsworth Rate</h3>
          )}
          {isDayRate && (
            <h3 className="text-xl font-bold text-slate-900">Day Rate</h3>
          )}
        </div>
        <div className="flex items-center space-x-3">
          <span className="text-sm text-slate-500">
            {isDayRate ? `${getHours()}h` : `${getQuantity()}m`}
          </span>
          {onDelete && (
            <button
              onClick={onDelete}
              className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* IPSOM RATE FIELDS ONLY */}
      {isIpsom && (
        <>
          {/* Work Item and Rate */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <span className="text-sm font-medium text-slate-600">Work Item:</span>
              <div className="text-lg font-semibold text-slate-900">{getWorkItem()}</div>
            </div>
            <div>
              <span className="text-sm font-medium text-slate-600">Rate:</span>
              <div className="text-lg font-semibold text-green-600">£{getRate().toFixed(2)}</div>
            </div>
          </div>

          {/* Ipsom Columns */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <span className="text-sm font-medium text-slate-600">Column 2:</span>
              <div className="text-base text-slate-900">{getCol2()}</div>
            </div>
            <div>
              <span className="text-sm font-medium text-slate-600">Column 3:</span>
              <div className="text-base text-slate-900">{getCol3()}</div>
            </div>
            <div>
              <span className="text-sm font-medium text-slate-600">Column 4:</span>
              <div className="text-base text-slate-900">{getCol4()}</div>
            </div>
          </div>

          {/* Total Calculation */}
          <div className="pt-4 border-t border-slate-200">
            <div className="text-xl font-bold text-green-600">
              {getQuantity()}m × £{getRate().toFixed(2)} = £{getTotal().toFixed(2)}
            </div>
          </div>
        </>
      )}

      {/* MOLLSWORTH RATE FIELDS ONLY */}
      {isMollsworth && (
        <>
          {/* Work Item and Rate */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <span className="text-sm font-medium text-slate-600">Work Item:</span>
              <div className="text-lg font-semibold text-slate-900">{getWorkItem()}</div>
            </div>
            <div>
              <span className="text-sm font-medium text-slate-600">Rate:</span>
              <div className="text-lg font-semibold text-green-600">£{getRate().toFixed(2)}</div>
            </div>
          </div>

          {/* Mollsworth Parameters */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <span className="text-sm font-medium text-slate-600">Column 2:</span>
              <div className="text-base text-slate-900">{getVoltage()}</div>
            </div>
            <div>
              <span className="text-sm font-medium text-slate-600">Column 3:</span>
              <div className="text-base text-slate-900">{getExcavation()}</div>
            </div>
            <div>
              <span className="text-sm font-medium text-slate-600">Column 4:</span>
              <div className="text-base text-slate-900">{getSite()}</div>
            </div>
          </div>

          {/* Total Calculation */}
          <div className="pt-4 border-t border-slate-200">
            <div className="text-xl font-bold text-green-600">
              {getQuantity()}m × £{getRate().toFixed(2)} = £{getTotal().toFixed(2)}
            </div>
          </div>
        </>
      )}

      {/* DAY RATE FIELDS ONLY */}
      {isDayRate && (
        <>
          {/* Selected Days and Hours */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <span className="text-sm font-medium text-slate-600">Days:</span>
              <div className="text-lg font-semibold text-slate-900">
                {getSelectedDays().join(', ') || getDay()}
              </div>
            </div>
            <div>
              <span className="text-sm font-medium text-slate-600">Hours:</span>
              <div className="text-lg font-semibold text-slate-900">{getHours()}h</div>
            </div>
          </div>

          {/* Reason and Supervisor */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <span className="text-sm font-medium text-slate-600">Reason:</span>
              <div className="text-base text-slate-900">{getReason() || '-'}</div>
            </div>
            <div>
              <span className="text-sm font-medium text-slate-600">Supervisor:</span>
              <div className="text-base text-slate-900">{getSupervisor() || '-'}</div>
            </div>
          </div>

          {/* Total Calculation */}
          <div className="pt-4 border-t border-slate-200">
            <div className="text-xl font-bold text-green-600">
              {getHours()}h × £{(getTotal() / getHours()).toFixed(2)} = £{getTotal().toFixed(2)}
            </div>
          </div>
        </>
      )}
    </div>
  );
};