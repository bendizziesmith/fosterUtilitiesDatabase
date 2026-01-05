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

export async function getEffectiveWeekEnding(): Promise<string> {
  return getEffectiveWeekEndingLocal(new Date());
}

export interface ViewableWeek {
  date: string;
  label: string;
  isCurrent: boolean;
  hasData?: boolean;
  status?: string;
}

export async function getViewableWeeks(recentCount: number = 2, gangerId?: string): Promise<ViewableWeek[]> {
  const effectiveWeek = getEffectiveWeekEndingLocal();
  const effectiveDate = new Date(effectiveWeek + 'T00:00:00');
  const weekMap = new Map<string, ViewableWeek>();

  for (let i = 0; i < recentCount; i++) {
    const weekDate = new Date(effectiveDate);
    weekDate.setDate(effectiveDate.getDate() - (7 * i));
    const dateString = formatLocalDate(weekDate);

    weekMap.set(dateString, {
      date: dateString,
      label: formatDisplayDate(dateString),
      isCurrent: i === 0,
      hasData: false,
    });
  }

  if (gangerId) {
    const { data: existingWeeks } = await supabase
      .from('havs_weeks')
      .select('week_ending, status')
      .eq('ganger_id', gangerId)
      .order('week_ending', { ascending: false });

    if (existingWeeks) {
      existingWeeks.forEach(week => {
        const dateStr = week.week_ending;
        const existing = weekMap.get(dateStr);
        if (existing) {
          existing.hasData = true;
          existing.status = week.status;
        } else {
          weekMap.set(dateStr, {
            date: dateStr,
            label: formatDisplayDate(dateStr),
            isCurrent: dateStr === effectiveWeek,
            hasData: true,
            status: week.status,
          });
        }
      });
    }
  }

  const weeks = Array.from(weekMap.values());
  weeks.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return weeks;
}

export interface StartableWeek {
  date: string;
  label: string;
  isDisabled: boolean;
  alreadyExists?: boolean;
}

export async function getStartableWeeks(_gangerId: string): Promise<StartableWeek[]> {
  const effectiveWeek = getEffectiveWeekEndingLocal();
  const weeks: StartableWeek[] = [];
  const effectiveDate = new Date(effectiveWeek + 'T00:00:00');

  for (let i = 0; i <= 2; i++) {
    const weekDate = new Date(effectiveDate);
    weekDate.setDate(effectiveDate.getDate() + (7 * i));
    const dateString = formatLocalDate(weekDate);

    weeks.push({
      date: dateString,
      label: formatDisplayDate(dateString),
      isDisabled: false,
      alreadyExists: false,
    });
  }

  return weeks;
}
