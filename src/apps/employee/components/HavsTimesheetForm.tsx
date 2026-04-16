import React, { useState, useEffect } from 'react';
import { Save, Send, HardHat, Clock, CheckCircle, AlertTriangle, Shield, FileText, X, Plus } from 'lucide-react';
import { supabase, Employee, HavsWeek, HavsWeekMember, HavsExposureEntry } from '../../../lib/supabase';
import { GangMemberSelector } from './GangMemberSelector';
import { StartNewWeekModal } from './StartNewWeekModal';
import { getEffectiveWeekEnding, getViewableWeeks, ViewableWeek } from '../../../lib/havsUtils';

interface HavsTimesheetFormProps {
  selectedEmployee: Employee;
  onBack: () => void;
}

interface EquipmentItem {
  name: string;
  category: 'CIVILS' | 'JOINTING' | 'OVERHEADS' | 'EARTH PIN DRIVER';
}

const EQUIPMENT_ITEMS: EquipmentItem[] = [
  { name: 'Petrol Cut - Off Saw', category: 'CIVILS' },
  { name: 'NRSWA Vibrating Plate', category: 'CIVILS' },
  { name: 'Hydraulic Breaker', category: 'CIVILS' },
  { name: 'Vibro - Tamper', category: 'CIVILS' },
  { name: 'Floor Saw', category: 'CIVILS' },
  { name: 'Trench Rammer', category: 'CIVILS' },
  { name: 'Electric / Petrol Breaker', category: 'CIVILS' },
];

const DAYS = [
  { key: 'monday', label: 'Mon', full: 'Monday' },
  { key: 'tuesday', label: 'Tue', full: 'Tuesday' },
  { key: 'wednesday', label: 'Wed', full: 'Wednesday' },
  { key: 'thursday', label: 'Thu', full: 'Thursday' },
  { key: 'friday', label: 'Fri', full: 'Friday' },
  { key: 'saturday', label: 'Sat', full: 'Saturday' },
  { key: 'sunday', label: 'Sun', full: 'Sunday' },
] as const;

type DayKey = typeof DAYS[number]['key'];

interface PersonExposureData {
  [equipmentName: string]: {
    [day in DayKey]: number;
  };
}

interface PersonState {
  member: HavsWeekMember;
  displayName: string;
  personType: 'ganger' | 'operative';
  exposure: PersonExposureData;
  totalMinutes: number;
  comments: string;
  actions: string;
}

function createEmptyExposure(): PersonExposureData {
  const exposure: PersonExposureData = {};
  EQUIPMENT_ITEMS.forEach(item => {
    exposure[item.name] = {
      monday: 0, tuesday: 0, wednesday: 0, thursday: 0,
      friday: 0, saturday: 0, sunday: 0,
    };
  });
  return exposure;
}

function calculatePersonTotal(exposure: PersonExposureData): number {
  let total = 0;
  Object.values(exposure).forEach(equipmentDays => {
    Object.values(equipmentDays).forEach(minutes => {
      total += minutes;
    });
  });
  return total;
}

