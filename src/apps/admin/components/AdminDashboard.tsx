import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ClipboardList,
  Users,
  ArrowRight,
  Shield,
  FileText,
} from 'lucide-react';
import { VehicleInspection, PlantRecord } from '../../../lib/supabase';

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
];

export const AdminDashboard: React.FC<AdminDashboardProps> = () => {
  const navigate = useNavigate();

  return (
    <div>
      <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
        Operations
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {navCards.map((card) => {
          const Icon = card.icon;
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
