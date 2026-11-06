import { AuditChecklistItem, KitItemOverview, KitType } from '../../../../lib/supabase';
import { holderLabel } from '../../../../lib/siteAuditLogic';
import { hsDateKind } from '../../../../lib/hsDatesLogic';
import type { UpdateTarget } from './UpdateItemSheet';

export const monthsForType = (kitTypes: KitType[], typeId: string | null | undefined) =>
  kitTypes.find((t) => t.id === typeId)?.service_interval_months ?? null;

/** "Dom Oliver · YE24 TNL", "WV72 OZL · spare van", "Spare · Yard", "Unassigned, needs a home" … */
export const kitWhere = (k: KitItemOverview) => holderLabel(k);

export function kitUpdateTarget(k: KitItemOverview, kitTypes: KitType[]): UpdateTarget {
  return {
    source: 'kit',
    itemId: k.id,
    itemName: k.type_name,
    plantNo: k.plant_no,
    where: kitWhere(k),
    serviceDate: k.service_date,
    expiryDate: k.expiry_date,
    swapItem: k.status === 'on_van' && k.holder_kind !== 'none' ? k : null,
    months: monthsForType(kitTypes, k.kit_type_id),
  };
}

export function ppeUpdateTarget(
  p: { id: string; item_name: string; expiry_date: string | null; checklist_item_id?: string | null },
  where: string,
  checklist: AuditChecklistItem[]
): UpdateTarget {
  const c = checklist.find((x) => (p.checklist_item_id ? x.id === p.checklist_item_id : x.section !== 'other' && x.name === p.item_name));
  return {
    source: 'ppe',
    itemId: p.id,
    itemName: p.item_name,
    plantNo: null,
    where,
    serviceDate: null,
    expiryDate: p.expiry_date,
    months: c?.service_interval_months ?? null,
    dateLabel: c?.date_label ?? null,
    hsKind: hsDateKind(c),
  };
}
