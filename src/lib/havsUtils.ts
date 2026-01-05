import { supabase } from './supabase';

export function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatDisplayDate(dateString: string): string {
  const date = new Date(dateString + 'T00:00:00');
  return date.toLocaleDateString('en-GB', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

export function getEffectiveWeekEndingLocal(referenceDate: Date = new Date()): string {
  const dayOfWeek = referenceDate.getDay();
  let result: Date;

  if (dayOfWeek === 0) {
    result = new Date(referenceDate);
  } else if (dayOfWeek === 1 || dayOfWeek === 2) {
    result = new Date(referenceDate);
    result.setDate(referenceDate.getDate() - dayOfWeek);
  } else {
    result = new Date(referenceDate);
    result.setDate(referenceDate.getDate() + (7 - dayOfWeek));
  }

  return formatLocalDate(result);
}

export async function getEffectiveWeekEnding(referenceDate: Date = new Date()): Promise<string> {
  try {
    const { data, error } = await supabase.rpc('get_havs_week_ending', {
      reference_date: formatLocalDate(referenceDate)
    });
    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error getting week ending from server:', error);
    return getEffectiveWeekEndingLocal(referenceDate);
  }
}

export function getSundayForDate(date: Date): Date {
  const result = new Date(date);
  const dayOfWeek = result.getDay();
  const daysUntilSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
  result.setDate(result.getDate() + daysUntilSunday);
  return result;
}

export interface ViewableWeek {
  date: string;
  label: string;
  isCurrent: boolean;
}

export async function getViewableWeeks(count: number = 8): Promise<ViewableWeek[]> {
  const effectiveWeek = await getEffectiveWeekEnding();
  const weeks: ViewableWeek[] = [];

  const effectiveDate = new Date(effectiveWeek + 'T00:00:00');

  for (let i = 0; i < count; i++) {
    const weekDate = new Date(effectiveDate);
    weekDate.setDate(effectiveDate.getDate() - (7 * i));
    const dateString = formatLocalDate(weekDate);

    weeks.push({
      date: dateString,
      label: formatDisplayDate(dateString),
      isCurrent: i === 0,
    });
  }

  return weeks;
}

export interface StartableWeek {
  date: string;
  label: string;
  isDisabled: boolean;
  alreadyExists?: boolean;
}

export async function getStartableWeeks(gangerId: string): Promise<StartableWeek[]> {
  const effectiveWeek = await getEffectiveWeekEnding();
  const weeks: StartableWeek[] = [];

  const effectiveDate = new Date(effectiveWeek + 'T00:00:00');

  const { data: existingWeeks } = await supabase
    .from('havs_weeks')
    .select('week_ending')
    .eq('ganger_id', gangerId);

  const existingDates = new Set(existingWeeks?.map(w => w.week_ending) || []);

  for (let i = 0; i <= 2; i++) {
    const weekDate = new Date(effectiveDate);
    weekDate.setDate(effectiveDate.getDate() + (7 * i));
    const dateString = formatLocalDate(weekDate);

    weeks.push({
      date: dateString,
      label: formatDisplayDate(dateString),
      isDisabled: existingDates.has(dateString),
      alreadyExists: existingDates.has(dateString),
    });
  }

  return weeks;
}

export function isWeekInPast(weekEnding: string): boolean {
  const effectiveWeek = getEffectiveWeekEndingLocal();
  return weekEnding < effectiveWeek;
}

export function isWeekInFuture(weekEnding: string): boolean {
  const effectiveWeek = getEffectiveWeekEndingLocal();
  return weekEnding > effectiveWeek;
}
