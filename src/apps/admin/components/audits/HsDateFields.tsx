import { applyExpiry, ServiceExpiryState } from '../../../../lib/siteAuditLogic';
import { FIRE_EXT_MONTHS, HsDateKind } from '../../../../lib/hsDatesLogic';
import { ServiceExpiryFields } from './ServiceExpiryFields';
import { Field, ExpiryNote } from './ui';
import { inputCls, expiryRing } from './styles';

/**
 * Dates for the 4 dated H&S items (round 15).
 * Fire extinguisher: "Date tested" + expiry (fills in 12 months on, changeable).
 * First aid kit / Eye wash / Burns kit: just the expiry, typed from the label; no empty service-date box.
 */
export function HsDateFields({ kind, state, onChange, expiryLabel }: {
  kind: HsDateKind;
  state: ServiceExpiryState;
  onChange: (s: ServiceExpiryState) => void;
  expiryLabel?: string;
}) {
  if (kind === 'tested') {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <ServiceExpiryFields state={state} onChange={onChange} months={FIRE_EXT_MONTHS} serviceLabel="Date tested" expiryLabel={expiryLabel ?? 'Expiry'} />
      </div>
    );
  }
  return (
    <Field label={expiryLabel ?? 'Expiry'} hint="Type it from the label">
      {(id) => (
        <>
          <input id={id} type="date" className={`${inputCls} ${expiryRing(state.expiry)}`} value={state.expiry ?? ''}
            onChange={(e) => onChange(applyExpiry(state, e.target.value || null))} />
          <ExpiryNote expiry={state.expiry} />
        </>
      )}
    </Field>
  );
}