export const HavsTimesheetForm: React.FC<HavsTimesheetFormProps> = ({
  selectedEmployee,
  onBack,
}) => {
  const [showWeekSelector, setShowWeekSelector] = useState(false);
  const [showSubmitConfirmation, setShowSubmitConfirmation] = useState(false);
  const [showStartNewWeekModal, setShowStartNewWeekModal] = useState(false);
  const [availableWeeks, setAvailableWeeks] = useState<ViewableWeek[]>([]);
  const [selectedWeek, setSelectedWeek] = useState<string | null>(null);
  const [havsWeek, setHavsWeek] = useState<HavsWeek | null>(null);
  const [allMembers, setAllMembers] = useState<HavsWeekMember[]>([]);
  const [peopleState, setPeopleState] = useState<PersonState[]>([]);

  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [weekNotFound, setWeekNotFound] = useState(false);

  useEffect(() => {
    const initializeForm = async () => {
      const weeks = await getViewableWeeks(2, selectedEmployee.id);
      setAvailableWeeks(weeks);
      const currentWeek = await getEffectiveWeekEnding();
      setSelectedWeek(currentWeek);
    };
    initializeForm();
  }, [selectedEmployee.id]);

  useEffect(() => {
    if (selectedWeek) {
      initializeWeekData(selectedWeek);
    }
  }, [selectedEmployee.id, selectedWeek]);

  const initializeWeekData = async (weekEnding: string) => {
    setIsLoading(true);
    setSaveError(null);
    setWeekNotFound(false);

    try {
      const week = await loadHavsWeek(weekEnding);
      if (!week) {
        setWeekNotFound(true);
        setHavsWeek(null);
        setAllMembers([]);
        setPeopleState([]);
        setIsLoading(false);
        return;
      }
      setHavsWeek(week);
      await loadAllMembersAndExposure(week.id);
    } catch (error) {
      console.error('Error initializing week data:', error);
      setSaveError('Failed to load data. Please refresh the page.');
    } finally {
      setIsLoading(false);
    }
  };

  const loadHavsWeek = async (weekEnding: string): Promise<HavsWeek | null> => {
    const { data, error } = await supabase
      .from('havs_weeks')
      .select('*')
      .eq('ganger_id', selectedEmployee.id)
      .eq('week_ending', weekEnding)
      .maybeSingle();
    if (error) throw error;
    return data;
  };

  const loadAllMembersAndExposure = async (weekId: string) => {
    const { data: members, error } = await supabase
      .from('havs_week_members')
      .select(`*, employee:employees(*), exposure_entries:havs_exposure_entries(*)`)
      .eq('havs_week_id', weekId)
      .order('person_type', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error loading members:', error);
      setSaveError('Failed to load gang members');
      return;
    }

    if (!members || members.length === 0) {
      setPeopleState([]);
      setAllMembers([]);
      return;
    }

    setAllMembers(members);

    const peopleData: PersonState[] = members.map(member => {
      const exposure = createEmptyExposure();
      if (member.exposure_entries) {
        member.exposure_entries.forEach((entry: HavsExposureEntry) => {
          if (exposure[entry.equipment_name]) {
            exposure[entry.equipment_name][entry.day_of_week as DayKey] = entry.minutes;
          }
        });
      }

      let displayName = 'Unknown';
      if (member.manual_name) {
        displayName = member.manual_name;
      } else if (member.employee && Array.isArray(member.employee) && member.employee[0]) {
        displayName = member.employee[0].full_name;
      } else if (member.employee && !Array.isArray(member.employee)) {
        displayName = member.employee.full_name;
      } else if (member.person_type === 'ganger') {
        displayName = selectedEmployee.full_name;
      }

      return {
        member,
        displayName,
        personType: member.person_type as 'ganger' | 'operative',
        exposure,
        totalMinutes: calculatePersonTotal(exposure),
        comments: member.comments || '',
        actions: member.actions || '',
      };
    });

    setPeopleState(peopleData);
    setLastSaved(new Date());
    setHasUnsavedChanges(false);
  };

  const handleWeekSelect = (weekEnding: string) => {
    if (hasUnsavedChanges) {
      if (!confirm('You have unsaved changes. Discard and switch weeks?')) return;
    }
    setSelectedWeek(weekEnding);
    setShowWeekSelector(false);
  };

  const updateMinutes = (personIndex: number, equipmentName: string, day: DayKey, value: number) => {
    const safeValue = Math.max(0, Math.round(value));
    setPeopleState(prev => {
      const updated = [...prev];
      const person = updated[personIndex];
      person.exposure[equipmentName][day] = safeValue;
      person.totalMinutes = calculatePersonTotal(person.exposure);
      updated[personIndex] = { ...person };
      return updated;
    });
    setHasUnsavedChanges(true);
  };

  const updateField = (personIndex: number, field: 'comments' | 'actions', value: string) => {
    setPeopleState(prev => {
      const updated = [...prev];
      updated[personIndex] = { ...updated[personIndex], [field]: value };
      return updated;
    });
    setHasUnsavedChanges(true);
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      for (const personState of peopleState) {
        await supabase
          .from('havs_week_members')
          .update({ comments: personState.comments, actions: personState.actions })
          .eq('id', personState.member.id);

        const entriesToUpsert: Array<Omit<HavsExposureEntry, 'id' | 'created_at' | 'updated_at'>> = [];
        Object.entries(personState.exposure).forEach(([equipmentName, days]) => {
          const equipment = EQUIPMENT_ITEMS.find(e => e.name === equipmentName);
          if (!equipment) return;
          Object.entries(days).forEach(([day, minutes]) => {
            if (minutes > 0) {
              entriesToUpsert.push({
                havs_week_member_id: personState.member.id,
                equipment_name: equipmentName,
                equipment_category: equipment.category,
                day_of_week: day as DayKey,
                minutes,
              });
            }
          });
        });

        const { data: existingEntries } = await supabase
          .from('havs_exposure_entries')
          .select('*')
          .eq('havs_week_member_id', personState.member.id);

        const existingMap = new Map(
          existingEntries?.map(e => [`${e.equipment_name}:${e.day_of_week}`, e]) || []
        );

        for (const entry of entriesToUpsert) {
          const key = `${entry.equipment_name}:${entry.day_of_week}`;
          const existing = existingMap.get(key);
          if (existing) {
            await supabase.from('havs_exposure_entries').update({ minutes: entry.minutes }).eq('id', existing.id);
          } else {
            await supabase.from('havs_exposure_entries').insert(entry);
          }
        }

        const currentKeys = new Set(entriesToUpsert.map(e => `${e.equipment_name}:${e.day_of_week}`));
        for (const [key, existing] of existingMap) {
          if (!currentKeys.has(key)) {
            await supabase.from('havs_exposure_entries').delete().eq('id', existing.id);
          }
        }
      }

      if (havsWeek) {
        await supabase.from('havs_weeks').update({ last_saved_at: new Date().toISOString() }).eq('id', havsWeek.id);
        setHavsWeek(prev => prev ? { ...prev, last_saved_at: new Date().toISOString() } : null);
      }

      setLastSaved(new Date());
      setHasUnsavedChanges(false);
    } catch (error) {
      console.error('Save error:', error);
      setSaveError('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleSubmitClick = () => {
    const anyZeroExposure = peopleState.some(p => p.totalMinutes === 0);
    if (anyZeroExposure) {
      alert('All gang members must have exposure time before submitting.');
      return;
    }
    if (hasUnsavedChanges) {
      alert('Please save your changes before submitting.');
      return;
    }
    setShowSubmitConfirmation(true);
  };

  const handleConfirmSubmit = async () => {
    setSubmitting(true);
    setShowSubmitConfirmation(false);
    try {
      if (hasUnsavedChanges) await handleSave();
      if (havsWeek) {
        const isFirstSubmit = havsWeek.status === 'draft';
        const { data, error } = await supabase.rpc('submit_havs_week', { week_id_param: havsWeek.id });
        if (error) throw new Error(error.message || 'Failed to submit');
        if (data && data.success === false) {
          alert(`Submission failed: ${data.error}`);
          return;
        }
        setHavsWeek(prev => prev ? {
          ...prev,
          status: 'submitted',
          submitted_at: new Date().toISOString(),
          revision_number: (prev.revision_number || 0) + 1
        } : null);

        const memberCount = data?.member_count || peopleState.length;
        const totalMinutes = data?.total_minutes || peopleState.reduce((sum, p) => sum + p.totalMinutes, 0);
        const totalHours = Math.floor(totalMinutes / 60);
        const remainingMinutes = totalMinutes % 60;

        if (isFirstSubmit) {
          alert(`HAVS Submitted Successfully!\n\n${memberCount} gang members\n${totalHours}h ${remainingMinutes}m total exposure\n\nThis record is now available for employer review.`);
        } else {
          alert(`Revision Created Successfully!\n\nRevision #${(havsWeek.revision_number || 0) + 1}\n${memberCount} gang members\n${totalHours}h ${remainingMinutes}m total exposure`);
        }
      }
      setHasUnsavedChanges(false);
    } catch (error: any) {
      console.error('Error submitting:', error);
      alert(`Failed to submit: ${error.message || 'Unknown error'}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleMembersChange = async () => {
    if (havsWeek) await loadAllMembersAndExposure(havsWeek.id);
  };

  const handleWeekCreated = async (weekEnding: string) => {
    setShowStartNewWeekModal(false);
    const updatedWeeks = await getViewableWeeks(2, selectedEmployee.id);
    setAvailableWeeks(updatedWeeks);
    setSelectedWeek(weekEnding);
  };

  const isSubmitted = havsWeek?.status === 'submitted';

  const groupedEquipment = EQUIPMENT_ITEMS.reduce((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {} as Record<string, EquipmentItem[]>);

  const formatWeekDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-center min-h-[300px]">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-3 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
            <p className="text-sm text-slate-500">Loading HAVS data...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      <WeekControlBar
        selectedWeek={selectedWeek}
        havsWeek={havsWeek}
        weekNotFound={weekNotFound}
        hasUnsavedChanges={hasUnsavedChanges}
        lastSaved={lastSaved}
        saveError={saveError}
        formatWeekDate={formatWeekDate}
        onViewOtherWeeks={() => setShowWeekSelector(true)}
        onStartNewWeek={() => setShowStartNewWeekModal(true)}
      />

      {weekNotFound && selectedWeek && (
        <div className="bg-white border border-slate-200 rounded-xl px-6 py-10 text-center">
          <div className="p-3 bg-slate-100 rounded-full inline-block mb-4">
            <HardHat className="h-8 w-8 text-slate-400" />
          </div>
          <h2 className="text-lg font-semibold text-slate-800 mb-2">No HAVS Week Found</h2>
          <p className="text-sm text-slate-500 mb-5 max-w-sm mx-auto">
            No record for week ending {formatWeekDate(selectedWeek)}.
            Start a new week or view other weeks.
          </p>
          <button
            onClick={() => setShowStartNewWeekModal(true)}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700 transition-colors"
          >
            <Plus size={16} />
            Start New HAVS Week
          </button>
        </div>
      )}

      {!weekNotFound && havsWeek && (
        <>
          {peopleState.length > 0 && (
            <GangStatusCard peopleState={peopleState} />
          )}

          <GangMemberSelector
            havsWeekId={havsWeek.id}
            gangerId={selectedEmployee.id}
            selectedMembers={allMembers}
            onMembersChange={handleMembersChange}
            isSubmitted={false}
          />

          {peopleState.map((personState, personIndex) => (
            <ExposureTable
              key={personState.member.id}
              personState={personState}
              personIndex={personIndex}
              isSubmitted={isSubmitted}
              groupedEquipment={groupedEquipment}
              updateMinutes={updateMinutes}
              updateField={updateField}
            />
          ))}

          {peopleState.length > 0 && (
            <SaveSubmitBar
              saving={saving}
              submitting={submitting}
              hasUnsavedChanges={hasUnsavedChanges}
              peopleCount={peopleState.length}
              onSave={handleSave}
              onSubmit={handleSubmitClick}
            />
          )}
        </>
      )}

      {showWeekSelector && (
        <WeekSelectorModal
          availableWeeks={availableWeeks}
          onSelect={handleWeekSelect}
          onClose={() => setShowWeekSelector(false)}
        />
      )}

      {showStartNewWeekModal && (
        <StartNewWeekModal
          gangerId={selectedEmployee.id}
          currentWeekEnding={selectedWeek}
          onClose={() => setShowStartNewWeekModal(false)}
          onWeekCreated={handleWeekCreated}
        />
      )}

      {showSubmitConfirmation && (
        <SubmitConfirmModal
          peopleState={peopleState}
          selectedWeek={selectedWeek}
          submitting={submitting}
          onConfirm={handleConfirmSubmit}
          onCancel={() => setShowSubmitConfirmation(false)}
        />
      )}
    </div>
  );
};

interface WeekControlBarProps {
  selectedWeek: string | null;
  havsWeek: HavsWeek | null;
  weekNotFound: boolean;
  hasUnsavedChanges: boolean;
  lastSaved: Date | null;
  saveError: string | null;
  formatWeekDate: (d: string) => string;
  onViewOtherWeeks: () => void;
  onStartNewWeek: () => void;
}

const WeekControlBar: React.FC<WeekControlBarProps> = ({
  selectedWeek,
  havsWeek,
  weekNotFound,
  hasUnsavedChanges,
  lastSaved,
  saveError,
  formatWeekDate,
  onViewOtherWeeks,
  onStartNewWeek,
}) => {
  const statusBadge = () => {
    if (weekNotFound) return null;
    if (!havsWeek) return null;
    if (havsWeek.status === 'submitted') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded text-xs font-medium">
          <Shield className="h-3 w-3" /> Submitted
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-xs font-medium">
        Draft
      </span>
    );
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl px-4 py-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2 bg-amber-50 border border-amber-200 rounded-lg flex-shrink-0">
            <HardHat className="h-5 w-5 text-amber-600" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-slate-500 uppercase tracking-wide">Week ending</span>
              <span className="text-sm font-bold text-slate-900">
                {selectedWeek ? formatWeekDate(selectedWeek) : '--'}
              </span>
              {statusBadge()}
              {havsWeek?.revision_number && havsWeek.revision_number > 0 && (
                <span className="text-xs text-slate-500">Rev #{havsWeek.revision_number}</span>
              )}
            </div>
            <div className="flex items-center gap-3 mt-0.5">
              {hasUnsavedChanges && (
                <span className="flex items-center gap-1 text-xs text-amber-600">
                  <AlertTriangle className="h-3 w-3" /> Unsaved
                </span>
              )}
              {!hasUnsavedChanges && lastSaved && !saveError && (
                <span className="flex items-center gap-1 text-xs text-slate-400">
                  <CheckCircle className="h-3 w-3 text-emerald-500" />
                  Saved {lastSaved.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
              {saveError && (
                <span className="flex items-center gap-1 text-xs text-red-600">
                  <AlertTriangle className="h-3 w-3" /> {saveError}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={onViewOtherWeeks}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-600 hover:text-slate-800 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors"
          >
            <FileText className="h-3.5 w-3.5" />
            Other Weeks
          </button>
          <button
            onClick={onStartNewWeek}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            New Week
          </button>
        </div>
      </div>
    </div>
  );
};

interface GangStatusCardProps {
  peopleState: PersonState[];
}

const GangStatusCard: React.FC<GangStatusCardProps> = ({ peopleState }) => {
  const totalAllMinutes = peopleState.reduce((s, p) => s + p.totalMinutes, 0);

  return (
    <div className="bg-white border border-slate-200 rounded-xl">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-teal-600" />
          <h3 className="text-sm font-semibold text-slate-800">Gang Status</h3>
        </div>
        <span className="text-xs font-semibold text-teal-700 bg-teal-50 px-2 py-0.5 rounded">
          {totalAllMinutes} min total
        </span>
      </div>
      <div className="p-4 space-y-2">
        {peopleState.map((person) => (
          <div key={person.member.id} className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white ${
                person.personType === 'ganger' ? 'bg-blue-500' : 'bg-amber-500'
              }`}>
                {person.displayName.charAt(0).toUpperCase()}
              </div>
              <span className="text-sm font-medium text-slate-800">{person.displayName}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase ${
                person.personType === 'ganger'
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-amber-100 text-amber-700'
              }`}>
                {person.personType}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold tabular-nums text-amber-600">
                {person.totalMinutes} min
              </span>
              {person.totalMinutes === 0 ? (
                <span className="w-2 h-2 rounded-full bg-slate-300" />
              ) : (
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

interface ExposureTableProps {
  personState: PersonState;
  personIndex: number;
  isSubmitted?: boolean;
  groupedEquipment: Record<string, EquipmentItem[]>;
  updateMinutes: (personIndex: number, equipmentName: string, day: DayKey, value: number) => void;
  updateField: (personIndex: number, field: 'comments' | 'actions', value: string) => void;
}

const ExposureTable: React.FC<ExposureTableProps> = ({
  personState,
  personIndex,
  isSubmitted,
  groupedEquipment,
  updateMinutes,
  updateField,
}) => (
  <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
    <div className="px-5 py-3 bg-slate-800 border-b border-slate-700">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-white uppercase tracking-wide">
              {personState.displayName}
            </h2>
            <span className={`text-xs px-2 py-0.5 rounded font-medium ${
              personState.personType === 'ganger' ? 'bg-blue-500 text-white' : 'bg-amber-500 text-white'
            }`}>
              {personState.personType === 'ganger' ? 'Ganger' : 'Operative'}
            </span>
            {isSubmitted && (
              <span className="text-xs px-2 py-0.5 rounded bg-emerald-500 text-white flex items-center gap-1 font-medium">
                <Shield className="h-3 w-3" /> Submitted
              </span>
            )}
          </div>
          <p className="text-xs text-slate-300 mt-1">
            Total: {personState.totalMinutes} minutes
            {personState.totalMinutes > 0 && (
              <span> ({(personState.totalMinutes / 60).toFixed(1)}h)</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-300">
          <Clock className="h-3.5 w-3.5" />
          <span>Equipment Exposure (Minutes)</span>
        </div>
      </div>
    </div>

    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="bg-slate-100">
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wide border-b-2 border-slate-300 w-64">
              Equipment
            </th>
            {DAYS.map((day) => (
              <th key={day.key} className="px-2 py-3 text-center text-xs font-semibold text-slate-700 uppercase tracking-wide border-b-2 border-slate-300 w-20">
                <span className="hidden sm:inline">{day.full}</span>
                <span className="sm:hidden">{day.label}</span>
              </th>
            ))}
            <th className="px-4 py-3 text-center text-xs font-semibold text-slate-900 uppercase tracking-wide border-b-2 border-slate-300 bg-amber-50 w-24">
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(groupedEquipment).map(([category, items]) => (
            <React.Fragment key={category}>
              <tr>
                <td colSpan={9} className="px-4 py-2 text-xs font-bold text-slate-700 uppercase tracking-wider bg-slate-200 border-y border-slate-300">
                  {category}
                </td>
              </tr>
              {items.map((item, idx) => {
                const equipmentData = personState.exposure[item.name];
                const rowTotal = equipmentData ? Object.values(equipmentData).reduce((sum, val) => sum + val, 0) : 0;
                return (
                  <tr key={item.name} className={`${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'} hover:bg-blue-50/50 transition-colors`}>
                    <td className="px-4 py-2 text-sm text-slate-900 font-medium border-b border-slate-200">{item.name}</td>
                    {DAYS.map((day) => {
                      const currentValue = equipmentData ? equipmentData[day.key] : 0;
                      return (
                        <td key={day.key} className="px-1 py-1 border-b border-slate-200">
                          <input
                            type="text"
                            inputMode="numeric"
                            value={currentValue === 0 ? '' : currentValue.toString()}
                            onChange={(e) => {
                              const raw = e.target.value.replace(/[^0-9]/g, '');
                              updateMinutes(personIndex, item.name, day.key, raw === '' ? 0 : parseInt(raw, 10));
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'ArrowUp') { e.preventDefault(); updateMinutes(personIndex, item.name, day.key, currentValue + 1); }
                              else if (e.key === 'ArrowDown') { e.preventDefault(); updateMinutes(personIndex, item.name, day.key, Math.max(0, currentValue - 1)); }
                              else if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); }
                            }}
                            onFocus={(e) => e.target.select()}
                            placeholder="0"
                            className="w-full px-2 py-2 text-center text-sm border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none bg-white hover:border-slate-300"
                          />
                        </td>
                      );
                    })}
                    <td className={`px-4 py-2 text-center text-sm font-semibold border-b border-slate-200 ${rowTotal > 0 ? 'text-amber-700 bg-amber-50' : 'text-slate-400 bg-slate-50'}`}>
                      {rowTotal}
                    </td>
                  </tr>
                );
              })}
            </React.Fragment>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-slate-800">
            <td className="px-4 py-3 text-sm font-bold text-white uppercase tracking-wide">Weekly Total</td>
            {DAYS.map((day) => {
              const dayTotal = Object.values(personState.exposure).reduce((sum, ed) => sum + ed[day.key], 0);
              return (
                <td key={day.key} className="px-2 py-3 text-center text-sm font-semibold text-slate-300">
                  {dayTotal > 0 ? dayTotal : '-'}
                </td>
              );
            })}
            <td className="px-4 py-3 text-center text-base font-bold text-amber-400 bg-slate-900">
              {personState.totalMinutes}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>

    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 border-t border-slate-200">
      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-2">Comments</label>
        <textarea
          value={personState.comments}
          onChange={(e) => updateField(personIndex, 'comments', e.target.value)}
          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
          rows={3}
          placeholder="Equipment usage notes, conditions, etc."
        />
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-2">Actions Required</label>
        <textarea
          value={personState.actions}
          onChange={(e) => updateField(personIndex, 'actions', e.target.value)}
          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
          rows={3}
          placeholder="Record any actions taken or required..."
        />
      </div>
    </div>
  </div>
);

