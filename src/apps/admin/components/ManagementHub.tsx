import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Car, UserPlus, Wrench, BarChart3, ArrowRight, DollarSign, FileText } from 'lucide-react';

export const ManagementHub: React.FC = () => {
  const navigate = useNavigate();

  const managementOptions = [
    {
      id: 'employees',
      title: 'Employee Management',
      description: 'Manage staff, qualifications, licenses, and vehicle assignments',
      icon: Users,
      color: 'bg-blue-500',
      lightColor: 'bg-blue-50',
      iconColor: 'text-blue-600',
      features: [
        'Add & edit employees',
        'Training qualifications',
        'Driving licenses',
        'Role assignments (Ganger/Labourer)',
        'Vehicle assignments'
      ],
      onClick: () => navigate('/employees')
    },
    {
      id: 'vehicles',
      title: 'Vehicle Fleet Management',
      description: 'Manage fleet vehicles, service schedules, and MOT tracking',
      icon: Car,
      color: 'bg-orange-500',
      lightColor: 'bg-orange-50',
      iconColor: 'text-orange-600',
      features: [
        'Add & edit vehicles',
        'Service scheduling',
        'MOT tracking',
        'Assignment management',
        'Fleet overview'
      ],
      onClick: () => navigate('/vehicles')
    },
    {
      id: 'ipsom-rates',
      title: 'Ipsom Rates Management',
      description: 'Manage Ipsom work rates, service sheets, and main LV & HV pricing',
      icon: FileText,
      color: 'bg-purple-500',
      lightColor: 'bg-purple-50',
      iconColor: 'text-purple-600',
      features: [
        'Service sheet rates',
        'Main LV & HV rates',
        'Work item management',
        'Price work rates',
        'Timesheet integration'
      ],
      onClick: () => navigate('/ipsom-rates')
    },
    {
      id: 'mollsworth-rates',
      title: 'Mollsworth Work Rates Management',
      description: 'Manage Mollsworth 11KV & 33KV work rates and pricing structure',
      icon: FileText,
      color: 'bg-indigo-500',
      lightColor: 'bg-indigo-50',
      iconColor: 'text-indigo-600',
      features: [
        '11KV & 33KV rates',
        'Work item management',
        'Voltage classifications',
        'Excavation parameters',
        'Site type configurations'
      ],
      onClick: () => navigate('/mollsworth-work-rates')
    }
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-3xl font-bold text-slate-900 mb-4">
          Management Dashboard
        </h1>
        <p className="text-lg text-slate-600 max-w-2xl mx-auto">
          Comprehensive management tools for employees and fleet vehicles. 
          Choose a section to get started.
        </p>
      </div>

      {/* Management Options */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {managementOptions.map((option) => {
          const Icon = option.icon;
          
          return (
            <div
              key={option.id}
              className="bg-white rounded-2xl shadow-sm hover:shadow-lg transition-all duration-300 overflow-hidden group cursor-pointer border border-slate-200 hover:border-slate-300"
              onClick={option.onClick}
            >
              {/* Header Section */}
              <div className={`${option.lightColor} p-6 border-b border-slate-200`}>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-4">
                    <div className={`p-3 ${option.lightColor} rounded-xl border-2 border-white shadow-sm group-hover:scale-110 transition-transform duration-200`}>
                      <Icon className={`h-8 w-8 ${option.iconColor}`} />
                    </div>
                    <div>
                      <h2 className="text-xl font-semibold text-slate-900 group-hover:text-slate-700 transition-colors">
                        {option.title}
                      </h2>
                    </div>
                  </div>
                  <ArrowRight className="h-6 w-6 text-slate-400 group-hover:text-slate-600 group-hover:translate-x-1 transition-all duration-200" />
                </div>
                
                <p className="text-slate-600 leading-relaxed">
                  {option.description}
                </p>
              </div>

              {/* Features Section */}
              <div className="p-6">
                <h3 className="text-sm font-semibold text-slate-700 mb-4 uppercase tracking-wide">
                  Key Features
                </h3>
                <div className="space-y-3">
                  {option.features.map((feature, index) => (
                    <div key={index} className="flex items-center space-x-3">
                      <div className={`w-2 h-2 ${option.color} rounded-full flex-shrink-0`}></div>
                      <span className="text-sm text-slate-600">{feature}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Action Footer */}
              <div className={`${option.lightColor} px-6 py-4 border-t border-slate-100`}>
                <div className="flex items-center justify-between">
                  <span className={`text-sm font-medium ${option.iconColor}`}>
                    Access Management
                  </span>
                  <div className={`w-8 h-8 ${option.color} rounded-full flex items-center justify-center group-hover:scale-110 transition-transform duration-200`}>
                    <ArrowRight className="h-4 w-4 text-white" />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Quick Stats */}
      <div className="bg-slate-50 rounded-2xl p-8">
        <h3 className="text-lg font-semibold text-slate-900 mb-6 text-center">
          Management Overview
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
          <div className="text-center">
            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center mx-auto mb-3">
              <Users className="h-6 w-6 text-blue-600" />
            </div>
            <div className="text-2xl font-bold text-slate-900 mb-1">Staff</div>
            <div className="text-sm text-slate-600">Employee Management</div>
          </div>
          <div className="text-center">
            <div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center mx-auto mb-3">
              <Car className="h-6 w-6 text-orange-600" />
            </div>
            <div className="text-2xl font-bold text-slate-900 mb-1">Fleet</div>
            <div className="text-sm text-slate-600">Vehicle Management</div>
          </div>
          <div className="text-center">
            <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center mx-auto mb-3">
              <UserPlus className="h-6 w-6 text-green-600" />
            </div>
            <div className="text-2xl font-bold text-slate-900 mb-1">Assign</div>
            <div className="text-sm text-slate-600">Vehicle Assignments</div>
          </div>
          <div className="text-center">
            <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center mx-auto mb-3">
              <BarChart3 className="h-6 w-6 text-purple-600" />
            </div>
            <div className="text-2xl font-bold text-slate-900 mb-1">Track</div>
            <div className="text-sm text-slate-600">Performance & Compliance</div>
          </div>
          <div className="text-center">
            <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center mx-auto mb-3">
              <FileText className="h-6 w-6 text-purple-600" />
            </div>
            <div className="text-2xl font-bold text-slate-900 mb-1">Rates</div>
            <div className="text-sm text-slate-600">Ipsom Rates</div>
          </div>
          <div className="text-center">
            <div className="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center mx-auto mb-3">
              <FileText className="h-6 w-6 text-indigo-600" />
            </div>
            <div className="text-2xl font-bold text-slate-900 mb-1">Mollsworth</div>
            <div className="text-sm text-slate-600">11KV & 33KV Rates</div>
          </div>
        </div>
      </div>
    </div>
  );
};