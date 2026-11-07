import { applyExpiry, applyServiceDate, expiryOrigin, expiryOriginText, ServiceExpiryState } from '../../../../lib/siteAuditLogic';
import { Field, ExpiryNote } from './ui';
import { expiryRing, dateCls } from './styles';

/**
 * Service date + expiry. Changing the service date always refills the expiry (service date + interval);
 * typing the expiry never changes the service date. The note says "Auto: 12 months from service date" or "Entered by hand".
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
  const origin = expiryOrigin(state, months);
  return (
    <>
      <Field label={serviceLabel} reserveHint={2}>
        {(id) => (
          <>
            <input id={id} type="date" className={dateCls} value={state.serviceDate ?? ''}
              onChange={(e) => onChange(applyServiceDate(state, e.target.value || null, months))} />
            <p className="mt-1 min-h-[1.25rem]" aria-hidden="true" />
          </>
        )}
      </Field>
      <Field
        label={expiryLabel}
        reserveHint={2}
        hint={origin ? expiryOriginText(origin, months, serviceLabel) : months && !state.expiry ? `Fills in ${months} months after the ${serviceLabel.toLowerCase()}` : undefined}
      >
        {(id) => (
          <>
            <input id={id} type="date" className={`${dateCls} ${expiryRing(state.expiry)}`} value={state.expiry ?? ''}
              onChange={(e) => onChange(applyExpiry(state, e.target.value || null))} />
            <ExpiryNote expiry={state.expiry} />
          </>
        )}
      </Field>
    </>
  );
}
