import React, { useState } from 'react';
import { Search, Filter, User, Calendar, CheckCircle, XCircle } from 'lucide-react';
import { VehicleInspection, Employee } from '../../../lib/supabase';

interface EmployeeSearchFilterProps {
  employees: Employee[];
  inspections: VehicleInspection[];
  onEmployeeSelect: (employeeId: string | null) => void;
  selectedEmployeeId: string | null;
}

export const EmployeeSearchFilter: React.FC<EmployeeSearchFilterProps> = ({
  employees,
  inspections,
  onEmployeeSelect,
  selectedEmployeeId,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);

  // Filter employees based on search term
  const filteredEmployees = employees.filter(employee =>
    employee.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    employee.role.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Get employee statistics
  const getEmployeeStats = (employeeId: string) => {
    const employeeInspections = inspections.filter(i => i.employee_id === employeeId);
    const totalInspections = employeeInspections.length;
    const inspectionsWithDefects = employeeInspections.filter(i => i.has_defects).length;
    
    // Get today's inspections
    const today = new Date().toISOString().split('T')[0];
    const todayInspections = employeeInspections.filter(inspection => {
      const inspectionDate = new Date(inspection.submitted_at).toISOString().split('T')[0];
      return inspectionDate === today;
    });

    return {
      totalInspections,
      inspectionsWithDefects,
      completedToday: todayInspections.length > 0,
      todayCount: todayInspections.length,
    };
  };

  const selectedEmployee = selectedEmployeeId 
    ? employees.find(e => e.id === selectedEmployeeId)
    : null;

  return (
    <div className="bg-white rounded-xl shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-slate-900 flex items-center">
          <User className="h-5 w-5 mr-2 text-blue-600" />
          Employee Search & Filter
        </h3>
        {selectedEmployeeId && (
          <button
            onClick={() => onEmployeeSelect(null)}
            className="text-sm text-slate-600 hover:text-slate-900 transition-colors"
          >
            Clear Filter
          </button>
        )}
      </div>

      {/* Search Input */}
      <div className="relative mb-4">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Search className="h-4 w-4 text-slate-400" />
        </div>
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setShowDropdown(true);
          }}
          onFocus={() => setShowDropdown(true)}
          className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          placeholder="Search employees by name or role..."
        />
        
        {/* Dropdown */}
        {showDropdown && searchTerm && (
          <div className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
            {filteredEmployees.length > 0 ? (
              filteredEmployees.map((employee) => {
                const stats = getEmployeeStats(employee.id);
                return (
                  <button
                    key={employee.id}
                    onClick={() => {
                      onEmployeeSelect(employee.id);
                      setSearchTerm(employee.full_name);
                      setShowDropdown(false);
                    }}
                    className="w-full text-left p-3 hover:bg-slate-50 border-b border-slate-100 last:border-b-0"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium text-slate-900">{employee.full_name}</div>
                        <div className="text-sm text-slate-600">{employee.role}</div>
                      </div>
                      <div className="flex items-center space-x-2">
                        {stats.completedToday ? (
                          <CheckCircle className="h-4 w-4 text-green-600" />
                        ) : (
                          <XCircle className="h-4 w-4 text-red-600" />
                        )}
                        <span className="text-xs text-slate-500">
                          {stats.totalInspections} checks
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="p-3 text-slate-500 text-center">
                No employees found matching "{searchTerm}"
              </div>
            )}
          </div>
        )}
      </div>

      {/* Selected Employee Details */}
      {selectedEmployee && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h4 className="font-semibold text-slate-900">{selectedEmployee.full_name}</h4>
              <p className="text-sm text-slate-600">{selectedEmployee.role}</p>
            </div>
            <div className="text-right">
              {(() => {
                const stats = getEmployeeStats(selectedEmployee.id);
                return (
                  <div className="space-y-1">
                    <div className="flex items-center space-x-1">
                      {stats.completedToday ? (
                        <CheckCircle className="h-4 w-4 text-green-600" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-600" />
                      )}
                      <span className="text-sm font-medium">
                        {stats.completedToday ? 'Completed Today' : 'Pending Today'}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500">
                      {stats.todayCount} check{stats.todayCount !== 1 ? 's' : ''} today
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
          
          {(() => {
            const stats = getEmployeeStats(selectedEmployee.id);
            return (
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <div className="text-lg font-bold text-slate-900">{stats.totalInspections}</div>
                  <div className="text-xs text-slate-600">Total Checks</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-red-600">{stats.inspectionsWithDefects}</div>
                  <div className="text-xs text-slate-600">With Defects</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-green-600">
                    {stats.totalInspections - stats.inspectionsWithDefects}
                  </div>
                  <div className="text-xs text-slate-600">Clean Checks</div>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Click outside to close dropdown */}
      {showDropdown && (
        <div
          className="fixed inset-0 z-5"
          onClick={() => setShowDropdown(false)}
        />
      )}
    </div>
  );
};