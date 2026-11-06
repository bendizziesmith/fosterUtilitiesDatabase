/** Shared styles, labels and helpers for the Site Audits / Kit & Plant screens. */
import { expiryWording, todayISO } from '../../../../lib/siteAuditLogic';

/** Rows saved from a local dev run are flagged is_test so they can be cleaned up. */
export const TEST_MODE = import.meta.env.DEV;

export const btn = {
  primary:
    'inline-flex items-center justify-center gap-2 min-h-[48px] sm:min-h-[44px] px-4 rounded-lg bg-blue-600 text-white text-base sm:text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2',
  secondary:
    'inline-flex items-center justify-center gap-2 min-h-[48px] sm:min-h-[44px] px-4 rounded-lg bg-white border border-slate-300 text-slate-800 text-base sm:text-sm font-semibold hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
  small:
    'inline-flex items-center justify-center gap-1.5 min-h-[44px] sm:min-h-[36px] px-3 rounded-lg bg-white border border-slate-300 text-slate-800 text-sm sm:text-xs font-semibold hover:bg-slate-50 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
  /** every delete-type button: white, red text, thin grey border (like the other secondary buttons) */
  delete:
    'inline-flex items-center justify-center gap-2 min-h-[48px] sm:min-h-[44px] px-4 rounded-lg bg-white border border-slate-300 text-red-700 text-base sm:text-sm font-semibold hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500',
  /** the small row version (next to Update · Swap) */
  smallDelete:
    'inline-flex items-center justify-center gap-1.5 min-h-[44px] sm:min-h-[36px] px-3 rounded-lg bg-white border border-slate-300 text-red-700 text-sm sm:text-xs font-semibold hover:bg-red-50 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500',
  danger:
    'inline-flex items-center justify-center gap-2 min-h-[48px] sm:min-h-[44px] px-4 rounded-lg bg-red-600 text-white text-base sm:text-sm font-semibold hover:bg-red-700 disabled:opacity-50 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2',
};

/** 16px text on phones so iOS never zooms into a field; 14px from tablet up. */
export const inputCls =
  'block w-full min-h-[48px] sm:min-h-[44px] px-3 rounded-lg border border-slate-300 bg-white text-base sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500';

export const card = 'bg-white border border-slate-200 rounded-xl';

export function formatDate(d: string | null | undefined): string {
  if (!d) return '—';
  const [y, m, day] = d.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, day).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatDateTime(d: string | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export const KIT_STATUS_LABEL: Record<string, string> = {
  on_van: 'On van',
  spare: 'Yard Lockup',
  away_for_service: 'Away for service',
  removed: 'Scrapped',
};

export const ACTION_LABEL: Record<string, string> = {
  added: 'Added',
  reserviced: 'Re-serviced',
  replaced: 'Replaced with new',
  expiry_updated: 'New expiry',
  audit_seen: 'Seen in audit',
  swapped_out: 'Swapped out',
  swapped_in: 'Swapped in',
  assigned: 'Assigned to van',
  sent_for_service: 'Sent for service',
  back_from_service: 'Back from service',
  moved_to_spare: 'Back to Yard Lockup',
  removed: 'Scrapped',
};

/** The coloured outline a date field takes for its expiry (a ring, so dark mode keeps it). */
export function expiryRing(expiry: string | null | undefined, today = todayISO()): string {
  const { tone } = expiryWording(expiry, today);
  return tone === 'expired' ? 'ring-2 ring-red-600' : tone === 'due_soon' ? 'ring-2 ring-amber-500' : tone === 'ok' ? 'ring-2 ring-green-600' : '';
}
