/**
 * HAVS compliance-grid cell status — pure mapping from a week's record (or absence)
 * to a display state and its presentation. Kept free of React so it is unit-testable
 * and so the grid renders every cell from one consistent source.
 */

export type HavsCellState = 'submitted' | 'draft' | 'missing' | 'future';

/**
 * A submitted record is submitted; any other record is a draft. With no record, a past
 * week is missing and a current/future week is future (not yet due).
 */
export function getHavsCellState(
  weekStatus: string | null | undefined,
  weekEnding: string,
  now: Date
): HavsCellState {
  if (weekStatus) {
    return weekStatus === 'submitted' ? 'submitted' : 'draft';
  }
  return new Date(weekEnding) < now ? 'missing' : 'future';
}

export interface HavsCellPresentation {
  state: HavsCellState;
  label: string;
  clickable: boolean;
  chipClass: string;
  iconClass: string;
}

export const HAVS_CELL_PRESENTATION: Record<
  HavsCellState,
  Omit<HavsCellPresentation, 'state'>
> = {
  submitted: {
    label: 'Submitted',
    clickable: true,
    chipClass: 'bg-emerald-100 group-hover:bg-emerald-200',
    iconClass: 'text-emerald-600',
  },
  draft: {
    label: 'Draft',
    clickable: true,
    chipClass: 'bg-amber-100 group-hover:bg-amber-200',
    iconClass: 'text-amber-600',
  },
  missing: {
    label: 'Missing',
    clickable: false,
    chipClass: 'bg-red-100',
    iconClass: 'text-red-500',
  },
  future: {
    label: 'Future',
    clickable: false,
    chipClass: 'bg-slate-100',
    iconClass: 'text-slate-400',
  },
};

export function getHavsCellPresentation(
  weekStatus: string | null | undefined,
  weekEnding: string,
  now: Date
): HavsCellPresentation {
  const state = getHavsCellState(weekStatus, weekEnding, now);
  return { state, ...HAVS_CELL_PRESENTATION[state] };
}
