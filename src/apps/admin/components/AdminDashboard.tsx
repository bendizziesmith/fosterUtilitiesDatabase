import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ClipboardList,
  Users,
  ArrowRight,
  Shield,
  Target
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

  // Calculate statistics
  const totalInspections = inspections.length;
  const inspectionsWithDefects = inspections.filter(i => i.has_defects).length;
  const cleanInspections = totalInspections - inspectionsWithDefects;

  // Recent activity (last 7 days)
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  
  const recentInspections = inspections.filter(i => 
    new Date(i.submitted_at) >= sevenDaysAgo
  ).length;

  // Today's activity
  const today = new Date().toISOString().split('T')[0];
  const todayInspections = inspections.filter(i => 
    new Date(i.submitted_at).toISOString().split('T')[0] === today
  ).length;

  // Calculate inspections with fixed defects
  const inspectionsWithFixedDefects = inspections.filter(inspection => {
    if (!inspection.inspection_items || inspection.inspection_items.length === 0) return false;
    
    // Get inspections from the last 7 days for the same vehicle
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    // Check if this inspection has any items marked as defect_fixed
    return inspection.inspection_items?.some(item => item.defect_fixed === true) || false;
  }).length;

  const primaryActions = [
    {
      title: 'Daily Vehicle & Plant Checks',
      description: 'Monitor safety inspections and equipment compliance',
      icon: ClipboardList,
      color: 'from-blue-500 to-blue-600',
      lightColor: 'bg-blue-50',
      iconColor: 'text-blue-600',
      stats: {
        primary: totalInspections,
        secondary: `${recentInspections} this week`,
        status: cleanInspections > inspectionsWithDefects ? 'positive' : 'warning'
      },
      onClick: () => navigate('/inspections')
    },
    {
      title: 'HAVs Timesheets',
      description: 'Monitor Hand Arm Vibration Syndrome exposure records',
      icon: Shield,
      color: 'from-orange-500 to-orange-600',
      lightColor: 'bg-orange-50',
      iconColor: 'text-orange-600',
      stats: {
        primary: 'Safety',
        secondary: 'Exposure tracking',
        status: 'positive'
      },
      onClick: () => navigate('/havs-timesheets')
    },
    {
      title: 'Management Hub',
      description: 'Manage staff and vehicles',
      icon: Users,
      color: 'from-slate-500 to-slate-600',
      lightColor: 'bg-slate-50',
      iconColor: 'text-slate-600',
      stats: {
        primary: 'System',
        secondary: 'Management tools',
        status: 'neutral'
      },
      onClick: () => navigate('/management')
    }
  ];

  return (
    <div className="space-y-8">
      {/* Hero Section */}
      <div className="bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 rounded-2xl p-8 border border-slate-200">
        <div className="text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-2xl mb-6">
            <Shield className="h-8 w-8 text-blue-600" />
          </div>
          <h1 className="text-3xl font-bold text-slate-900 mb-4">
            Employer Operations Dashboard
          </h1>
          <p className="text-lg text-slate-600 leading-relaxed">
            Monitor daily safety compliance, review professional timesheets, and manage your workforce with comprehensive oversight tools.
          </p>
        </div>
      </div>

      {/* Primary Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {primaryActions.map((action, index) => {
          const Icon = action.icon;
          
          return (
            <div
              key={index}
              className="group bg-white rounded-2xl shadow-sm hover:shadow-lg transition-all duration-300 overflow-hidden border border-slate-200 hover:border-slate-300 cursor-pointer"
              onClick={action.onClick}
            >
              {/* Header with gradient */}
              <div className={`bg-gradient-to-r ${action.color} p-6 text-white`}>
                <div className="flex items-center justify-between mb-4">
                  <div className="p-3 bg-white bg-opacity-20 rounded-xl group-hover:scale-110 transition-transform duration-200">
                    <Icon className="h-8 w-8 text-white" />
                  </div>
                  <ArrowRight className="h-6 w-6 opacity-70 group-hover:opacity-100 group-hover:translate-x-1 transition-all duration-200" />
                </div>
                
                <h3 className="text-xl font-bold mb-2 group-hover:text-opacity-90 transition-colors">
                  {action.title}
                </h3>
                
                <div className="flex items-center space-x-2 text-white text-opacity-90">
                  <span className="text-2xl font-bold">{action.stats.primary}</span>
                  <div className="text-sm opacity-75">{action.stats.secondary}</div>
                </div>
              </div>

              {/* Content */}
              <div className="p-6">
                <p className="text-slate-600 leading-relaxed mb-4">
                  {action.description}
                </p>
                
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-700">
                    Access Dashboard
                  </span>
                  <div className="w-8 h-8 bg-slate-100 group-hover:bg-slate-200 rounded-full flex items-center justify-center transition-colors duration-200">
                    <ArrowRight className="h-4 w-4 text-slate-600" />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Quick Actions */}
      <div className="bg-gradient-to-r from-slate-900 to-slate-800 rounded-2xl p-8 text-white">
        <div className="text-center mb-8">
          <Target className="h-12 w-12 text-blue-400 mx-auto mb-4" />
          <h3 className="text-2xl font-bold mb-2">System Management</h3>
          <p className="text-slate-300">
            Access comprehensive management tools for complete operational oversight
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <button
            onClick={() => navigate('/management')}
            className="bg-white bg-opacity-10 hover:bg-opacity-20 rounded-xl p-6 transition-all duration-200 text-left group"
          >
            <Users className="h-8 w-8 text-blue-400 mb-3 group-hover:scale-110 transition-transform" />
            <div className="text-lg font-semibold mb-2">Staff Management</div>
            <div className="text-sm text-slate-300">Employees, vehicles & assignments</div>
          </button>

          <button
            onClick={() => navigate('/inspections')}
            className="bg-white bg-opacity-10 hover:bg-opacity-20 rounded-xl p-6 transition-all duration-200 text-left group"
          >
            <ClipboardList className="h-8 w-8 text-green-400 mb-3 group-hover:scale-110 transition-transform" />
            <div className="text-lg font-semibold mb-2">Safety Monitoring</div>
            <div className="text-sm text-slate-300">Daily checks & compliance</div>
          </button>

          <button
            onClick={() => navigate('/havs-timesheets')}
            className="bg-white bg-opacity-10 hover:bg-opacity-20 rounded-xl p-6 transition-all duration-200 text-left group"
          >
            <Shield className="h-8 w-8 text-orange-400 mb-3 group-hover:scale-110 transition-transform" />
            <div className="text-lg font-semibold mb-2">HAVs Records</div>
            <div className="text-sm text-slate-300">Vibration exposure tracking</div>
          </button>
        </div>
      </div>
    </div>
  );
};