import React, { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { CheckCircle2, Clock, XCircle, Eye, AlertTriangle } from 'lucide-react';

interface EmployeeCompliance {
  employee_id: string;
  employee_name: string;
  employee_role: string;
  havs_status: 'not_started' | 'draft' | 'submitted';
  havs_week_id: string | null;
  total_exposure_minutes: number;
  last_updated: string | null;
  submitted_at: string | null;
  revision_number: number;
  gang_id: string;
  gang_name: string;
  is_ganger: boolean;
}

interface HavsWeeklyComplianceTableProps {
  weekEnding: string;
  onViewDetails: (employeeId: string, havsWeekId: string | null) => void;
}

export const HavsWeeklyComplianceTable: React.FC<HavsWeeklyComplianceTableProps> = ({
  weekEnding,
  onViewDetails,
}) => {
  const [employees, setEmployees] = useState<EmployeeCompliance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadComplianceData();
  }, [weekEnding]);

  const loadComplianceData = async () => {
    setLoading(true);
    setError(null);

    try {
      const { data, error: rpcError } = await supabase.rpc('get_weekly_havs_compliance', {
        target_week_ending: weekEnding
      });

      if (rpcError) throw rpcError;

      setEmployees(data || []);
    } catch (err) {
      console.error('Error loading HAVS compliance:', err);
      setError('Failed to load compliance data');
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'submitted':
        return (
          <div className="flex items-center gap-1.5 text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full">
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span className="text-xs font-medium">Submitted</span>
          </div>
        );
      case 'draft':
        return (
          <div className="flex items-center gap-1.5 text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full">
            <Clock className="h-3.5 w-3.5" />
            <span className="text-xs font-medium">Draft</span>
          </div>
        );
      case 'not_started':
        return (
          <div className="flex items-center gap-1.5 text-red-700 bg-red-50 px-2.5 py-1 rounded-full">
            <XCircle className="h-3.5 w-3.5" />
            <span className="text-xs font-medium">Not Started</span>
          </div>
        );
      default:
        return null;
    }
  };

  const formatExposureTime = (minutes: number) => {
    if (minutes === 0) return '0m';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours === 0) return `${mins}m`;
    if (mins === 0) return `${hours}h`;
    return `${hours}h ${mins}m`;
  };

  const formatLastUpdated = (timestamp: string | null) => {
    if (!timestamp) return '—';
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 p-8">
        <div className="flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-slate-600">Loading compliance data...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-red-600" />
          <p className="text-sm text-red-800">{error}</p>
        </div>
      </div>
    );
  }

  if (employees.length === 0) {
    return (
      <div className="bg-slate-50 border border-slate-200 rounded-lg p-8 text-center">
        <p className="text-slate-600">No employees found for this week</p>
      </div>
    );
  }

  const notStartedCount = employees.filter(e => e.havs_status === 'not_started').length;
  const draftCount = employees.filter(e => e.havs_status === 'draft').length;
  const submittedCount = employees.filter(e => e.havs_status === 'submitted').length;
  const totalEmployees = employees.length;
  const compliancePercentage = totalEmployees > 0
    ? Math.round((submittedCount / totalEmployees) * 100)
    : 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Total Employees</p>
          <p className="text-2xl font-bold text-slate-900">{totalEmployees}</p>
        </div>

        <div className="bg-emerald-50 rounded-lg border border-emerald-200 p-4">
          <p className="text-xs text-emerald-700 uppercase tracking-wide mb-1">Submitted</p>
          <p className="text-2xl font-bold text-emerald-900">{submittedCount}</p>
          <p className="text-xs text-emerald-600 mt-1">{compliancePercentage}% compliance</p>
        </div>

        <div className="bg-amber-50 rounded-lg border border-amber-200 p-4">
          <p className="text-xs text-amber-700 uppercase tracking-wide mb-1">In Draft</p>
          <p className="text-2xl font-bold text-amber-900">{draftCount}</p>
          <p className="text-xs text-amber-600 mt-1">Needs submission</p>
        </div>

        <div className="bg-red-50 rounded-lg border border-red-200 p-4">
          <p className="text-xs text-red-700 uppercase tracking-wide mb-1">Not Started</p>
          <p className="text-2xl font-bold text-red-900">{notStartedCount}</p>
          <p className="text-xs text-red-600 mt-1">Requires attention</p>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
          <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wide">
            Weekly HAVS Compliance
          </h3>
          <p className="text-xs text-slate-600 mt-1">
            Week Ending: {new Date(weekEnding).toLocaleDateString('en-GB', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              year: 'numeric'
            })}
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Employee
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Role
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Total Exposure
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Last Updated
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {employees.map((employee) => (
                <tr
                  key={employee.employee_id}
                  className={`hover:bg-slate-50 transition-colors ${
                    employee.havs_status === 'not_started' ? 'bg-red-50/30' : ''
                  }`}
                >
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div>
                        <div className="text-sm font-medium text-slate-900">
                          {employee.employee_name}
                        </div>
                        {employee.revision_number > 0 && (
                          <div className="text-xs text-slate-500">
                            Rev #{employee.revision_number}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm text-slate-700">{employee.employee_role}</span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {getStatusBadge(employee.havs_status)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`text-sm font-medium ${
                      employee.total_exposure_minutes > 0 ? 'text-slate-900' : 'text-slate-400'
                    }`}>
                      {formatExposureTime(employee.total_exposure_minutes)}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm text-slate-600">
                      {formatLastUpdated(employee.last_updated)}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {employee.havs_status !== 'not_started' ? (
                      <button
                        onClick={() => onViewDetails(employee.employee_id, employee.havs_week_id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-blue-700 bg-blue-50 rounded-md hover:bg-blue-100 transition-colors"
                      >
                        <Eye className="h-4 w-4" />
                        View
                      </button>
                    ) : (
                      <span className="text-sm text-slate-400 italic">Not started</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
