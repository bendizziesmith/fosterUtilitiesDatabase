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

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  inspections,
}) => {
  const navigate = useNavigate();

  const totalInspections = inspections.length;
  const inspectionsWithDefects = inspections.filter(i => i.has_defects).length;
  const cleanInspections = totalInspections - inspectionsWithDefects;

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const recentInspections = inspections.filter(i =>
    new Date(i.submitted_at) >= sevenDaysAgo
  ).length;

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <button
          onClick={() => navigate('/weekly-timesheets')}
          className="group relative bg-gradient-to-br from-teal-600 to-teal-700 rounded-2xl p-6 text-left text-white overflow-hidden transition-all duration-200 hover:shadow-lg hover:shadow-teal-200/40 active:scale-[0.98]"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -translate-y-10 translate-x-10" />
          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-white/15 rounded-xl">
                <FileText className="h-7 w-7" />
              </div>
              <div>
                <h3 className="text-lg font-bold">Weekly Timesheets</h3>
                <p className="text-sm text-teal-100 mt-0.5">Review submissions & compliance</p>
              </div>
            </div>
            <ArrowRight className="h-5 w-5 text-teal-200 group-hover:translate-x-1 transition-transform" />
          </div>
        </button>

        <button
          onClick={() => navigate('/inspections')}
          className="group relative bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl p-6 text-left text-white overflow-hidden transition-all duration-200 hover:shadow-lg hover:shadow-blue-200/40 active:scale-[0.98]"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -translate-y-10 translate-x-10" />
          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-white/15 rounded-xl">
                <ClipboardList className="h-7 w-7" />
              </div>
              <div>
                <h3 className="text-lg font-bold">Vehicle Checks</h3>
                <p className="text-sm text-blue-100 mt-0.5">Daily inspections & plant checks</p>
              </div>
            </div>
            <ArrowRight className="h-5 w-5 text-blue-200 group-hover:translate-x-1 transition-transform" />
          </div>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {[
          {
            title: 'Daily Vehicle & Plant Checks',
            description: 'Monitor safety inspections and equipment compliance',
            icon: ClipboardList,
            color: 'from-blue-500 to-blue-600',
            iconBg: 'bg-blue-50',
            iconColor: 'text-blue-600',
            stat: totalInspections,
            sub: `${recentInspections} this week`,
            onClick: () => navigate('/inspections'),
          },
          {
            title: 'HAVs Timesheets',
            description: 'Hand Arm Vibration Syndrome exposure records',
            icon: Shield,
            color: 'from-orange-500 to-orange-600',
            iconBg: 'bg-orange-50',
            iconColor: 'text-orange-600',
            stat: 'Safety',
            sub: 'Exposure tracking',
            onClick: () => navigate('/havs-timesheets'),
          },
          {
            title: 'Management Hub',
            description: 'Manage staff, vehicles and assignments',
            icon: Users,
            color: 'from-slate-500 to-slate-600',
            iconBg: 'bg-slate-50',
            iconColor: 'text-slate-600',
            stat: 'System',
            sub: 'Management tools',
            onClick: () => navigate('/management'),
          },
        ].map((card, idx) => {
          const Icon = card.icon;
          return (
            <div
              key={idx}
              onClick={card.onClick}
              className="group bg-white rounded-xl border border-slate-200 hover:border-slate-300 hover:shadow-md transition-all duration-200 cursor-pointer overflow-hidden"
            >
              <div className={`bg-gradient-to-r ${card.color} px-5 py-4 text-white`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-white/15 rounded-lg">
                      <Icon className="h-5 w-5" />
                    </div>
                    <h3 className="font-bold">{card.title}</h3>
                  </div>
                  <ArrowRight className="h-4 w-4 opacity-60 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                </div>
                <div className="flex items-baseline gap-2 mt-3">
                  <span className="text-2xl font-bold">{card.stat}</span>
                  <span className="text-sm opacity-75">{card.sub}</span>
                </div>
              </div>
              <div className="px-5 py-3">
                <p className="text-sm text-slate-600">{card.description}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
