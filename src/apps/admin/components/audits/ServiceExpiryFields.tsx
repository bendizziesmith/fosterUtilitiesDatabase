import { applyExpiry, applyServiceDate, ServiceExpiryState } from '../../../../lib/siteAuditLogic';
import { Field, ExpiryNote } from './ui';
import { inputCls, expiryRing } from './styles';

/**
 * Service date + expiry. Expiry fills itself as service date + interval
 * ("Auto: 12 months, change if needed") until the person types their own.
 * Renders two grid cells so it drops into existing form grids. Both cells keep two lines
 * for the hint; the expiry status sits under the date (coloured and worded), so nothing moves.
 */
export function ServiceExpiryFields({
  state,
  onChange,
  months,
  serviceLabel = 'Service date',
  expiryLabel = 'Expiry',
}: {
  state: ServiceExpiryState;
  onChange: (s: ServiceExpiryState) => void;
  months: number | null | undefined;
  serviceLabel?: string;
  expiryLabel?: string;
}) {
  const auto = !!months && !state.expiryManual && !!state.expiry;
  return (
    <>
      <Field label={serviceLabel} reserveHint={2}>
        {(id) => (
          <>
            <input id={id} type="date" className={inputCls} value={state.serviceDate ?? ''}
              onChange={(e) => onChange(applyServiceDate(state, e.target.value || null, months))} />
            <p className="mt-1 min-h-[1.25rem]" aria-hidden="true" />
          </>
        )}
      </Field>
      <Field
        label={expiryLabel}
        reserveHint={2}
        hint={auto ? `Auto: ${months} months, change if needed` : months && !state.expiry ? `Fills in ${months} months after the ${serviceLabel.toLowerCase()}` : undefined}
      >
        {(id) => (
          <>
            <input id={id} type="date" className={`${inputCls} ${expiryRing(state.expiry)}`} value={state.expiry ?? ''}
              onChange={(e) => onChange(applyExpiry(state, e.target.value || null))} />
            <ExpiryNote expiry={state.expiry} />
          </>
        )}
      </Field>
    </>
  );
}
