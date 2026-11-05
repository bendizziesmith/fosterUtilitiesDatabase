import React, { useEffect, useId, useRef } from 'react';
import { X, FlaskConical, Check } from 'lucide-react';
import { formatExpiryStatus, getExpiryStatus, todayISO } from '../../../../lib/siteAuditLogic';
import { TEST_MODE } from './styles';

/**
 * Shared bits for the Site Audits / Kit & Plant screens. Same palette as the
 * existing admin screens (slate/blue, white cards, rounded-xl, border-slate-200);
 * dark mode comes from the global overrides in index.css.
 */

/** Label line height for every field on a row, so all inputs start on the same top line. */
export const LABEL_LINE = 'flex items-center justify-between gap-2 h-6 mb-1';
export const LABEL_TEXT = 'text-xs font-semibold text-slate-600 truncate';

export function Field({
  label,
  hint,
  aside,
  reserveHint = false,
  children,
  className = '',
}: {
  label: string;
  hint?: string;
  /** shown at the right of the label line (e.g. the expiry badge); the line height never changes */
  aside?: React.ReactNode;
  /** keep space for the hint even when there is none, so nothing below moves (true = 1 line, 2 = 2 lines) */
  reserveHint?: boolean | 2;
  children: (id: string) => React.ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={className}>
      <div className={LABEL_LINE}>
        <label htmlFor={id} className={LABEL_TEXT}>{label}</label>
        {aside}
      </div>
      {children(id)}
      {(hint || reserveHint) && (
        <p className={`text-xs text-slate-600 mt-1 leading-4 ${reserveHint === 2 ? 'min-h-[2rem]' : 'min-h-[1rem]'}`}>{hint ?? ''}</p>
      )}
    </div>
  );
}

/** Expired / due soon / OK shown as text AND colour. */
export function ExpiryPill({
  expiry,
  today = todayISO(),
  showOk = true,
}: {
  expiry: string | null | undefined;
  today?: string;
  showOk?: boolean;
}) {
  const { status, daysLeft } = getExpiryStatus(expiry, today);
  if (!status) return <span className="text-xs text-slate-600">N/A</span>;
  if (status === 'ok') {
    return showOk ? (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-green-50 text-green-700 border border-green-200">
        OK
      </span>
    ) : null;
  }
  const cls =
    status === 'expired'
      ? 'bg-red-50 text-red-700 border-red-200'
      : 'bg-amber-50 text-amber-800 border-amber-200';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border whitespace-nowrap ${cls}`}>
      {status === 'expired' ? 'Expired · ' : ''}
      {formatExpiryStatus(daysLeft)}
    </span>
  );
}

export function CountBadge({ n, label, tone }: { n: number; label: string; tone: 'red' | 'amber' | 'slate' | 'violet' | 'green' }) {
  const cls = {
    red: 'bg-red-50 text-red-700 border-red-200',
    amber: 'bg-amber-50 text-amber-800 border-amber-200',
    slate: 'bg-slate-100 text-slate-700 border-slate-200',
    violet: 'bg-violet-50 text-violet-700 border-violet-200',
    green: 'bg-green-50 text-green-700 border-green-200',
  }[tone];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border whitespace-nowrap ${cls}`}>
      {n} {label}
    </span>
  );
}

/** Big Y / N buttons: 48px, full-width split, tick / cross as well as colour (usable with gloves). */
export function YesNo({
  value,
  onChange,
  label,
  disabled,
  question = 'fit for purpose',
}: {
  value: 'Y' | 'N' | 'not_carried' | null;
  onChange: (v: 'Y' | 'N' | null) => void;
  label: string;
  disabled?: boolean;
  /** read out with the item name, e.g. "Water containers: label on" */
  question?: string;
}) {
  const base =
    'inline-flex items-center justify-center gap-1.5 min-h-[48px] px-3 rounded-lg text-base font-bold border-2 transition-colors duration-150 cursor-pointer select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 disabled:opacity-40 disabled:cursor-not-allowed';
  return (
    <div role="group" aria-label={`${label}: ${question}`} className="grid grid-cols-2 gap-2 w-full">
      <button
        type="button"
        disabled={disabled}
        aria-pressed={value === 'Y'}
        onClick={() => onChange(value === 'Y' ? null : 'Y')}
        className={`${base} ${value === 'Y' ? 'bg-green-700 border-green-700 text-white' : 'bg-white border-slate-300 text-slate-800 hover:bg-slate-50'}`}
      >
        <Check className="h-5 w-5" aria-hidden="true" strokeWidth={3} />Y
      </button>
      <button
        type="button"
        disabled={disabled}
        aria-pressed={value === 'N'}
        onClick={() => onChange(value === 'N' ? null : 'N')}
        className={`${base} ${value === 'N' ? 'bg-red-700 border-red-700 text-white' : 'bg-white border-slate-300 text-slate-800 hover:bg-slate-50'}`}
      >
        <X className="h-5 w-5" aria-hidden="true" strokeWidth={3} />N
      </button>
    </div>
  );
}

/** Modal on desktop, bottom sheet on phone. Esc and the X close it. */
export function Sheet({
  title,
  subtitle,
  onClose,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <button type="button" aria-label="Close" tabIndex={-1} onClick={onClose} className="absolute inset-0 bg-black/50 cursor-default" />
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative w-full sm:max-w-lg bg-white rounded-t-2xl sm:rounded-xl shadow-xl max-h-[92vh] flex flex-col focus:outline-none"
      >
        <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3 border-b border-slate-200">
          <div className="min-w-0">
            <div className="sm:hidden mx-auto mb-3 h-1.5 w-10 rounded-full bg-slate-200" aria-hidden="true" />
            <h2 id={titleId} className="text-base font-bold text-slate-900">{title}</h2>
            {subtitle && <p className="text-xs text-slate-600 mt-0.5">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-2.5 -mr-2 rounded-lg text-slate-600 hover:bg-slate-100 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4 space-y-4">{children}</div>
        {footer && <div className="px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] border-t border-slate-200 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

export function TestModeBanner() {
  if (!TEST_MODE) return null;
  return (
    <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
      <FlaskConical className="h-4 w-4 flex-shrink-0 mt-0.5" />
      <span>
        <strong>Test mode (local build).</strong> Everything saved here is marked as test and can be removed in one go.
      </span>
    </div>
  );
}

export function TestTag({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[12px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
      TEST
    </span>
  );
}

export function ErrorNote({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      {message}
    </div>
  );
}

