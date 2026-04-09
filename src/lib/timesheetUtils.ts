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

export const OFFICE_EXTRA_OPTIONS = [
  { value: '', label: 'None' },
  { value: '00:15', label: '0:15' },
  { value: '00:30', label: '0:30' },
  { value: '00:45', label: '0:45' },
  { value: '01:00', label: '1:00' },
  { value: '01:30', label: '1:30' },
  { value: '02:00', label: '2:00' },
  { value: '02:30', label: '2:30' },
  { value: '03:00', label: '3:00' },
  { value: '04:00', label: '4:00' },
];

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

export function parseDurationToMinutes(duration: string | null | undefined): number {
  if (!duration) return 0;
  const cleaned = duration.replace(/[^0-9:]/g, '');
  return parseTimeToMinutes(cleaned);
}

export function calculateDayHours(
  startTime: string | null | undefined,
  finishTime: string | null | undefined,
  officeDuration: string | null | undefined
): number {
  const startMin = parseTimeToMinutes(startTime);
  const finishMin = parseTimeToMinutes(finishTime);
  const officeMin = parseDurationToMinutes(officeDuration);

  if (!startTime || !finishTime) return officeMin / 60;
  if (finishMin <= startMin) return officeMin / 60;

  return (finishMin - startMin + officeMin) / 60;
}

export function formatHoursDecimal(hours: number): string {
  if (hours === 0) return '0';
  return hours.toFixed(1).replace(/\.0$/, '');
}

export function formatDurationDisplay(duration: string | null | undefined): string {
  if (!duration) return '-';
  const match = duration.match(/(\d{1,2}):(\d{2})/);
  if (!match) return '-';
  const h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  if (h === 0 && m === 0) return '-';
  if (h === 0) return `0:${String(m).padStart(2, '0')}`;
  return `${h}:${String(m).padStart(2, '0')}`;
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
