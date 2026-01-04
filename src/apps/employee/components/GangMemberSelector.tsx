import React, { useState, useEffect } from 'react';
import { Users, X, Plus, Search, UserPlus, AlertCircle } from 'lucide-react';
import { supabase, Employee, HavsWeekMember } from '../../../lib/supabase';

interface GangMemberSelectorProps {
  havsWeekId: string;
  gangerId: string;
  selectedMembers: HavsWeekMember[];
  onMembersChange: () => void;
  isSubmitted: boolean;
}

export const GangMemberSelector: React.FC<GangMemberSelectorProps> = ({
  havsWeekId,
  gangerId,
  selectedMembers,
  onMembersChange,
  isSubmitted,
}) => {
  const [showSelector, setShowSelector] = useState(false);
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [availableEmployees, setAvailableEmployees] = useState<Employee[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [manualName, setManualName] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (showSelector) {
      loadAvailableEmployees();
    }
  }, [showSelector, gangerId]);

  const loadAvailableEmployees = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from('employees')
        .select('*')
        .neq('id', gangerId)
        .order('full_name');

      if (error) throw error;

      setAvailableEmployees(data || []);
    } catch (err: any) {
      console.error('Error loading employees:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddEmployee = async (employee: Employee) => {
    const operativeCount = selectedMembers.filter(m => m.person_type === 'operative').length;
    if (operativeCount >= 2) {
      alert('Maximum 2 additional operatives allowed (3 people total including ganger)');
      return;
    }

    if (selectedMembers.some(m => m.employee_id === employee.id)) {
      alert('This employee is already in the gang');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const { error: insertError } = await supabase
        .from('havs_week_members')
        .insert({
          havs_week_id: havsWeekId,
          person_type: 'operative',
          employee_id: employee.id,
          manual_name: null,
          role: employee.role,
        });

      if (insertError) {
        console.error('Insert error:', insertError);
        throw insertError;
      }

      onMembersChange();
      setShowSelector(false);
      setSearchTerm('');
    } catch (err: any) {
      console.error('Failed to add employee operative:', err);
      setError(err.message || 'Failed to add operative');
      alert(`Failed to add operative: ${err.message || 'Unknown error'}`);
    } finally {
      setSaving(false);
    }
  };

  const handleAddManual = async () => {
    if (!manualName.trim()) {
      alert('Please enter a name');
      return;
    }

    const operativeCount = selectedMembers.filter(m => m.person_type === 'operative').length;
    if (operativeCount >= 2) {
      alert('Maximum 2 additional operatives allowed (3 people total including ganger)');
      return;
    }

    if (selectedMembers.some(m => m.manual_name === manualName.trim())) {
      alert('An operative with this name already exists');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const { error: insertError } = await supabase
        .from('havs_week_members')
        .insert({
          havs_week_id: havsWeekId,
          person_type: 'operative',
          employee_id: null,
          manual_name: manualName.trim(),
          role: 'Operative',
        });

      if (insertError) {
        console.error('Insert error:', insertError);
        throw insertError;
      }

      onMembersChange();
      setShowManualEntry(false);
      setManualName('');
    } catch (err: any) {
      console.error('Failed to add manual operative:', err);
      setError(err.message || 'Failed to add operative');
      alert(`Failed to add operative: ${err.message || 'Unknown error'}`);
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveMember = async (member: HavsWeekMember) => {
    if (member.person_type === 'ganger') {
      alert('Cannot remove the ganger from the gang');
      return;
    }

    if (!confirm(`Remove ${member.manual_name || member.employee?.full_name || 'this operative'} from the gang? This will delete all their HAVS data for this week.`)) {
      return;
    }

    setError(null);
    try {
      const { error: deleteError } = await supabase
        .from('havs_week_members')
        .delete()
        .eq('id', member.id);

      if (deleteError) {
        console.error('Delete error:', deleteError);
        throw deleteError;
      }

      onMembersChange();
    } catch (err: any) {
      console.error('Failed to remove operative:', err);
      setError(err.message || 'Failed to remove operative');
      alert(`Failed to remove operative: ${err.message || 'Unknown error'}`);
    }
  };

  const operativeMembers = selectedMembers.filter(m => m.person_type === 'operative');
  const filteredEmployees = availableEmployees.filter(emp =>
    !selectedMembers.some(m => m.employee_id === emp.id) &&
    emp.full_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const canAddMore = operativeMembers.length < 2 && !isSubmitted;

  return (
    <div className="bg-white border border-slate-200 rounded-lg">
      <div className="px-4 py-3 border-b border-slate-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-slate-600" />
            <h3 className="text-sm font-semibold text-slate-900">Gang Members</h3>
            <span className="text-xs text-slate-500">
              ({operativeMembers.length + 1}/3 people)
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

      {error && (
        <div className="mx-4 mt-4 px-3 py-2 bg-red-50 border border-red-200 rounded-md flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-red-600 flex-shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {operativeMembers.length > 0 && (
        <div className="p-4 space-y-2">
          {operativeMembers.map((member) => {
            const displayName = member.manual_name || member.employee?.full_name || 'Unknown';
            return (
              <div
                key={member.id}
                className="flex items-center justify-between px-3 py-2 bg-slate-50 border border-slate-200 rounded-md"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-slate-900">{displayName}</p>
                    {member.manual_name && (
                      <span className="text-xs px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 font-medium">
                        Manual
                      </span>
                    )}
                    <span className="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">
                      Operative
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">{member.role}</p>
                </div>
                {!isSubmitted && (
                  <button
                    onClick={() => handleRemoveMember(member)}
                    className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                    title="Remove from gang"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {operativeMembers.length === 0 && (
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
                  setError(null);
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
                      className="w-full px-4 py-3 text-left border border-slate-200 rounded-md hover:border-blue-400 hover:bg-blue-50 transition-colors mb-2 disabled:opacity-50 disabled:cursor-not-allowed"
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
                  setError(null);
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
                  setError(null);
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
