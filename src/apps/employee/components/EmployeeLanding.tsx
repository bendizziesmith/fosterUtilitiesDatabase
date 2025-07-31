import React from 'react';
import { ClipboardList, Wrench, Clock, ArrowRight } from 'lucide-react';

interface EmployeeLandingProps {
  onTaskSelect: (task: 'inspection' | 'plant' | 'timesheet') => void;
}

export const EmployeeLanding: React.FC<EmployeeLandingProps> = ({ onTaskSelect }) => {
  const tasks = [
    {
      id: 'inspection' as const,
      title: 'Daily Plant and Vehicle Checklist',
      description: 'Complete daily safety checks for all plant and vehicles',
      icon: ClipboardList,
      color: 'bg-blue-500',
      lightColor: 'bg-blue-50',
      iconColor: 'text-blue-600',
      features: ['Pre-shift safety checks', 'Equipment inspection', 'Photo documentation']
    },
    {
      id: 'timesheet' as const,
      title: 'Timesheet and Measures',
      description: 'Record your working hours, activities and daily measures',
      icon: Clock,
      color: 'bg-green-500',
      lightColor: 'bg-green-50',
      iconColor: 'text-green-600',
      features: ['Hours tracking', 'Work activities', 'Daily measures', 'Payroll ready']
    }
  ];

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-slate-900 mb-3">
          Daily Operations Portal
        </h1>
        <p className="text-lg text-slate-600">
          Complete your daily checks and record your activities
        </p>
      </div>

      {/* Task Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
        {tasks.map((task) => {
          const Icon = task.icon;
          
          return (
            <div
              key={task.id}
              className="bg-white rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden group cursor-pointer border border-slate-200 hover:border-slate-300"
              onClick={() => onTaskSelect(task.id)}
            >
              <div className="p-8">
                {/* Icon and Title */}
                <div className="text-center mb-6">
                  <div className={`p-4 ${task.lightColor} rounded-2xl group-hover:scale-110 transition-transform duration-200 mx-auto w-20 h-20 flex items-center justify-center mb-4`}>
                    <Icon className={`h-10 w-10 ${task.iconColor}`} />
                  </div>
                  <h3 className="text-2xl font-bold text-slate-900 group-hover:text-slate-700 transition-colors mb-2">
                    {task.title}
                  </h3>
                  <ArrowRight className="h-6 w-6 text-slate-400 group-hover:text-slate-600 group-hover:translate-x-2 transition-all duration-200 mx-auto" />
                </div>

                {/* Description */}
                <p className="text-slate-600 mb-6 leading-relaxed text-center">
                  {task.description}
                </p>

                {/* Features */}
                <div className="space-y-3">
                  {task.features.map((feature, index) => (
                    <div key={index} className="flex items-center justify-center text-sm text-slate-600">
                      <div className={`w-2 h-2 ${task.color} rounded-full mr-3 flex-shrink-0`}></div>
                      <span>{feature}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Action Bar */}
              <div className={`${task.lightColor} px-8 py-4 border-t border-slate-100`}>
                <div className="flex items-center justify-between">
                  <span className={`text-sm font-medium ${task.iconColor}`}>
                    Get Started
                  </span>
                  <div className={`w-8 h-8 ${task.color} rounded-full flex items-center justify-center group-hover:scale-110 transition-transform duration-200`}>
                    <ArrowRight className="h-4 w-4 text-white" />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Quick Stats */}
      <div className="mt-12 bg-slate-50 rounded-2xl p-8">
        <h3 className="text-lg font-semibold text-slate-900 mb-4 text-center">
          Daily Operations Overview
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="text-center">
            <div className="text-3xl font-bold text-blue-600 mb-2">✓</div>
            <div className="text-sm text-slate-600">Complete Daily Safety Checks</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-green-600 mb-2">⏱</div>
            <div className="text-sm text-slate-600">Record Hours & Activities</div>
          </div>
        </div>
      </div>
    </div>
  );
};