interface SaveSubmitBarProps {
  saving: boolean;
  submitting: boolean;
  hasUnsavedChanges: boolean;
  peopleCount: number;
  onSave: () => void;
  onSubmit: () => void;
}

const SaveSubmitBar: React.FC<SaveSubmitBarProps> = ({
  saving, submitting, hasUnsavedChanges, peopleCount, onSave, onSubmit,
}) => (
  <div className="bg-white border border-slate-200 rounded-xl p-4">
    <div className="flex flex-col sm:flex-row gap-3">
      <button
        onClick={onSave}
        disabled={saving || !hasUnsavedChanges}
        className="flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:bg-slate-300 disabled:cursor-not-allowed"
      >
        {saving ? (
          <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Saving...</>
        ) : (
          <><Save className="h-4 w-4" /> {hasUnsavedChanges ? 'Save Changes' : 'All Saved'}</>
        )}
      </button>
      <button
        onClick={onSubmit}
        disabled={submitting || hasUnsavedChanges}
        className="flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:bg-slate-400 disabled:cursor-not-allowed"
      >
        {submitting ? (
          <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Submitting...</>
        ) : (
          <><Send className="h-4 w-4" /> Submit {peopleCount > 1 ? `All ${peopleCount}` : ''} for Review</>
        )}
      </button>
    </div>
    {hasUnsavedChanges && (
      <p className="text-xs text-red-500 mt-2 text-center">Save changes before submitting</p>
    )}
  </div>
);

