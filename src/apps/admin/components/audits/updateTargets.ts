import { AuditChecklistItem, KitItemOverview, KitType } from '../../../../lib/supabase';
import type { UpdateTarget } from './UpdateItemSheet';

export const monthsForType = (kitTypes: KitType[], typeId: string | null | undefined) =>
  kitTypes.find((t) => t.id === typeId)?.service_interval_months ?? null;

export function kitWhere(k: Pick<KitItemOverview, 'status' | 'vehicle_id' | 'vehicle_reg' | 'service_company'>, vanLabel: (id: string | null, reg?: string | null) => string) {
  if (k.status === 'on_van') return vanLabel(k.vehicle_id, k.vehicle_reg);
  if (k.status === 'spare') return 'Spare · Yard';
  if (k.status === 'away_for_service') return `Away for service${k.service_company ? ` · ${k.service_company}` : ''}`;
  return 'Removed';
}

export function kitUpdateTarget(k: KitItemOverview, kitTypes: KitType[], vanLabel: (id: string | null, reg?: string | null) => string): UpdateTarget {
  return {
    source: 'kit',
    itemId: k.id,
    itemName: k.type_name,
    plantNo: k.plant_no,
    where: kitWhere(k, vanLabel),
    serviceDate: k.service_date,
    expiryDate: k.expiry_date,
    swapItem: k.status === 'on_van' ? k : null,
    months: monthsForType(kitTypes, k.kit_type_id),
  };
}

export function ppeUpdateTarget(
  p: { id: string; item_name: string; expiry_date: string | null; vehicle_id: string | null; vehicle_reg?: string | null; checklist_item_id?: string | null },
  checklist: AuditChecklistItem[],
  vanLabel: (id: string | null, reg?: string | null) => string
): UpdateTarget {
  const c = checklist.find((x) => (p.checklist_item_id ? x.id === p.checklist_item_id : x.section === 'ppe' && x.name === p.item_name));
  return {
    source: 'ppe',
    itemId: p.id,
    itemName: p.item_name,
    plantNo: null,
    where: vanLabel(p.vehicle_id, p.vehicle_reg),
    serviceDate: null,
    expiryDate: p.expiry_date,
    months: c?.service_interval_months ?? null,
    dateLabel: c?.date_label ?? null,
  };
}
