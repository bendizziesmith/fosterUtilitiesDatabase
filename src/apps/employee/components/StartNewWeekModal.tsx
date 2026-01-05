import React, { useState, useEffect } from 'react';
import { X, AlertTriangle, Calendar, Users, Check } from 'lucide-react';
import { supabase, HavsWeekMember } from '../../../lib/supabase';
import { getEffectiveWeekEnding, getStartableWeeks, StartableWeek, formatDisplayDate } from '../../../lib/havsUtils';

interface StartNewWeekModalProps {
  gangerId: string;
  currentWeekEnding: string | null;
  onClose: () => void;
  onWeekCreated: (weekEnding: string) => void;
}

export const StartNewWeekModal: React.FC<StartNewWeekModalProps> = ({
  gangerId,
  currentWeekEnding,
  onClose,
  onWeekCreated,
}) => {
  const [selectedWeekEnding, setSelectedWeekEnding] = useState<string>('');
  const [weekOptions, setWeekOptions] = useState<StartableWeek[]>([]);
  const [previousMembers, setPreviousMembers] = useState<HavsWeekMember[]>([]);
  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<string>>(new Set());
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoadingMembers, setIsLoadingMembers] = useState(true);
  const [isLoadingWeeks, setIsLoadingWeeks] = useState(true);

  useEffect(() => {
    const initialize = async () => {
      setIsLoadingWeeks(true);
      const options = await getStartableWeeks(gangerId);
      setWeekOptions(options);

      const defaultWeek = await getEffectiveWeekEnding();
      const availableDefault = options.find(o => !o.isDisabled);
      setSelectedWeekEnding(availableDefault?.date || defaultWeek);
      setIsLoadingWeeks(false);

      await loadPreviousMembers();
    };
    initialize();
  }, [gangerId, currentWeekEnding]);

  const loadPreviousMembers = async () => {
    setIsLoadingMembers(true);
    try {
      if (!currentWeekEnding) {
        setPreviousMembers([]);
        setIsLoadingMembers(false);
        return;
      }

      const { data: previousWeek } = await supabase
        .from('havs_weeks')
        .select('id')
        .eq('ganger_id', gangerId)
        .eq('week_ending', currentWeekEnding)
        .maybeSingle();

      if (!previousWeek) {
        setPreviousMembers([]);
        setIsLoadingMembers(false);
        return;
      }

      const { data: members, error } = await supabase
        .from('havs_week_members')
        .select(`
          *,
          employee:employees(*)
        `)
        .eq('havs_week_id', previousWeek.id)
        .order('person_type', { ascending: false })
        .order('created_at', { ascending: true });

      if (error) throw error;

      const operatives = (members || []).filter(m => m.person_type === 'operative');
      setPreviousMembers(operatives);

      const memberIds = new Set(operatives.map(m => m.id));
      setSelectedMemberIds(memberIds);
    } catch (error) {
      console.error('Error loading previous members:', error);
      setPreviousMembers([]);
    } finally {
      setIsLoadingMembers(false);
    }
  };

  const toggleMember = (memberId: string) => {
    const newSelected = new Set(selectedMemberIds);
    if (newSelected.has(memberId)) {
      newSelected.delete(memberId);
    } else {
      newSelected.add(memberId);
    }
    setSelectedMemberIds(newSelected);
  };

  const handleCreateWeek = async () => {
    if (!selectedWeekEnding) {
      setError('Please select a week ending date');
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        throw new Error('Not authenticated');
      }

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/start-havs-week`;

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${sessionData.session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ganger_id: gangerId,
          week_ending: selectedWeekEnding,
          carry_over_member_ids: Array.from(selectedMemberIds),
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        if (response.status === 409) {
          throw new Error('A HAVS week already exists for this date. Please select a different week ending.');
        }
        throw new Error(result.error || 'Failed to create new week');
      }

      onWeekCreated(selectedWeekEnding);
    } catch (error) {
      console.error('Error creating week:', error);
      setError(error instanceof Error ? error.message : 'Failed to create new week');
    } finally {
      setIsCreating(false);
    }
  };

  const getMemberDisplayName = (member: HavsWeekMember): string => {
    if (member.employee) {
      return member.employee.full_name;
    }
    return member.manual_name || 'Unknown';
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900">Start New HAVS Week</h2>
          <button
            onClick={onClose}
            disabled={isCreating}
            className="text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
          >
            <X size={24} />
          </button>
        </div>

        <div className="px-6 py-6 space-y-6">
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
              <Calendar size={18} />
              Select week ending
            </label>
            {isLoadingWeeks ? (
              <div className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-500">
                Loading available weeks...
              </div>
            ) : (
              <select
                value={selectedWeekEnding}
                onChange={(e) => setSelectedWeekEnding(e.target.value)}
                disabled={isCreating}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
              >
                {weekOptions.map((option) => (
                  <option
                    key={option.date}
                    value={option.date}
                    disabled={option.isDisabled}
                  >
                    {option.alreadyExists ? '(Already exists) ' : ''}{option.label}
                  </option>
                ))}
              </select>
            )}
            <p className="mt-2 text-sm text-gray-600">
              Submissions made on Monday or Tuesday apply to the previous week.
            </p>
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-3">
              <Users size={18} />
              Carry over gang members (data will reset)
            </label>

            {isLoadingMembers ? (
              <div className="text-sm text-gray-500 py-4">Loading previous gang members...</div>
            ) : previousMembers.length === 0 ? (
              <div className="text-sm text-gray-500 py-4 bg-gray-50 rounded-lg border border-gray-200 px-4">
                No previous gang members found. You can add operatives after creating the week.
              </div>
            ) : (
              <div className="space-y-2 bg-gray-50 rounded-lg border border-gray-200 p-4">
                {previousMembers.map((member) => (
                  <label
                    key={member.id}
                    className="flex items-start gap-3 p-3 hover:bg-white rounded-md cursor-pointer transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={selectedMemberIds.has(member.id)}
                      onChange={() => toggleMember(member.id)}
                      disabled={isCreating}
                      className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded disabled:opacity-50"
                    />
                    <div className="flex-1">
                      <div className="font-medium text-gray-900">
                        {getMemberDisplayName(member)}
                      </div>
                      <div className="text-sm text-gray-600">{member.role}</div>
                    </div>
                    <Check size={18} className={`text-green-600 ${selectedMemberIds.has(member.id) ? 'opacity-100' : 'opacity-0'}`} />
                  </label>
                ))}
              </div>
            )}

            <p className="mt-3 text-sm text-gray-600">
              Only people will be copied. All HAVS exposure data will reset to zero.
            </p>
          </div>

          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle size={20} className="text-red-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-red-800">
                <p className="font-medium mb-1">This will create a brand new HAVS week.</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>All exposure values will start at 0 minutes</li>
                  <li>No equipment data will be carried over</li>
                  <li>Previous weeks remain unchanged for audit purposes</li>
                </ul>
              </div>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}
        </div>

        <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-6 py-4 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            disabled={isCreating}
            className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={handleCreateWeek}
            disabled={isCreating || !selectedWeekEnding}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isCreating ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                Creating...
              </>
            ) : (
              'Create New Week'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