interface WeekSelectorModalProps {
  availableWeeks: ViewableWeek[];
  onSelect: (week: string) => void;
  onClose: () => void;
}

const WeekSelectorModal: React.FC<WeekSelectorModalProps> = ({ availableWeeks, onSelect, onClose }) => (
  <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
    <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
      <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
        <h3 className="text-base font-semibold text-slate-900">View Week</h3>
        <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 transition-colors">
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="p-4 space-y-2 max-h-80 overflow-y-auto">
        {availableWeeks.map((week) => (
          <button
            key={week.date}
            onClick={() => onSelect(week.date)}
            className={`w-full px-4 py-3 text-left border rounded-lg transition-colors ${
              week.hasData
                ? week.status === 'submitted'
                  ? 'border-emerald-300 bg-emerald-50 hover:bg-emerald-100'
                  : 'border-amber-300 bg-amber-50 hover:bg-amber-100'
                : week.isCurrent
                  ? 'border-blue-300 bg-blue-50'
                  : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
            }`}
          >
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-slate-900">{week.label}</p>
              <div className="flex items-center gap-2">
                {week.hasData && week.status === 'submitted' && (
                  <span className="text-xs px-2 py-0.5 bg-emerald-600 text-white rounded">Submitted</span>
                )}
                {week.hasData && week.status === 'draft' && (
                  <span className="text-xs px-2 py-0.5 bg-amber-600 text-white rounded">Draft</span>
                )}
                {week.isCurrent && (
                  <span className="text-xs px-2 py-0.5 bg-blue-600 text-white rounded">Current</span>
                )}
              </div>
            </div>
            <p className="text-xs text-slate-500">
              Week ending: {new Date(week.date).toLocaleDateString('en-GB')}
              {!week.hasData && ' - No record'}
            </p>
          </button>
        ))}
      </div>
    </div>
  </div>
);

