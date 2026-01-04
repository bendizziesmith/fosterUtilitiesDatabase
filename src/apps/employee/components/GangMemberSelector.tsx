import React, { useState, useEffect } from 'react';
import { Users, X, Plus, Search, UserPlus } from 'lucide-react';
import { supabase, Employee, GangOperative } from '../../../lib/supabase';

interface GangMemberSelectorProps {
  gangerId: string;
  weekEnding: string;
  selectedMembers: GangOperative[];
  onMembersChange: (members: GangOperative[]) => void;
}

export const GangMemberSelector: React.FC<GangMemberSelectorProps> = ({
  gangerId,
  weekEnding,
  selectedMembers,
  onMembersChange,
}) => {
  const [showSelector, setShowSelector] = useState(false);
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [availableEmployees, setAvailableEmployees] = useState<Employee[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [manualName, setManualName] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

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

  const saveGangMembership = async (operative: GangOperative) => {
    try {
      const membershipData = {
        week_ending: weekEnding,
        ganger_id: gangerId,
        operative_id: operative.is_manual ? null : operative.employee_id,
        operative_name: operative.is_manual ? operative.full_name : null,
        operative_role: operative.role,
        is_manual: operative.is_manual,
      };

      const { error } = await supabase
        .from('gang_membership')
        .insert(membershipData);

      if (error) throw error;
    } catch (error) {
      console.error('Error saving gang membership:', error);
      throw error;
    }
  };

  const deleteGangMembership = async (operative: GangOperative) => {
    try {
      let query = supabase
        .from('gang_membership')
        .delete()
        .eq('week_ending', weekEnding)
        .eq('ganger_id', gangerId);

      if (operative.is_manual) {
        query = query.eq('operative_name', operative.full_name).eq('is_manual', true);
      } else {
        query = query.eq('operative_id', operative.employee_id);
      }

      const { error } = await query;
      if (error) throw error;
    } catch (error) {
      console.error('Error deleting gang membership:', error);
      throw error;
    }
  };

  const handleAddEmployee = async (employee: Employee) => {
    if (selectedMembers.length >= 2) {
      alert('Maximum 2 additional operatives allowed (3 people total including ganger)');
      return;
    }

    if (selectedMembers.some(m => m.employee_id === employee.id)) {
      return;
    }

    setSaving(true);
    const operative: GangOperative = {
      id: employee.id,
      full_name: employee.full_name,
      role: employee.role,
      is_manual: false,
      employee_id: employee.id,
    };

    try {
      await saveGangMembership(operative);
      onMembersChange([...selectedMembers, operative]);
      setShowSelector(false);
      setSearchTerm('');
    } catch (error) {
      alert('Failed to add operative. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleAddManual = async () => {
    if (!manualName.trim()) {
      alert('Please enter a name');
      return;
    }

    if (selectedMembers.length >= 2) {
      alert('Maximum 2 additional operatives allowed (3 people total including ganger)');
      return;
    }

    if (selectedMembers.some(m => m.is_manual && m.full_name === manualName.trim())) {
      alert('An operative with this name already exists');
      return;
    }

    setSaving(true);
    const operative: GangOperative = {
      id: `manual-${Date.now()}`,
      full_name: manualName.trim(),
      role: 'Operative',
      is_manual: true,
    };

    try {
      await saveGangMembership(operative);
      onMembersChange([...selectedMembers, operative]);
      setShowManualEntry(false);
      setManualName('');
    } catch (error) {
      alert('Failed to add operative. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveMember = async (operative: GangOperative) => {
    try {
      await deleteGangMembership(operative);
      onMembersChange(selectedMembers.filter(m => m.id !== operative.id));
    } catch (error) {
      alert('Failed to remove operative. Please try again.');
    }
  };

  const filteredEmployees = availableEmployees.filter(emp =>
    !selectedMembers.some(m => m.employee_id === emp.id) &&
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
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowSelector(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Employee
              </button>
              <button
                onClick={() => setShowManualEntry(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded transition-colors"
              >
                <UserPlus className="h-3.5 w-3.5" />
                Manual Entry
              </button>
            </div>
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
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-slate-900">{member.full_name}</p>
                  {member.is_manual && (
                    <span className="text-xs px-2 py-0.5 rounded bg-emerald-100 text-emerald-700">
                      Manual
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500">{member.role}</p>
              </div>
              <button
                onClick={() => handleRemoveMember(member)}
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
            Working solo - add operatives from employees or manual entry
          </p>
        </div>
      )}

      {showSelector && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[600px] flex flex-col">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">Add Employee Operative</h3>
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
                      onClick={() => handleAddEmployee(employee)}
                      disabled={saving}
                      className="w-full px-4 py-3 text-left border border-slate-200 rounded-md hover:border-blue-400 hover:bg-blue-50 transition-colors mb-2 disabled:opacity-50"
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

      {showManualEntry && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Add Manual Operative</h3>
                <p className="text-xs text-slate-500 mt-1">For operatives without system accounts</p>
              </div>
              <button
                onClick={() => {
                  setShowManualEntry(false);
                  setManualName('');
                }}
                className="p-1 text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6">
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Operative Name
              </label>
              <input
                type="text"
                value={manualName}
                onChange={(e) => setManualName(e.target.value)}
                placeholder="Enter full name"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleAddManual();
                  }
                }}
              />
              <p className="text-xs text-slate-500 mt-2">
                This operative will be added to the gang for this week only
              </p>
            </div>

            <div className="px-6 py-4 border-t border-slate-200 flex gap-3">
              <button
                onClick={() => {
                  setShowManualEntry(false);
                  setManualName('');
                }}
                className="flex-1 px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddManual}
                disabled={!manualName.trim() || saving}
                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-md transition-colors disabled:bg-slate-400 disabled:cursor-not-allowed"
              >
                {saving ? 'Adding...' : 'Add Operative'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
