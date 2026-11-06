import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, ChevronRight } from 'lucide-react';
import { LoadingSpinner } from '../../../../components/LoadingSpinner';
import { AttentionRow, AttentionTab, filterAttention, expiryWording, todayISO } from '../../../../lib/siteAuditLogic';
import { AuditChecklistItem, AuditPhotoSlot, Auditor, KitItemOverview, KitType } from '../../../../lib/supabase';
import { LockupRow } from '../../../../lib/lockupService';
import { AuditTarget } from '../../../../lib/siteAuditLogic';
import { UpdateItemSheet, UpdateTarget } from './UpdateItemSheet';
import { SwapKitSheet } from './SwapKitSheet';
import { HomeSheet, DeletePlantSheet } from './FleetSheets';
import { kitUpdateTarget, monthsForType, ppeUpdateTarget } from './updateTargets';
import { TestTag } from './ui';
import { btn, card } from './styles';

/** Status in colour AND words: "Expired 3 weeks ago", "Expires in 12 days", "Needs a home". */
function StatusBadge({ r }: { r: AttentionRow }) {
  const text = r.expiry_status === 'no_home' ? 'Needs a home' : expiryWording(r.expiry_date, todayISO()).text;
  const cls = r.expiry_status === 'due_soon' ? 'bg-amber-50 text-amber-800 border-amber-200' : 'bg-red-50 text-red-700 border-red-200';
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border whitespace-nowrap ${cls}`}>{text}</span>;
}

/**
 * Needs attention (Kit & Plant): kit, PPE and H&S that are expired or due within 30 days, kit with
 * no home, then low stock in the Yard Lockup. Compact rows; Update / Swap on the right (full width on phone).
 */
export function NeedsAttention({ rows, lowStock, kit, refData, onChanged }: {
  rows: AttentionRow[] | null;
  lowStock: LockupRow[];
  kit: KitItemOverview[];
  refData: { allTargets: AuditTarget[]; auditors: Auditor[]; kitTypes: KitType[]; checklist: AuditChecklistItem[]; photoSlots?: AuditPhotoSlot[] };
  onChanged: () => void;
}) {
  const navigate = useNavigate();
  const [tab, setTab] = useState<AttentionTab>('all');
  const [updating, setUpdating] = useState<UpdateTarget | null>(null);
  const [swapping, setSwapping] = useState<KitItemOverview | null>(null);
  const [homing, setHoming] = useState<AttentionRow | null>(null);
  const [deleting, setDeleting] = useState<KitItemOverview | null>(null);

  const kitFor = (r: AttentionRow) => (r.source === 'kit' ? kit.find((k) => k.id === r.item_id) ?? null : null);
  const sectionOf = (r: AttentionRow) =>
    r.source === 'kit' ? 'Kit' : refData.checklist.find((c) => c.name === r.item_name)?.section === 'hs' ? 'H&S' : 'PPE';
  const where = (r: AttentionRow) => {
    if (r.source === 'kit' && r.kit_status === 'spare') return 'Yard Lockup';
    if (r.holder_kind === 'person') return `${r.holder_name ?? 'Unknown'} · ${r.vehicle_reg ?? 'no van'}`;
    if (r.holder_kind === 'spare_van') return `${r.vehicle_reg ?? 'Van'} · spare van`;
    return r.expiry_status === 'no_home' ? 'Unassigned, needs a home' : r.vehicle_reg ?? '—';
  };
  const holderKeyOf = (r: AttentionRow) =>
    r.holder_kind === 'person' && r.holder_employee_id ? `person:${r.holder_employee_id}`
      : r.holder_kind === 'spare_van' && r.vehicle_id ? `van:${r.vehicle_id}` : null;
  const openUpdate = (r: AttentionRow) => {
    const k = kitFor(r);
    if (r.source === 'kit' && k) setUpdating(kitUpdateTarget(k, refData.kitTypes));
    else setUpdating(ppeUpdateTarget({ id: r.item_id, item_name: r.item_name, expiry_date: r.expiry_date }, where(r), refData.checklist));
  };
  const done = () => {
    setUpdating(null);
    setSwapping(null);
    setHoming(null);
    setDeleting(null);
    onChanged();
  };

  const visible = rows ? filterAttention(rows, tab) : [];
  const counts = {
    all: rows?.length ?? 0,
    expired: rows?.filter((r) => r.expiry_status === 'expired').length ?? 0,
    due: rows?.filter((r) => r.expiry_status === 'due_soon').length ?? 0,
  };

  return (
    <section className={card} aria-labelledby="attention-h">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 sm:px-5 py-3 border-b border-slate-200">
        <h2 id="attention-h" className="flex items-center gap-2 text-base font-bold text-slate-900">
          <AlertTriangle className="h-5 w-5 text-red-600" aria-hidden="true" />Needs attention
        </h2>
        <div role="tablist" aria-label="Filter" className="grid grid-cols-3 sm:flex gap-1 bg-slate-100 p-1 rounded-lg">
          {([
            ['all', `All ${counts.all}`],
            ['expired', `Expired ${counts.expired}`],
            ['due', `Due soon ${counts.due}`],
          ] as [AttentionTab, string][]).map(([v, l]) => (
            <button key={v} type="button" role="tab" aria-selected={tab === v} onClick={() => setTab(v)}
              className={`min-h-[44px] sm:min-h-[36px] px-3 rounded-md text-sm font-semibold cursor-pointer transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${tab === v ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {rows === null ? (
        <LoadingSpinner />
      ) : visible.length === 0 ? (
        <p className="flex items-center gap-2 px-5 py-6 text-base sm:text-sm text-slate-700">
          <CheckCircle2 className="h-5 w-5 text-green-600" aria-hidden="true" />
          Nothing {tab === 'expired' ? 'expired' : tab === 'due' ? 'due within 30 days' : 'needs attention'}.
        </p>
      ) : (
        <ul className="divide-y divide-slate-200">
          {visible.map((r) => {
            const key = holderKeyOf(r);
            const swappable = r.source === 'kit' && r.kit_status === 'on_van';
            return (
              <li key={`${r.source}:${r.item_id}`} className="px-4 sm:px-5 py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                <div className="sm:w-44 flex-shrink-0"><StatusBadge r={r} /></div>
                <div className="flex-1 min-w-0">
                  <p className="text-base sm:text-sm font-bold text-slate-900 flex flex-wrap items-center gap-x-2">
                    {r.item_name}
                    {r.plant_no && <span className="font-semibold text-slate-700">{r.plant_no}</span>}
                    <span className="text-xs font-semibold text-slate-600 uppercase">{sectionOf(r)}</span>
                    <TestTag show={r.is_test} />
                  </p>
                  {key ? (
                    <button type="button" onClick={() => navigate(`/kit/van?key=${encodeURIComponent(key)}`)}
                      className="text-left text-sm font-medium text-blue-700 hover:underline cursor-pointer min-h-[32px] rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">{where(r)}</button>
                  ) : (
                    <p className="text-sm text-slate-700">{where(r)}</p>
                  )}
                </div>
                <div className="grid grid-flow-col auto-cols-fr sm:flex gap-2 sm:flex-shrink-0">
                  {r.expiry_status === 'no_home'
                    ? <button type="button" className={btn.small} onClick={() => setHoming(r)}>Find a home</button>
                    : <button type="button" className={btn.small} onClick={() => openUpdate(r)}>Update</button>}
                  {swappable && <button type="button" className={btn.small} onClick={() => setSwapping(kitFor(r))}>Swap</button>}
                  {r.source === 'kit' && kitFor(r) && <button type="button" className={btn.smallDelete} onClick={() => setDeleting(kitFor(r))}>Delete</button>}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {lowStock.length > 0 && (
        <div className="border-t border-slate-200" aria-labelledby="low-stock-h">
          <h3 id="low-stock-h" className="px-4 sm:px-5 pt-3 pb-1 text-xs font-bold text-amber-800 uppercase tracking-wider">
            Low stock in Yard Lockup · {lowStock.length}
          </h3>
          <ul className="divide-y divide-slate-100 pb-1">
            {lowStock.map((l) => (
              <li key={l.id}>
                <button type="button" onClick={() => navigate('/kit?view=lockup')}
                  className="w-full min-h-[48px] px-4 sm:px-5 py-2 flex items-center gap-3 text-left hover:bg-amber-50 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-500">
                  <span className="sm:w-44 flex-shrink-0"><span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border bg-amber-50 text-amber-800 border-amber-200">Low stock</span></span>
                  <span className="flex-1 min-w-0 text-base sm:text-sm">
                    <span className="font-bold text-slate-900">{l.name}</span> <TestTag show={l.is_test} />
                    <span className="block sm:inline sm:ml-2 text-slate-700">{l.quantity} left · low at {l.low_at}</span>
                  </span>
                  <ChevronRight className="h-4 w-4 text-slate-400 flex-shrink-0" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {deleting && <DeletePlantSheet item={deleting} auditors={refData.auditors} onClose={() => setDeleting(null)} onDone={done} />}
      {homing && (
        <HomeSheet item={{ id: homing.item_id, item_name: homing.item_name, plant_no: homing.plant_no }} targets={refData.allTargets} auditors={refData.auditors}
          onClose={() => setHoming(null)} onDone={done} />
      )}
      {updating && <UpdateItemSheet target={updating} targets={refData.allTargets} auditors={refData.auditors} onClose={() => setUpdating(null)} onSaved={done} />}
      {swapping && (
        <SwapKitSheet item={swapping} targets={refData.allTargets} months={monthsForType(refData.kitTypes, swapping.kit_type_id)} auditors={refData.auditors} onClose={() => setSwapping(null)} onSaved={done} />
      )}
    </section>
  );
}