interface SubmitConfirmModalProps {
  peopleState: PersonState[];
  selectedWeek: string | null;
  submitting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const SubmitConfirmModal: React.FC<SubmitConfirmModalProps> = ({
  peopleState, selectedWeek, submitting, onConfirm, onCancel,
}) => (
  <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
    <div className="bg-white rounded-xl shadow-xl max-w-lg w-full">
      <div className="px-6 py-4 border-b border-slate-200 bg-red-50 rounded-t-xl">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-red-100 rounded-full">
            <AlertTriangle className="h-5 w-5 text-red-600" />
          </div>
          <h3 className="text-base font-semibold text-slate-900">Confirm Submission</h3>
        </div>
      </div>

      <div className="p-6">
        <p className="text-sm text-slate-700 mb-4">
          Submitting HAVs exposure for {peopleState.length} {peopleState.length === 1 ? 'person' : 'people'} for compliance review.
        </p>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
          <div className="flex items-start gap-2">
            <Shield className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-blue-800">
              Creates an audited revision snapshot for HSE compliance. You can edit later; changes create a new revision.
            </p>
          </div>
        </div>

        <div className="bg-slate-50 rounded-lg p-3 mb-5 max-h-48 overflow-y-auto">
          <p className="text-xs text-slate-500 uppercase tracking-wide mb-2">Summary</p>
          <div className="space-y-2">
            {peopleState.map((ps) => (
              <div key={ps.member.id} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-slate-800">{ps.displayName}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                    ps.personType === 'ganger' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'
                  }`}>
                    {ps.personType}
                  </span>
                </div>
                <span className="font-semibold text-amber-600">{ps.totalMinutes} min</span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 px-4 py-3 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={submitting}
            className="flex-1 px-4 py-3 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            {submitting ? (
              <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Submitting...</>
            ) : (
              <><Send className="h-4 w-4" /> Submit</>
            )}
          </button>
        </div>
      </div>
    </div>
  </div>
);
