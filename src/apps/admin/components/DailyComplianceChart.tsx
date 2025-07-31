import React, { useState } from 'react';
import { CheckCircle, XCircle, Users, Calendar, ChevronDown, ChevronRight } from 'lucide-react';
import { VehicleInspection, Employee } from '../../../lib/supabase';

interface DailyComplianceChartProps {
  inspections: VehicleInspection[];
  employees: Employee[];
}

export const DailyComplianceChart: React.FC<DailyComplianceChartProps> = ({
  inspections,
  employees,
}) => {
  const [showDetails, setShowDetails] = useState(false);

  // Get today's date in YYYY-MM-DD format (ensure correct timezone)
  const today = new Date();
  today.setHours(0, 0, 0, 0); // Normalize to start of day
  const todayStr = today.toISOString().split('T')[0];
  
  console.log('Today is:', today.toDateString(), 'Day of week:', today.getDay(), 'Date string:', todayStr);
  
  // Get today's inspections
  const todayInspections = inspections.filter(inspection => {
    const inspectionDate = new Date(inspection.submitted_at);
    inspectionDate.setHours(0, 0, 0, 0); // Normalize to start of day
    const inspectionDateStr = inspectionDate.toISOString().split('T')[0];
    return inspectionDateStr === todayStr;
  });

  // Get unique employees who completed checks today
  const employeesWithChecksToday = new Set(
    todayInspections
      .filter(inspection => inspection.employee_id)
      .map(inspection => inspection.employee_id)
  );

  const completedCount = employeesWithChecksToday.size;
  const totalEmployees = employees.length;
  const pendingCount = totalEmployees - completedCount;
  
  // Calculate inspections with fixed defects today
  const inspectionsWithFixedDefectsToday = todayInspections.filter(inspection => {
    const hasFixedDefects = inspection.inspection_items?.some(item => {
      if (item.status !== 'no_defect') return false;
      
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      
      const previousInspections = inspections.filter(prevInspection => 
        prevInspection.vehicle_id === inspection.vehicle_id &&
        new Date(prevInspection.submitted_at) >= sevenDaysAgo &&
        new Date(prevInspection.submitted_at) < new Date(inspection.submitted_at)
      );
      
      return previousInspections.some(prevInspection =>
        prevInspection.inspection_items?.some(prevItem =>
          prevItem.item_name === item.item_name && prevItem.status === 'defect'
        )
      );
    });
    
    return hasFixedDefects;
  }).length;
  
  const completedPercentage = totalEmployees > 0 ? (completedCount / totalEmployees) * 100 : 0;
  const pendingPercentage = totalEmployees > 0 ? (pendingCount / totalEmployees) * 100 : 0;

  // Simple pie chart using CSS
  const circumference = 2 * Math.PI * 30; // smaller radius = 30
  const completedStroke = (completedPercentage / 100) * circumference;
  const pendingStroke = (pendingPercentage / 100) * circumference;

  // Get employees who haven't completed checks today
  const employeesWithoutChecks = employees.filter(
    employee => !employeesWithChecksToday.has(employee.id)
  );

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <Calendar className="h-5 w-5 text-blue-600" />
          <h3 className="text-xl font-bold text-slate-900">Daily Vehicle Check Compliance</h3>
        </div>
        <div className="flex items-center space-x-3">
          <div className="text-sm text-slate-500">
            {new Date().toLocaleDateString()}
          </div>
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="flex items-center space-x-1 text-sm text-blue-600 hover:text-blue-700 transition-colors"
          >
            <span>Details</span>
            {showDetails ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      <div className="flex items-center space-x-6">
        {/* Compact Pie Chart */}
        <div className="flex flex-col items-center">
          <div className="relative w-24 h-24 mb-3">
            <svg className="w-24 h-24 transform -rotate-90" viewBox="0 0 80 80">
              {/* Background circle */}
              <circle
                cx="40"
                cy="40"
                r="32"
                fill="none"
                stroke="#f1f5f9"
                strokeWidth="10"
              />
              
              {/* Completed section (green) */}
              {completedCount > 0 && (
                <circle
                  cx="40"
                  cy="40"
                  r="32"
                  fill="none"
                  stroke="#10b981"
                  strokeWidth="10"
                  strokeDasharray={`${completedStroke} ${circumference}`}
                  strokeDashoffset="0"
                  className="transition-all duration-500"
                />
              )}
              
              {/* Pending section (red) */}
              {pendingCount > 0 && (
                <circle
                  cx="40"
                  cy="40"
                  r="32"
                  fill="none"
                  stroke="#ef4444"
                  strokeWidth="10"
                  strokeDasharray={`${pendingStroke} ${circumference}`}
                  strokeDashoffset={`-${completedStroke}`}
                  className="transition-all duration-500"
                />
              )}
            </svg>
            
            {/* Center text */}
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <div className="text-xl font-bold text-slate-900">{completedCount}</div>
              <div className="text-sm text-slate-500">of {totalEmployees}</div>
            </div>
          </div>

          {/* Compact Legend */}
          <div className="space-y-2 text-center">
            <div className="flex items-center space-x-2 text-sm">
              <div className="w-3 h-3 bg-green-500 rounded-full"></div>
              <span className="text-slate-700 font-medium">Completed ({completedPercentage.toFixed(0)}%)</span>
            </div>
            <div className="flex items-center space-x-2 text-sm">
              <div className="w-3 h-3 bg-red-500 rounded-full"></div>
              <span className="text-slate-700 font-medium">Pending ({pendingPercentage.toFixed(0)}%)</span>
            </div>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="flex-1 grid grid-cols-2 gap-4">
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="flex items-center space-x-3">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <div>
                <div className="text-xl font-bold text-green-700">{completedCount}</div>
                <div className="text-sm text-green-600 font-medium">Completed</div>
              </div>
            </div>
          </div>
          
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-center space-x-3">
              <CheckCircle className="h-5 w-5 text-blue-600" />
              <div>
                <div className="text-xl font-bold text-blue-700">{inspectionsWithFixedDefectsToday}</div>
                <div className="text-sm text-blue-600 font-medium">Defects Fixed</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Expandable Details */}
      {showDetails && (
        <div className="mt-4 pt-4 border-t border-slate-200 space-y-3">
          {/* Employees without checks */}
          {employeesWithoutChecks.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <h4 className="text-sm font-semibold text-red-800 mb-2 flex items-center">
                <Users className="h-4 w-4 mr-1" />
                Employees Missing Daily Checks:
              </h4>
              <div className="space-y-1 max-h-20 overflow-y-auto">
                {employeesWithoutChecks.map((employee) => (
                  <div key={employee.id} className="text-sm text-red-700">
                    • {employee.full_name} ({employee.role})
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* All completed message */}
          {employeesWithoutChecks.length === 0 && totalEmployees > 0 && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <div className="flex items-center space-x-2 text-green-800">
                <CheckCircle className="h-4 w-4" />
                <span className="text-sm font-medium">
                  All employees have completed their daily vehicle checks!
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};