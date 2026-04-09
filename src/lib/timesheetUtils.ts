export const DAYS_OF_WEEK = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;

export type DayOfWeek = (typeof DAYS_OF_WEEK)[number];

export const DAY_LABELS: Record<DayOfWeek, string> = {
  monday: 'Mon',
  tuesday: 'Tue',
  wednesday: 'Wed',
  thursday: 'Thu',
  friday: 'Fri',
  saturday: 'Sat',
  sunday: 'Sun',
};

export const DAY_LABELS_FULL: Record<DayOfWeek, string> = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday',
};

export function getWeekEndingSunday(date: Date = new Date()): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? 0 : 7 - day;
  d.setDate(d.getDate() + diff);
  return formatDate(d);
}

export function getRecentSundays(count: number): string[] {
  const sundays: string[] = [];
  const now = new Date();
  const currentSunday = new Date(now);
  const day = currentSunday.getDay();
  if (day !== 0) {
    currentSunday.setDate(currentSunday.getDate() + (7 - day));
  }

  for (let i = 0; i < count; i++) {
    const sunday = new Date(currentSunday);
    sunday.setDate(currentSunday.getDate() - 7 * i);
    sundays.push(formatDate(sunday));
  }
  return sundays;
}

export function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function formatWeekEnding(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function parseTimeToMinutes(time: string | null | undefined): number {
  if (!time) return 0;
  const parts = time.split(':');
  if (parts.length < 2) return 0;
  const hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);
  if (isNaN(hours) || isNaN(minutes)) return 0;
  return hours * 60 + minutes;
}

export function calculateDayHours(
  startTime: string | null | undefined,
  finishTime: string | null | undefined
): number {
  if (!startTime || !finishTime) return 0;
  const startMin = parseTimeToMinutes(startTime);
  const finishMin = parseTimeToMinutes(finishTime);
  if (finishMin <= startMin) return 0;
  return (finishMin - startMin) / 60;
}

export function formatHoursDecimal(hours: number): string {
  if (hours === 0) return '0';
  return hours.toFixed(1).replace(/\.0$/, '');
}

export function isSunday(dateStr: string): boolean {
  const date = new Date(dateStr + 'T00:00:00');
  return date.getDay() === 0;
}

export interface TimesheetStatusInfo {
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
}

export function getStatusInfo(status: string): TimesheetStatusInfo {
  switch (status) {
    case 'submitted':
      return {
        label: 'Submitted',
        color: 'text-blue-700',
        bgColor: 'bg-blue-50',
        borderColor: 'border-blue-200',
      };
    case 'returned':
      return {
        label: 'Returned',
        color: 'text-red-700',
        bgColor: 'bg-red-50',
        borderColor: 'border-red-200',
      };
    default:
      return {
        label: 'Draft',
        color: 'text-amber-700',
        bgColor: 'bg-amber-50',
        borderColor: 'border-amber-200',
      };
  }
}

function escapeCSV(val: string): string {
  if (val.includes(',') || val.includes('"') || val.includes('\n')) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

export function downloadTimesheetCSV(ts: {
  week_ending: string;
  ganger?: any;
  ganger_name_snapshot?: string;
  vehicle_registration_snapshot?: string | null;
  labourer_1_name?: string | null;
  labourer_2_name?: string | null;
  weekly_total_hours: number;
  job_rows?: Array<{
    job_number: string;
    job_address: string;
    day_entries?: Array<{
      day_of_week: string;
      start_time: string | null;
      finish_time: string | null;
      hours_total: number;
    }>;
  }>;
}): void {
  const empName =
    ts.ganger?.full_name || ts.ganger_name_snapshot || 'Unknown';
  const role = ts.ganger?.role || '';
  const vehicle = ts.vehicle_registration_snapshot || '';
  const lab1 = ts.labourer_1_name || '';
  const lab2 = ts.labourer_2_name || '';

  const headers = [
    'Week Ending',
    'Employee Name',
    'Role',
    'Vehicle',
    'Labourer 1',
    'Labourer 2',
    'Job Number',
    'Job Address / Location',
    'Day of Week',
    'Start',
    'Finish',
    'Hours',
    'Weekly Total Hours',
  ];

  const rows: string[] = [headers.join(',')];

  for (const jobRow of ts.job_rows || []) {
    for (const day of DAYS_OF_WEEK) {
      const entry = (jobRow.day_entries || []).find(
        (e) => e.day_of_week === day
      );
      if (!entry || (!entry.start_time && !entry.finish_time)) continue;

      rows.push(
        [
          escapeCSV(formatWeekEnding(ts.week_ending)),
          escapeCSV(empName),
          escapeCSV(role),
          escapeCSV(vehicle),
          escapeCSV(lab1),
          escapeCSV(lab2),
          escapeCSV(jobRow.job_number || ''),
          escapeCSV(jobRow.job_address || ''),
          escapeCSV(DAY_LABELS_FULL[day as DayOfWeek]),
          escapeCSV(entry.start_time || ''),
          escapeCSV(entry.finish_time || ''),
          formatHoursDecimal(entry.hours_total || 0),
          formatHoursDecimal(ts.weekly_total_hours),
        ].join(',')
      );
    }
  }

  const safeName = empName.replace(/[^a-zA-Z0-9]/g, '_');
  const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `Timesheet_${safeName}_WE_${ts.week_ending}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
