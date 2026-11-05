/** Shared styles, labels and helpers for the Site Audits / Kit & Plant screens. */

/** Rows saved from a local dev run are flagged is_test so they can be cleaned up. */
export const TEST_MODE = import.meta.env.DEV;

export const btn = {
  primary:
    'inline-flex items-center justify-center gap-2 min-h-[44px] px-4 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2',
  secondary:
    'inline-flex items-center justify-center gap-2 min-h-[44px] px-4 rounded-lg bg-white border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
  small:
    'inline-flex items-center justify-center gap-1.5 min-h-[44px] sm:min-h-[36px] px-3 rounded-lg bg-white border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-50 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
  danger:
    'inline-flex items-center justify-center gap-2 min-h-[44px] px-4 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2',
};

export const inputCls =
  'w-full min-h-[44px] px-3 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500';

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
  removed: 'Removed',
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
  removed: 'Removed',
};
