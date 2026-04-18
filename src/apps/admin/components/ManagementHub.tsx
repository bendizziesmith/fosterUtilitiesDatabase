import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Car, ArrowRight } from 'lucide-react';

export const ManagementHub: React.FC = () => {
  const navigate = useNavigate();

  const managementOptions = [
    {
      id: 'employees',
      title: 'Employee Management',
      description: 'Staff, qualifications, licenses, and vehicle assignments',
      icon: Users,
      iconBg: 'bg-blue-50',
      iconColor: 'text-blue-600',
      features: ['Add & edit employees', 'Training qualifications', 'Driving licenses', 'Role assignments', 'Vehicle assignments'],
      onClick: () => navigate('/employees'),
    },
    {
      id: 'vehicles',
      title: 'Vehicle Fleet Management',
      description: 'Fleet vehicles, service schedules, and MOT tracking',
      icon: Car,
      iconBg: 'bg-orange-50',
      iconColor: 'text-orange-600',
      features: ['Add & edit vehicles', 'Service scheduling', 'MOT tracking', 'Assignment management', 'Fleet overview'],
      onClick: () => navigate('/vehicles'),
    },
  ];

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Management</h1>
        <p className="text-sm text-slate-500 mt-1">
          Employee and fleet management tools
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {managementOptions.map((option) => {
          const Icon = option.icon;

          return (
            <button
              key={option.id}
              onClick={option.onClick}
              className="bg-white border border-slate-200 rounded-xl p-5 text-left hover:border-slate-300 hover:shadow-sm transition-all duration-200 group"
            >
              <div className="flex flex-col items-center mb-4 pt-1">
                <div className={`p-3 ${option.iconBg} rounded-xl`}>
                  <Icon className={`h-6 w-6 ${option.iconColor}`} />
                </div>
              </div>

              <div className="flex items-center justify-between mb-1">
                <h2 className="text-sm font-semibold text-slate-900">
                  {option.title}
                </h2>
                <ArrowRight className="h-4 w-4 text-slate-300 group-hover:text-slate-500 group-hover:translate-x-0.5 transition-all flex-shrink-0" />
              </div>
              <p className="text-xs text-slate-500 mb-3 leading-relaxed">
                {option.description}
              </p>

              <div className="flex flex-wrap gap-1.5">
                {option.features.map((feature, i) => (
                  <span
                    key={i}
                    className="text-[11px] text-slate-500 bg-slate-50 px-2 py-0.5 rounded-full"
                  >
                    {feature}
                  </span>
                ))}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
