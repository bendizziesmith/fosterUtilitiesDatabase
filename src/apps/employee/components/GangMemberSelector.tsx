import React, { useState } from 'react';
import { Users, X, Plus, AlertCircle } from 'lucide-react';
import { supabase, HavsWeekMember } from '../../../lib/supabase';

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
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showInput, setShowInput] = useState(false);

  const operativeMembers = selectedMembers.filter(m => m.person_type === 'operative');
  const canAddMore = operativeMembers.length < 2 && !isSubmitted;

  const handleAddOperative = async () => {
    const trimmed = newName.trim();
    if (!trimmed) return;

    if (operativeMembers.length >= 2) {
      setError('Maximum 2 operatives allowed (3 people total including ganger)');
      return;
    }

    if (selectedMembers.some(m => m.manual_name?.toLowerCase() === trimmed.toLowerCase())) {
      setError('An operative with this name already exists');
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
          manual_name: trimmed,
          role: 'Operative',
        });

      if (insertError) throw insertError;

      onMembersChange();
      setNewName('');
      setShowInput(false);
    } catch (err: any) {
      console.error('Failed to add operative:', err);
      setError(err.message || 'Failed to add operative');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveOperative = async (member: HavsWeekMember) => {
    const name = member.manual_name || member.employee?.full_name || 'this operative';
    if (!confirm(`Remove ${name}? This will delete all their HAVS data for this week.`)) {
      return;
    }

    setError(null);
    try {
      const { error: deleteError } = await supabase
        .from('havs_week_members')
        .delete()
        .eq('id', member.id);

      if (deleteError) throw deleteError;
      onMembersChange();
    } catch (err: any) {
      console.error('Failed to remove operative:', err);
      setError(err.message || 'Failed to remove operative');
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-slate-500" />
          <h3 className="text-sm font-semibold text-slate-800">Operatives</h3>
          <span className="text-xs text-slate-400">
            {operativeMembers.length}/2
          </span>
        </div>
        {canAddMore && !showInput && (
          <button
            onClick={() => setShowInput(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-teal-700 hover:bg-teal-50 rounded-lg transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Operative
          </button>
        )}
      </div>

      {error && (
        <div className="mx-4 mt-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
          <AlertCircle className="h-3.5 w-3.5 text-red-500 flex-shrink-0" />
          <p className="text-xs text-red-600">{error}</p>
        </div>
      )}

      <div className="p-4">
        {operativeMembers.length === 0 && !showInput && (
          <p className="text-sm text-slate-400 text-center py-2">
            No operatives added -- working solo
          </p>
        )}

        {operativeMembers.length > 0 && (
          <div className="space-y-2 mb-3">
            {operativeMembers.map((member) => {
              const displayName = member.manual_name || member.employee?.full_name || 'Unknown';
              return (
                <div
                  key={member.id}
                  className="flex items-center justify-between px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-amber-100 flex items-center justify-center text-xs font-bold text-amber-700">
                      {displayName.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-sm font-medium text-slate-800">{displayName}</span>
                  </div>
                  {!isSubmitted && (
                    <button
                      onClick={() => handleRemoveOperative(member)}
                      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Remove operative"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {showInput && (
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Type operative name"
              className="flex-1 px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddOperative();
                if (e.key === 'Escape') {
                  setShowInput(false);
                  setNewName('');
                }
              }}
            />
            <button
              onClick={handleAddOperative}
              disabled={!newName.trim() || saving}
              className="px-4 py-2.5 text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition-colors disabled:bg-slate-300 disabled:cursor-not-allowed"
            >
              {saving ? 'Adding...' : 'Add'}
            </button>
            <button
              onClick={() => { setShowInput(false); setNewName(''); setError(null); }}
              className="p-2.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
