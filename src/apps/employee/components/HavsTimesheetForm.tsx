import React, { useState, useEffect } from 'react';
import { Save, Send, ArrowLeft, HardHat, Clock, CheckCircle, AlertTriangle, Shield, FileText, X } from 'lucide-react';
import { supabase, Employee, HavsWeek, HavsWeekMember, HavsExposureEntry } from '../../../lib/supabase';
import { GangMemberSelector } from './GangMemberSelector';

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

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function getCurrentWeekEndingWithGracePeriod(): Promise<string> {
  try {
    const { data, error } = await supabase.rpc('get_havs_week_ending', {
      reference_date: formatLocalDate(new Date())
    });
    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error getting week ending:', error);
    const today = new Date();
    const dayOfWeek = today.getDay();
    const daysUntilSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
    const sunday = new Date(today);
    sunday.setDate(today.getDate() + daysUntilSunday);
    return formatLocalDate(sunday);
  }
}

function createEmptyExposure(): PersonExposureData {
  const exposure: PersonExposureData = {};
  EQUIPMENT_ITEMS.forEach(item => {
    exposure[item.name] = {
      monday: 0,
      tuesday: 0,
      wednesday: 0,
      thursday: 0,
      friday: 0,
      saturday: 0,
      sunday: 0,
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
  const [availableWeeks, setAvailableWeeks] = useState<string[]>([]);
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

  useEffect(() => {
    const initializeForm = async () => {
      await generateAvailableWeeks();
      const currentWeek = await getCurrentWeekEndingWithGracePeriod();
      setSelectedWeek(currentWeek);
    };
    initializeForm();
  }, []);

  useEffect(() => {
    if (selectedWeek) {
      initializeWeekData(selectedWeek);
    }
  }, [selectedEmployee.id, selectedWeek]);

  const generateAvailableWeeks = () => {
    const weeks: string[] = [];
    const today = new Date();
    const dayOfWeek = today.getDay();
    const daysUntilSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;

    for (let i = 0; i < 8; i++) {
      const sunday = new Date(today);
      sunday.setDate(today.getDate() + daysUntilSunday + (7 * i));
      weeks.push(formatLocalDate(sunday));
    }
    setAvailableWeeks(weeks);
  };

  const initializeWeekData = async (weekEnding: string) => {
    setIsLoading(true);
    setSaveError(null);

    try {
      const week = await loadOrCreateHavsWeek(weekEnding);
      setHavsWeek(week);

      await ensureGangerMemberExists(week.id);

      await loadAllMembersAndExposure(week.id);
    } catch (error) {
      console.error('Error initializing week data:', error);
      setSaveError('Failed to load data. Please refresh the page.');
    } finally {
      setIsLoading(false);
    }
  };

  const loadOrCreateHavsWeek = async (weekEnding: string): Promise<HavsWeek> => {
    const { data, error } = await supabase
      .from('havs_weeks')
      .select('*')
      .eq('ganger_id', selectedEmployee.id)
      .eq('week_ending', weekEnding)
      .maybeSingle();

    if (error) throw error;

    if (data) {
      return data;
    }

    const { data: newWeek, error: insertError } = await supabase
      .from('havs_weeks')
      .insert({
        ganger_id: selectedEmployee.id,
        week_ending: weekEnding,
        status: 'draft',
      })
      .select()
      .single();

    if (insertError) throw insertError;
    return newWeek;
  };

  const ensureGangerMemberExists = async (weekId: string) => {
    const { data: existing } = await supabase
      .from('havs_week_members')
      .select('id')
      .eq('havs_week_id', weekId)
      .eq('person_type', 'ganger')
      .eq('employee_id', selectedEmployee.id)
      .maybeSingle();

    if (!existing) {
      await supabase
        .from('havs_week_members')
        .insert({
          havs_week_id: weekId,
          person_type: 'ganger',
          employee_id: selectedEmployee.id,
          manual_name: null,
          role: selectedEmployee.role,
        });
    }
  };

  const loadAllMembersAndExposure = async (weekId: string) => {
    const { data: members, error } = await supabase
      .from('havs_week_members')
      .select(`
        *,
        employee:employees(*),
        exposure_entries:havs_exposure_entries(*)
      `)
      .eq('havs_week_id', weekId)
      .order('person_type', { ascending: false })
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
      if (!confirm('You have unsaved changes. Discard and switch weeks?')) {
        return;
      }
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
      updated[personIndex] = {
        ...updated[personIndex],
        [field]: value,
      };
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
          .update({
            comments: personState.comments,
            actions: personState.actions,
          })
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
            await supabase
              .from('havs_exposure_entries')
              .update({ minutes: entry.minutes })
              .eq('id', existing.id);
          } else {
            await supabase
              .from('havs_exposure_entries')
              .insert(entry);
          }
        }

        const currentKeys = new Set(entriesToUpsert.map(e => `${e.equipment_name}:${e.day_of_week}`));
        for (const [key, existing] of existingMap) {
          if (!currentKeys.has(key)) {
            await supabase
              .from('havs_exposure_entries')
              .delete()
              .eq('id', existing.id);
          }
        }
      }

      if (havsWeek) {
        await supabase
          .from('havs_weeks')
          .update({
            last_saved_at: new Date().toISOString(),
          })
          .eq('id', havsWeek.id);

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
      if (hasUnsavedChanges) {
        await handleSave();
      }

      if (havsWeek) {
        const isFirstSubmit = havsWeek.status === 'draft';

        const { data, error } = await supabase.rpc('submit_havs_week', {
          week_id_param: havsWeek.id
        });

        if (error) {
          throw error;
        }

        if (data && !data.success) {
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
        const totalMinutes = data?.total_minutes || 0;
        const totalHours = Math.floor(totalMinutes / 60);
        const remainingMinutes = totalMinutes % 60;

        if (isFirstSubmit) {
          alert(`✅ HAVS Submitted Successfully!\n\n${memberCount} gang members\n${totalHours}h ${remainingMinutes}m total exposure\n\nThis record is now available for employer review. You can still edit if needed; changes create a new revision for audit.`);
        } else {
          alert(`✅ Revision Created Successfully!\n\nRevision #${(havsWeek.revision_number || 0) + 1}\n${memberCount} gang members\n${totalHours}h ${remainingMinutes}m total exposure\n\nChanges saved with new audit revision.`);
        }
      }

      setHasUnsavedChanges(false);
    } catch (error) {
      console.error('Error submitting:', error);
      alert('Failed to submit. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleMembersChange = async () => {
    if (havsWeek) {
      await loadAllMembersAndExposure(havsWeek.id);
    }
  };

  const isSubmitted = havsWeek?.status === 'submitted';

  const groupedEquipment = EQUIPMENT_ITEMS.reduce((acc, item) => {
    if (!acc[item.category]) {
      acc[item.category] = [];
    }
    acc[item.category].push(item);
    return acc;
  }, {} as Record<string, EquipmentItem[]>);

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="bg-white border border-slate-200 rounded-lg">
          <div className="px-6 py-4 border-b border-slate-200">
            <div className="flex items-center gap-4">
              <button
                onClick={onBack}
                className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-md transition-colors"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-50 rounded-lg border border-amber-200">
                  <HardHat className="h-6 w-6 text-amber-600" />
                </div>
                <div>
                  <h1 className="text-lg font-semibold text-slate-900">HAVs Exposure Record</h1>
                  <p className="text-xs text-slate-500">Loading gang and timesheet data...</p>
                </div>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-3 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
              <p className="text-sm text-slate-500">Preparing timesheet...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="bg-white border border-slate-200 rounded-lg">
        <div className="px-6 py-4 border-b border-slate-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={onBack}
                className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-md transition-colors"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-50 rounded-lg border border-amber-200">
                  <HardHat className="h-6 w-6 text-amber-600" />
                </div>
                <div>
                  <h1 className="text-lg font-semibold text-slate-900">HAVs Exposure Record</h1>
                  <p className="text-sm text-slate-500">Hand Arm Vibration Syndrome Timesheet - Gang Entry</p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-4">
              {hasUnsavedChanges && (
                <div className="flex items-center gap-2 text-sm text-amber-600">
                  <AlertTriangle className="h-4 w-4" />
                  <span>Unsaved changes</span>
                </div>
              )}
              {!hasUnsavedChanges && lastSaved && (
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <CheckCircle className="h-4 w-4 text-emerald-500" />
                  <span>Saved {lastSaved.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              )}
              {saveError && (
                <div className="flex items-center gap-2 text-sm text-red-600">
                  <AlertTriangle className="h-4 w-4" />
                  <span>{saveError}</span>
                </div>
              )}
              {isSubmitted && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-md">
                  <Shield className="h-4 w-4 text-emerald-600" />
                  <span className="text-sm font-medium text-emerald-700">Submitted</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-b border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Week Ending</p>
              <button
                type="button"
                onClick={() => setShowWeekSelector(true)}
                className="text-sm font-medium text-blue-600 hover:text-blue-700"
              >
                {selectedWeek && new Date(selectedWeek).toLocaleDateString('en-GB', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric'
                })}
                <span className="ml-1 text-xs">(change)</span>
              </button>
              {havsWeek && havsWeek.revision_number && havsWeek.revision_number > 0 && (
                <p className="text-xs text-amber-600 mt-1">
                  Revision #{havsWeek.revision_number} {havsWeek.status === 'submitted' && '(audited)'}
                </p>
              )}
              <p className="text-xs text-slate-500 mt-1">
                Submissions on Mon/Tue apply to previous week
              </p>
            </div>
          </div>
        </div>
      </div>

      {havsWeek && (
        <GangMemberSelector
          havsWeekId={havsWeek.id}
          gangerId={selectedEmployee.id}
          selectedMembers={allMembers}
          onMembersChange={handleMembersChange}
          isSubmitted={false}
        />
      )}

      {peopleState.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <Shield className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-blue-900 mb-2">HAVS Gang Status (Live Data)</h3>
              <div className="space-y-2">
                {peopleState.map((person) => (
                  <div key={person.member.id} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-900">{person.displayName}</span>
                      <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                        person.personType === 'ganger' ? 'bg-blue-500 text-white' : 'bg-amber-500 text-white'
                      }`}>
                        {person.personType === 'ganger' ? 'Ganger' : 'Operative'}
                      </span>
                      {person.member.manual_name && (
                        <span className="text-xs px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 font-medium">
                          Manual
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-semibold text-amber-600">{person.totalMinutes} min</span>
                      <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                        person.totalMinutes === 0 ? 'bg-slate-200 text-slate-600' : 'bg-emerald-100 text-emerald-700'
                      }`}>
                        {person.totalMinutes === 0 ? 'Not Started' : 'In Progress'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {peopleState.map((personState, personIndex) => {
        return (
          <div key={personState.member.id} className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-6 py-3 bg-slate-800 border-b border-slate-700">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-3">
                    <h2 className="text-sm font-semibold text-white uppercase tracking-wide">
                      {personState.displayName}
                    </h2>
                    {personState.member.manual_name && (
                      <span className="text-xs px-2 py-0.5 rounded bg-emerald-500 text-white font-medium">
                        Manual
                      </span>
                    )}
                    <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                      personState.personType === 'ganger' ? 'bg-blue-500 text-white' : 'bg-amber-500 text-white'
                    }`}>
                      {personState.personType === 'ganger' ? 'Ganger' : 'Operative'}
                    </span>
                    {isSubmitted && (
                      <span className="text-xs px-2 py-0.5 rounded bg-emerald-500 text-white flex items-center gap-1 font-medium">
                        <Shield className="h-3 w-3" />
                        Submitted
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
                  <span>Equipment Exposure Time (Minutes)</span>
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
                      <th
                        key={day.key}
                        className="px-2 py-3 text-center text-xs font-semibold text-slate-700 uppercase tracking-wide border-b-2 border-slate-300 w-20"
                      >
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
                        <td
                          colSpan={9}
                          className="px-4 py-2 text-xs font-bold text-slate-700 uppercase tracking-wider bg-slate-200 border-y border-slate-300"
                        >
                          {category}
                        </td>
                      </tr>

                      {items.map((item, idx) => {
                        const equipmentData = personState.exposure[item.name];
                        const rowTotal = equipmentData
                          ? Object.values(equipmentData).reduce((sum, val) => sum + val, 0)
                          : 0;

                        return (
                          <tr
                            key={item.name}
                            className={`${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'} hover:bg-blue-50/50 transition-colors`}
                          >
                            <td className="px-4 py-2 text-sm text-slate-900 font-medium border-b border-slate-200">
                              {item.name}
                            </td>
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
                                      const num = raw === '' ? 0 : parseInt(raw, 10);
                                      updateMinutes(personIndex, item.name, day.key, num);
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === 'ArrowUp') {
                                        e.preventDefault();
                                        updateMinutes(personIndex, item.name, day.key, currentValue + 1);
                                      } else if (e.key === 'ArrowDown') {
                                        e.preventDefault();
                                        updateMinutes(personIndex, item.name, day.key, Math.max(0, currentValue - 1));
                                      } else if (e.key === 'Enter') {
                                        e.preventDefault();
                                        (e.target as HTMLInputElement).blur();
                                      }
                                    }}
                                    onFocus={(e) => e.target.select()}
                                    placeholder="0"
                                    className="w-full px-2 py-2 text-center text-sm border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none bg-white hover:border-slate-300"
                                  />
                                </td>
                              );
                            })}
                            <td className={`px-4 py-2 text-center text-sm font-semibold border-b border-slate-200 ${
                              rowTotal > 0 ? 'text-amber-700 bg-amber-50' : 'text-slate-400 bg-slate-50'
                            }`}>
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
                    <td className="px-4 py-3 text-sm font-bold text-white uppercase tracking-wide">
                      Weekly Total
                    </td>
                    {DAYS.map((day) => {
                      const dayTotal = Object.values(personState.exposure).reduce((sum, equipmentDays) => {
                        return sum + equipmentDays[day.key];
                      }, 0);
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
      })}

      {peopleState.length > 0 && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-lg p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-blue-50 rounded-lg">
                <Save className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Save Progress</h3>
                <p className="text-xs text-slate-500">Save your work without submitting</p>
              </div>
            </div>
            <button
              onClick={handleSave}
              disabled={saving || !hasUnsavedChanges}
              className="w-full px-4 py-3 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors disabled:bg-slate-300 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {saving ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  {hasUnsavedChanges ? 'Save Changes' : 'All Changes Saved'}
                </>
              )}
            </button>
          </div>

          <div className="bg-red-50 border-2 border-red-200 rounded-lg p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-red-100 rounded-lg">
                <Send className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Submit All to Employer</h3>
                <p className="text-xs text-red-600 font-medium">FINAL - Submits all gang members (Cannot be undone)</p>
              </div>
            </div>
            <button
              onClick={handleSubmitClick}
              disabled={submitting || hasUnsavedChanges}
              className="w-full px-4 py-3 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md transition-colors disabled:bg-slate-400 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  Submit {peopleState.length === 1 ? '' : `All ${peopleState.length} People`} for Compliance Review
                </>
              )}
            </button>
            {hasUnsavedChanges && (
              <p className="text-xs text-red-600 mt-2 text-center font-medium">
                Save changes before submitting
              </p>
            )}
          </div>
        </div>
      )}

      {showWeekSelector && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">Select Week Ending</h3>
              <button
                onClick={() => setShowWeekSelector(false)}
                className="p-1 text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-4">
              <p className="text-sm text-slate-600 mb-4">
                Select the Sunday (week ending) for your HAVs timesheet:
              </p>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {availableWeeks.map((week) => (
                  <button
                    key={week}
                    onClick={() => handleWeekSelect(week)}
                    className="w-full px-4 py-3 text-left border border-slate-200 rounded-md hover:border-blue-400 hover:bg-blue-50 transition-colors"
                  >
                    <p className="text-sm font-medium text-slate-900">
                      {new Date(week).toLocaleDateString('en-GB', {
                        weekday: 'long',
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric'
                      })}
                    </p>
                    <p className="text-xs text-slate-500">
                      Week ending: {new Date(week).toLocaleDateString('en-GB')}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {showSubmitConfirmation && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full">
            <div className="px-6 py-4 border-b border-slate-200 bg-red-50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-100 rounded-full">
                  <AlertTriangle className="h-6 w-6 text-red-600" />
                </div>
                <h3 className="text-lg font-semibold text-slate-900">Confirm Final Submission</h3>
              </div>
            </div>

            <div className="p-6">
              <div className="mb-6">
                <p className="text-sm text-slate-700 mb-4">
                  You are about to submit HAVs exposure records for {peopleState.length} {peopleState.length === 1 ? 'person' : 'people'} for compliance review.
                </p>

                <div className="bg-blue-50 border-2 border-blue-300 rounded-md p-4 space-y-3">
                  <div className="flex items-start gap-2">
                    <Shield className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-blue-800 font-medium">
                      Submission creates an audited revision
                    </p>
                  </div>
                  <div className="flex items-start gap-2">
                    <FileText className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-blue-800">
                      This creates a snapshot for <strong>HSE compliance audits</strong>. You can still edit later if needed; changes will create a new revision.
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-slate-50 rounded-md p-4 mb-6 max-h-64 overflow-y-auto">
                <p className="text-xs text-slate-500 uppercase tracking-wide mb-3">Submission Summary</p>
                <div className="space-y-3">
                  {peopleState.map((personState) => (
                    <div key={personState.member.id} className="pb-3 border-b border-slate-200 last:border-0">
                      <div className="flex items-center gap-2 mb-2">
                        <p className="font-medium text-slate-900">{personState.displayName}</p>
                        {personState.member.manual_name && (
                          <span className="text-xs px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 font-medium">
                            Manual
                          </span>
                        )}
                        <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                          personState.personType === 'ganger' ? 'bg-blue-500 text-white' : 'bg-amber-500 text-white'
                        }`}>
                          {personState.personType === 'ganger' ? 'Ganger' : 'Operative'}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <p className="text-slate-500">Week Ending</p>
                          <p className="font-medium text-slate-900">
                            {new Date(selectedWeek).toLocaleDateString('en-GB')}
                          </p>
                        </div>
                        <div>
                          <p className="text-slate-500">Exposure</p>
                          <p className="font-medium text-amber-600">
                            {personState.totalMinutes} min
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowSubmitConfirmation(false)}
                  className="flex-1 px-4 py-3 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmSubmit}
                  disabled={submitting}
                  className="flex-1 px-4 py-3 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md transition-colors flex items-center justify-center gap-2"
                >
                  {submitting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4" />
                      Yes, Submit Final Record
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
