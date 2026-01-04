import React, { useState, useEffect } from 'react';
import { Users, X, Plus, Search } from 'lucide-react';
import { supabase, Employee } from '../../../lib/supabase';

interface GangMemberSelectorProps {
  gangerId: string;
  selectedMembers: Employee[];
  onMembersChange: (members: Employee[]) => void;
}

export const GangMemberSelector: React.FC<GangMemberSelectorProps> = ({
  gangerId,
  selectedMembers,
  onMembersChange,
}) => {
  const [showSelector, setShowSelector] = useState(false);
  const [availableEmployees, setAvailableEmployees] = useState<Employee[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (showSelector) {
      loadAvailableEmployees();
    }
  }, [showSelector, gangerId]);

  const loadAvailableEmployees = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('employees')
        .select('*')
        .neq('id', gangerId)
        .order('full_name');

      if (error) throw error;

      setAvailableEmployees(data || []);
    } catch (error) {
      console.error('Error loading employees:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddMember = (employee: Employee) => {
    if (selectedMembers.length >= 2) {
      alert('Maximum 2 additional operatives allowed (3 people total including ganger)');
      return;
    }

    if (selectedMembers.some(m => m.id === employee.id)) {
      return;
    }

    onMembersChange([...selectedMembers, employee]);
    setShowSelector(false);
    setSearchTerm('');
  };

  const handleRemoveMember = (employeeId: string) => {
    onMembersChange(selectedMembers.filter(m => m.id !== employeeId));
  };

  const filteredEmployees = availableEmployees.filter(emp =>
    !selectedMembers.some(m => m.id === emp.id) &&
    emp.full_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const canAddMore = selectedMembers.length < 2;

  return (
    <div className="bg-white border border-slate-200 rounded-lg">
      <div className="px-4 py-3 border-b border-slate-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-slate-600" />
            <h3 className="text-sm font-semibold text-slate-900">Gang Members</h3>
            <span className="text-xs text-slate-500">
              ({selectedMembers.length + 1}/3 people)
            </span>
          </div>
          {canAddMore && (
            <button
              onClick={() => setShowSelector(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Operative
            </button>
          )}
        </div>
      </div>

      {selectedMembers.length > 0 && (
        <div className="p-4 space-y-2">
          {selectedMembers.map((member) => (
            <div
              key={member.id}
              className="flex items-center justify-between px-3 py-2 bg-slate-50 border border-slate-200 rounded-md"
            >
              <div>
                <p className="text-sm font-medium text-slate-900">{member.full_name}</p>
                <p className="text-xs text-slate-500">{member.role}</p>
              </div>
              <button
                onClick={() => handleRemoveMember(member.id)}
                className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                title="Remove from gang"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {selectedMembers.length === 0 && (
        <div className="p-4">
          <p className="text-sm text-slate-500 text-center">
            Working solo - click "Add Operative" to add gang members
          </p>
        </div>
      )}

      {showSelector && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[600px] flex flex-col">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">Add Operative</h3>
              <button
                onClick={() => {
                  setShowSelector(false);
                  setSearchTerm('');
                }}
                className="p-1 text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-4 border-b border-slate-200">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search employees..."
                  className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  autoFocus
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="w-6 h-6 border-3 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
                </div>
              ) : filteredEmployees.length === 0 ? (
                <div className="py-12 text-center">
                  <p className="text-sm text-slate-500">No employees found</p>
                </div>
              ) : (
                <div className="p-2">
                  {filteredEmployees.map((employee) => (
                    <button
                      key={employee.id}
                      onClick={() => handleAddMember(employee)}
                      className="w-full px-4 py-3 text-left border border-slate-200 rounded-md hover:border-blue-400 hover:bg-blue-50 transition-colors mb-2"
                    >
                      <p className="text-sm font-medium text-slate-900">{employee.full_name}</p>
                      <p className="text-xs text-slate-500">{employee.role}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
