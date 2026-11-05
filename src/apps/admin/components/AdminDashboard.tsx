import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ClipboardList,
  ClipboardCheck,
  Users,
  ArrowRight,
  Shield,
  FileText,
  Wrench,
} from 'lucide-react';
import { VehicleInspection, PlantRecord } from '../../../lib/supabase';
import { getDashboardCounts } from '../../../lib/siteAuditService';

interface AdminDashboardProps {
  inspections: VehicleInspection[];
  plantRecords: PlantRecord[];
}

const navCards = [
  {
    title: 'Vehicle Checks',
    subtitle: 'Daily inspections & plant checks',
    icon: ClipboardList,
    iconBg: 'bg-blue-50',
    iconColor: 'text-blue-600',
    hoverBorder: 'hover:border-blue-300',
    hoverShadow: 'hover:shadow-blue-100/50',
    hoverArrow: 'group-hover:text-blue-500',
    path: '/inspections',
  },
  {
    title: 'Weekly Timesheets',
    subtitle: 'Review submissions & compliance',
    icon: FileText,
    iconBg: 'bg-teal-50',
    iconColor: 'text-teal-600',
    hoverBorder: 'hover:border-teal-300',
    hoverShadow: 'hover:shadow-teal-100/50',
    hoverArrow: 'group-hover:text-teal-500',
    path: '/weekly-timesheets',
  },
  {
    title: 'HAVs Timesheets',
    subtitle: 'Vibration exposure records',
    icon: Shield,
    iconBg: 'bg-amber-50',
    iconColor: 'text-amber-600',
    hoverBorder: 'hover:border-amber-300',
    hoverShadow: 'hover:shadow-amber-100/50',
    hoverArrow: 'group-hover:text-amber-500',
    path: '/havs-timesheets',
  },
  {
    title: 'Management Hub',
    subtitle: 'Staff, vehicles & assignments',
    icon: Users,
    iconBg: 'bg-slate-100',
    iconColor: 'text-slate-600',
    hoverBorder: 'hover:border-slate-300',
    hoverShadow: 'hover:shadow-slate-100/50',
    hoverArrow: 'group-hover:text-slate-500',
    path: '/management',
  },
  {
    title: 'Site Audits',
    subtitle: 'Gang audits: PPE, health & safety, kit',
    icon: ClipboardCheck,
    iconBg: 'bg-red-50',
    iconColor: 'text-red-600',
    hoverBorder: 'hover:border-red-300',
    hoverShadow: 'hover:shadow-red-100/50',
    hoverArrow: 'group-hover:text-red-500',
    path: '/audits',
  },
  {
    title: 'Kit & Plant',
    subtitle: "All kit and who it's assigned to",
    icon: Wrench,
    iconBg: 'bg-violet-50',
    iconColor: 'text-violet-600',
    hoverBorder: 'hover:border-violet-300',
    hoverShadow: 'hover:shadow-violet-100/50',
    hoverArrow: 'group-hover:text-violet-500',
    path: '/kit',
  },
];

type Counts = Awaited<ReturnType<typeof getDashboardCounts>>;

const Badge: React.FC<{ n: number; label: string; cls: string }> = ({ n, label, cls }) => (
  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border whitespace-nowrap ${cls}`}>
    {n} {label}
  </span>
);

function cardBadges(path: string, c: Counts | null) {
  if (!c) return null;
  if (path === '/audits') {
    if (!c.expired && !c.dueSoon) return null;
    return (
      <>
        {c.expired > 0 && <Badge n={c.expired} label="expired" cls="bg-red-50 text-red-700 border-red-200" />}
        {c.dueSoon > 0 && <Badge n={c.dueSoon} label="due soon" cls="bg-amber-50 text-amber-800 border-amber-200" />}
      </>
    );
  }
  if (path === '/kit') {
    return (
      <>
        <Badge n={c.onVans} label="on vans" cls="bg-slate-100 text-slate-700 border-slate-200" />
        <Badge n={c.spares} label="in Yard Lockup" cls="bg-violet-50 text-violet-700 border-violet-200" />
      </>
    );
  }
  return null;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = () => {
  const navigate = useNavigate();
  const [counts, setCounts] = useState<Counts | null>(null);

  useEffect(() => {
    getDashboardCounts().then(setCounts).catch(() => setCounts(null));
  }, []);

  return (
    <div>
      <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
        Operations
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {navCards.map((card) => {
          const Icon = card.icon;
          const badges = cardBadges(card.path, counts);
          return (
            <button
              key={card.path}
              onClick={() => navigate(card.path)}
              className={`group bg-white border border-slate-200 rounded-xl p-4 text-left transition-all duration-200 ${card.hoverBorder} hover:shadow-md ${card.hoverShadow} active:scale-[0.98] cursor-pointer`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`p-2 ${card.iconBg} rounded-lg`}>
                    <Icon className={`h-4 w-4 ${card.iconColor}`} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">
                      {card.title}
                    </h3>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {card.subtitle}
                    </p>
                    {badges && <div className="flex flex-wrap gap-1.5 mt-1.5">{badges}</div>}
                  </div>
                </div>
                <ArrowRight
                  className={`h-4 w-4 text-slate-300 ${card.hoverArrow} group-hover:translate-x-0.5 transition-all`}
                />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
