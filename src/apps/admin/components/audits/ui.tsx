import React, { useEffect, useId, useRef } from 'react';
import { X, FlaskConical, Check, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { expiryWording, todayISO } from '../../../../lib/siteAuditLogic';
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
    <div className={`min-w-0 ${className}`}>
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

/** Expired / due soon / OK shown as text AND colour, the same wording everywhere ("Expired 3 weeks ago"). */
export function ExpiryPill({
  expiry,
  today = todayISO(),
  showOk = true,
}: {
  expiry: string | null | undefined;
  today?: string;
  showOk?: boolean;
}) {
  const { tone, text } = expiryWording(expiry, today);
  if (!tone) return <span className="text-xs text-slate-600">N/A</span>;
  if (tone === 'ok' && !showOk) return null;
  const cls =
    tone === 'expired' ? 'bg-red-50 text-red-700 border-red-200'
      : tone === 'due_soon' ? 'bg-amber-50 text-amber-800 border-amber-200'
        : 'bg-green-50 text-green-700 border-green-200';
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border whitespace-nowrap ${cls}`}>{text}</span>;
}

/** Straight under an expiry date field: coloured AND worded, with its line always reserved. */
export function ExpiryNote({ expiry, today = todayISO(), id }: { expiry: string | null | undefined; today?: string; id?: string }) {
  const { tone, text } = expiryWording(expiry, today);
  const cls = tone === 'expired' ? 'text-red-700' : tone === 'due_soon' ? 'text-amber-800' : tone === 'ok' ? 'text-green-700' : 'text-slate-600';
  const Icon = tone === 'expired' ? XCircle : tone === 'due_soon' ? AlertTriangle : tone === 'ok' ? CheckCircle2 : null;
  return (
    <p id={id} className={`mt-1 min-h-[1.25rem] flex items-center gap-1 text-sm font-semibold leading-5 ${cls}`} aria-live="polite">
      {Icon && <Icon className="h-4 w-4 flex-shrink-0" aria-hidden="true" />}
      {tone ? text : ''}
    </p>
  );
}

/** Fire extinguisher "Pressure gauge": Green / Amber / Red, coloured AND labelled (48px). */
export function GaugeButtons({ value, onChange, label }: {
  value: 'green' | 'amber' | 'red' | null | undefined;
  onChange: (v: 'green' | 'amber' | 'red' | null) => void;
  label: string;
}) {
  const opts: { v: 'green' | 'amber' | 'red'; text: string; on: string; Icon: typeof Check }[] = [
    { v: 'green', text: 'Green', on: 'bg-green-700 border-green-700 text-white', Icon: CheckCircle2 },
    { v: 'amber', text: 'Amber', on: 'bg-amber-400 border-amber-500 text-slate-900', Icon: AlertTriangle },
    { v: 'red', text: 'Red', on: 'bg-red-700 border-red-700 text-white', Icon: XCircle },
  ];
  return (
    <div role="group" aria-label={`${label}: pressure gauge`} className="grid grid-cols-3 gap-2 w-full">
      {opts.map(({ v, text, on, Icon }) => (
        <button
          key={v}
          type="button"
          aria-pressed={value === v}
          onClick={() => onChange(value === v ? null : v)}
          className={`inline-flex items-center justify-center gap-1 min-h-[48px] px-2 rounded-lg text-sm font-bold border-2 transition-colors duration-150 cursor-pointer select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 ${value === v ? on : 'bg-white border-slate-300 text-slate-800 hover:bg-slate-50'}`}
        >
          <Icon className="h-4 w-4" aria-hidden="true" />{text}
        </button>
      ))}
    </div>
  );
}

/** Gauge in words for detail / records: never colour alone. */
export function GaugeText({ v }: { v: 'green' | 'amber' | 'red' | null | undefined }) {
  if (v === 'red') return <span className="font-semibold text-red-700">Red · fail</span>;
  if (v === 'amber') return <span className="font-semibold text-amber-800">Amber · to look at</span>;
  if (v === 'green') return <span className="text-green-700">Green</span>;
  return <span className="text-xs text-slate-600">—</span>;
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


/**
 * Summary tiles: even rows (2 per row on phone, all in one row on computer), large number,
 * short label; a tile with onClick is a button.
 */
export function StatTiles({ tiles }: { tiles: { key: string; label: string; value: string; tone?: 'red' | 'amber' | 'blue' | 'slate'; onClick?: () => void }[] }) {
  const cols = tiles.length >= 4 ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-2';
  const num = (t?: string) => (t === 'red' ? 'text-red-700' : t === 'amber' ? 'text-amber-800' : 'text-slate-900');
  return (
    <div className={`grid ${cols} gap-3`}>
      {tiles.map((t) => {
        const zero = t.value === '0';
        const body = (
          <>
            <span className={`block text-3xl font-bold leading-none tabular-nums ${zero ? 'text-slate-900' : num(t.tone)}`}>{t.value}</span>
            <span className="block mt-2 text-sm font-semibold text-slate-700 leading-snug">{t.label}{t.onClick ? ' →' : ''}</span>
          </>
        );
        const cls = 'bg-white border border-slate-200 rounded-xl p-4 min-h-[96px] text-left';
        return t.onClick ? (
          <button key={t.key} type="button" onClick={t.onClick}
            className={`${cls} cursor-pointer hover:border-blue-300 transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500`}>{body}</button>
        ) : (
          <div key={t.key} className={cls}>{body}</div>
        );
      })}
    </div>
  );
}

/** Top of a page: one primary action (and any secondary ones), full width on phone. */
export function PageBar({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 [&>*]:w-full sm:[&>*]:w-auto">{children}</div>;
}

/** Badges from resolutionBadges(): red / amber while open, green "· resolved" once fixed. Words, not colour alone. */
export function ResolutionBadgeList({ badges }: { badges: { text: string; tone: 'red' | 'amber' | 'green' }[] }) {
  const cls = { red: 'bg-red-50 text-red-700 border-red-200', amber: 'bg-amber-50 text-amber-800 border-amber-200', green: 'bg-green-50 text-green-700 border-green-200' };
  return (
    <span className="flex flex-wrap gap-1">
      {badges.map((b) => (
        <span key={b.text} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border whitespace-nowrap ${cls[b.tone]}`}>
          {b.tone === 'green' && b.text.includes('resolved') && <Check className="h-3 w-3" aria-hidden="true" strokeWidth={3} />}{b.text}
        </span>
      ))}
    </span>
  );
}
