import React, { useState, useEffect } from 'react';
import { Save, Send, ArrowLeft, HardHat, Clock, CheckCircle, AlertTriangle, Shield, FileText, X, Users } from 'lucide-react';
import { supabase, Employee, HavsTimesheetEntry, GangOperative } from '../../../lib/supabase';
import { GangMemberSelector } from './GangMemberSelector';

interface HavsTimesheetFormProps {
  selectedEmployee: Employee;
  onBack: () => void;
}

interface PersonTimesheetData {
  operative: GangOperative;
  role: 'Ganger' | 'Operative';
  timesheetData: TimesheetData;
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

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getCurrentWeekSunday(): string {
  const today = new Date();
  const dayOfWeek = today.getDay();
  const daysUntilSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
  const sunday = new Date(today);
  sunday.setDate(today.getDate() + daysUntilSunday);
  return formatLocalDate(sunday);
}

interface TimesheetData {
  id?: string;
  employee_name: string;
  week_ending: string;
  comments: string;
  actions: string;
  supervisor_name: string;
  entries: { [key: string]: HavsTimesheetEntry };
  status: 'draft' | 'submitted';
  total_hours: number;
}

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

function createEmptyEntries(): { [key: string]: HavsTimesheetEntry } {
  const entries: { [key: string]: HavsTimesheetEntry } = {};
  EQUIPMENT_ITEMS.forEach(item => {
    entries[item.name] = {
      id: '',
      timesheet_id: '',
      equipment_name: item.name,
      equipment_category: item.category,
      monday_hours: 0,
      tuesday_hours: 0,
      wednesday_hours: 0,
      thursday_hours: 0,
      friday_hours: 0,
      saturday_hours: 0,
      sunday_hours: 0,
      total_hours: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  });
  return entries;
}

function calculateEntryTotal(entry: HavsTimesheetEntry): number {
  return (
    entry.monday_hours +
    entry.tuesday_hours +
    entry.wednesday_hours +
    entry.thursday_hours +
    entry.friday_hours +
    entry.saturday_hours +
    entry.sunday_hours
  );
}

function calculateWeeklyTotal(entries: { [key: string]: HavsTimesheetEntry }): number {
  return Object.values(entries).reduce((sum, entry) => sum + entry.total_hours, 0);
}

export const HavsTimesheetForm: React.FC<HavsTimesheetFormProps> = ({
  selectedEmployee,
  onBack,
}) => {
  const [showWeekSelector, setShowWeekSelector] = useState(false);
  const [showSubmitConfirmation, setShowSubmitConfirmation] = useState(false);
  const [availableWeeks, setAvailableWeeks] = useState<string[]>([]);
  const [selectedWeek, setSelectedWeek] = useState(getCurrentWeekSunday());
  const [gangMembers, setGangMembers] = useState<GangOperative[]>([]);
  const [peopleTimesheets, setPeopleTimesheets] = useState<PersonTimesheetData[]>([]);

  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    generateAvailableWeeks();
  }, []);

  useEffect(() => {
    loadGangMembership(selectedWeek);
  }, [selectedEmployee.id, selectedWeek]);

  useEffect(() => {
    if (!isLoading) {
      loadAllTimesheets(selectedWeek);
    }
  }, [selectedEmployee.id, selectedWeek, gangMembers]);

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

  const loadGangMembership = async (weekEnding: string) => {
    try {
      const { data, error } = await supabase
        .from('gang_membership')
        .select('*')
        .eq('week_ending', weekEnding)
        .eq('ganger_id', selectedEmployee.id);

      if (error) throw error;

      const operatives: GangOperative[] = [];

      if (data) {
        for (const membership of data) {
          if (membership.is_manual) {
            operatives.push({
              id: `manual-${membership.id}`,
              full_name: membership.operative_name,
              role: membership.operative_role,
              is_manual: true,
            });
          } else if (membership.operative_id) {
            const { data: employeeData } = await supabase
              .from('employees')
              .select('*')
              .eq('id', membership.operative_id)
              .maybeSingle();

            if (employeeData) {
              operatives.push({
                id: employeeData.id,
                full_name: employeeData.full_name,
                role: employeeData.role,
                is_manual: false,
                employee_id: employeeData.id,
              });
            }
          }
        }
      }

      setGangMembers(operatives);
    } catch (error) {
      console.error('Error loading gang membership:', error);
      setGangMembers([]);
    }
  };

  const loadTimesheetForPerson = async (operative: GangOperative, weekEnding: string): Promise<TimesheetData> => {
    const personId = operative.is_manual ? operative.id : operative.employee_id!;

    const { data: timesheets, error } = await supabase
      .from('havs_timesheets')
      .select(`
        *,
        havs_entries:havs_timesheet_entries(*)
      `)
      .eq('employee_id', personId)
      .eq('week_ending', weekEnding)
      .order('updated_at', { ascending: false });

    if (error) throw error;

    const draftTimesheet = timesheets?.find(t => t.status === 'draft');
    const submittedTimesheet = timesheets?.find(t => t.status === 'submitted');
    const existingTimesheet = draftTimesheet || submittedTimesheet;

    if (existingTimesheet) {
      const entriesMap = createEmptyEntries();

      existingTimesheet.havs_entries?.forEach((entry: HavsTimesheetEntry) => {
        if (entriesMap[entry.equipment_name]) {
          entriesMap[entry.equipment_name] = {
            ...entriesMap[entry.equipment_name],
            ...entry,
            total_hours: calculateEntryTotal(entry),
          };
        }
      });

      Object.keys(entriesMap).forEach(key => {
        if (!entriesMap[key].id) {
          entriesMap[key].timesheet_id = existingTimesheet.id;
        }
      });

      return {
        id: existingTimesheet.id,
        employee_name: existingTimesheet.employee_name,
        week_ending: existingTimesheet.week_ending,
        comments: existingTimesheet.comments || '',
        actions: existingTimesheet.actions || '',
        supervisor_name: existingTimesheet.supervisor_name || '',
        entries: entriesMap,
        status: existingTimesheet.status,
        total_hours: calculateWeeklyTotal(entriesMap),
      };
    } else {
      return {
        employee_name: operative.full_name,
        week_ending: weekEnding,
        comments: '',
        actions: '',
        supervisor_name: '',
        entries: createEmptyEntries(),
        status: 'draft',
        total_hours: 0,
      };
    }
  };

  const loadAllTimesheets = async (weekEnding: string) => {
    setIsLoading(true);
    setSaveError(null);

    try {
      const gangerAsOperative: GangOperative = {
        id: selectedEmployee.id,
        full_name: selectedEmployee.full_name,
        role: selectedEmployee.role,
        is_manual: false,
        employee_id: selectedEmployee.id,
      };

      const allPeople = [gangerAsOperative, ...gangMembers];
      const peopleData: PersonTimesheetData[] = [];

      for (let i = 0; i < allPeople.length; i++) {
        const person = allPeople[i];
        const role = i === 0 ? 'Ganger' : 'Operative';
        const timesheetData = await loadTimesheetForPerson(person, weekEnding);
        peopleData.push({ operative: person, role, timesheetData });
      }

      setPeopleTimesheets(peopleData);

      const mostRecentUpdate = peopleData
        .map(p => p.timesheetData.id ? new Date() : null)
        .filter(d => d !== null)
        .sort((a, b) => (b?.getTime() || 0) - (a?.getTime() || 0))[0];

      setLastSaved(mostRecentUpdate || null);
      setHasUnsavedChanges(false);
    } catch (error) {
      console.error('Error loading timesheets:', error);
      setSaveError('Failed to load timesheets');
    } finally {
      setIsLoading(false);
    }
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

  const updateHours = (personIndex: number, equipmentName: string, day: DayKey, value: number) => {
    const safeValue = Math.max(0, Math.round(value));

    setPeopleTimesheets(prev => {
      const updated = [...prev];
      const person = updated[personIndex];
      const updatedEntries = { ...person.timesheetData.entries };
      const entry = updatedEntries[equipmentName];

      if (entry) {
        const updatedEntry = {
          ...entry,
          [`${day}_hours`]: safeValue,
        };
        updatedEntry.total_hours = calculateEntryTotal(updatedEntry as HavsTimesheetEntry);
        updatedEntries[equipmentName] = updatedEntry as HavsTimesheetEntry;
      }

      updated[personIndex] = {
        ...person,
        timesheetData: {
          ...person.timesheetData,
          entries: updatedEntries,
          total_hours: calculateWeeklyTotal(updatedEntries),
        },
      };

      return updated;
    });

    setHasUnsavedChanges(true);
  };

  const updateField = (personIndex: number, field: 'comments' | 'actions' | 'supervisor_name', value: string) => {
    setPeopleTimesheets(prev => {
      const updated = [...prev];
      updated[personIndex] = {
        ...updated[personIndex],
        timesheetData: {
          ...updated[personIndex].timesheetData,
          [field]: value,
        },
      };
      return updated;
    });
    setHasUnsavedChanges(true);
  };

  const saveTimesheetForPerson = async (personData: PersonTimesheetData) => {
    const { operative, timesheetData } = personData;
    const now = new Date().toISOString();
    let timesheetId = timesheetData.id;
    const personId = operative.is_manual ? operative.id : operative.employee_id!;

    if (timesheetId) {
      const { error } = await supabase
        .from('havs_timesheets')
        .update({
          employee_name: timesheetData.employee_name,
          comments: timesheetData.comments,
          actions: timesheetData.actions,
          supervisor_name: timesheetData.supervisor_name,
          total_hours: timesheetData.total_hours,
          updated_at: now,
        })
        .eq('id', timesheetId);

      if (error) throw error;
    } else {
      const { data: newTimesheet, error } = await supabase
        .from('havs_timesheets')
        .insert({
          employee_id: personId,
          employee_name: timesheetData.employee_name,
          week_ending: timesheetData.week_ending,
          comments: timesheetData.comments,
          actions: timesheetData.actions,
          supervisor_name: timesheetData.supervisor_name,
          total_hours: timesheetData.total_hours,
          status: 'draft',
        })
        .select()
        .single();

      if (error) throw error;
      timesheetId = newTimesheet.id;
    }

    const updatedEntries = { ...timesheetData.entries };

    for (const entry of Object.values(timesheetData.entries)) {
      const entryData = {
        monday_hours: entry.monday_hours,
        tuesday_hours: entry.tuesday_hours,
        wednesday_hours: entry.wednesday_hours,
        thursday_hours: entry.thursday_hours,
        friday_hours: entry.friday_hours,
        saturday_hours: entry.saturday_hours,
        sunday_hours: entry.sunday_hours,
        total_hours: entry.total_hours,
        updated_at: now,
      };

      if (entry.id) {
        const { error } = await supabase
          .from('havs_timesheet_entries')
          .update(entryData)
          .eq('id', entry.id);

        if (error) throw error;
      } else {
        const { data: newEntry, error } = await supabase
          .from('havs_timesheet_entries')
          .insert({
            timesheet_id: timesheetId,
            equipment_name: entry.equipment_name,
            equipment_category: entry.equipment_category,
            ...entryData,
          })
          .select()
          .single();

        if (error) throw error;
        updatedEntries[entry.equipment_name] = {
          ...updatedEntries[entry.equipment_name],
          id: newEntry.id,
          timesheet_id: timesheetId,
        };
      }
    }

    return {
      ...personData,
      timesheetData: {
        ...timesheetData,
        id: timesheetId,
        entries: updatedEntries,
      },
    };
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);

    try {
      const updatedPeople: PersonTimesheetData[] = [];

      for (const personData of peopleTimesheets) {
        const updated = await saveTimesheetForPerson(personData);
        updatedPeople.push(updated);
      }

      setPeopleTimesheets(updatedPeople);
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
    const anyZeroExposure = peopleTimesheets.some(p => p.timesheetData.total_hours === 0);
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

      for (const personData of peopleTimesheets) {
        if (personData.timesheetData.id && personData.timesheetData.status === 'draft') {
          const { error } = await supabase
            .from('havs_timesheets')
            .update({
              status: 'submitted',
              submitted_at: new Date().toISOString(),
            })
            .eq('id', personData.timesheetData.id);

          if (error) throw error;
        }
      }

      setPeopleTimesheets(prev =>
        prev.map(p => ({
          ...p,
          timesheetData: { ...p.timesheetData, status: 'submitted' },
        }))
      );
      setHasUnsavedChanges(false);
    } catch (error) {
      console.error('Error submitting:', error);
      alert('Failed to submit. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const allSubmitted = peopleTimesheets.length > 0 && peopleTimesheets.every(p => p.timesheetData.status === 'submitted');
  const anySubmitted = peopleTimesheets.some(p => p.timesheetData.status === 'submitted');

  const groupedEquipment = EQUIPMENT_ITEMS.reduce((acc, item) => {
    if (!acc[item.category]) {
      acc[item.category] = [];
    }
    acc[item.category].push(item);
    return acc;
  }, {} as Record<string, EquipmentItem[]>);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
          <p className="text-sm text-slate-500">Loading timesheet...</p>
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
              {allSubmitted && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-md">
                  <Shield className="h-4 w-4 text-emerald-600" />
                  <span className="text-sm font-medium text-emerald-700">All Submitted</span>
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
                onClick={() => !anySubmitted && setShowWeekSelector(true)}
                disabled={anySubmitted}
                className={`text-sm font-medium ${anySubmitted ? 'text-slate-500' : 'text-blue-600 hover:text-blue-700'}`}
              >
                {new Date(selectedWeek).toLocaleDateString('en-GB', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric'
                })}
                {!anySubmitted && <span className="ml-1 text-xs">(change)</span>}
              </button>
            </div>
          </div>
        </div>
      </div>

      {!allSubmitted && (
        <GangMemberSelector
          gangerId={selectedEmployee.id}
          weekEnding={selectedWeek}
          selectedMembers={gangMembers}
          onMembersChange={setGangMembers}
        />
      )}

      {peopleTimesheets.map((personData, personIndex) => {
        const { operative, role, timesheetData } = personData;
        const isPersonReadOnly = timesheetData.status === 'submitted';

        return (
          <div key={operative.id} className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-6 py-3 bg-slate-800 border-b border-slate-700">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-3">
                    <h2 className="text-sm font-semibold text-white uppercase tracking-wide">
                      {operative.full_name}
                    </h2>
                    {operative.is_manual && (
                      <span className="text-xs px-2 py-0.5 rounded bg-emerald-500 text-white">
                        Manual
                      </span>
                    )}
                    <span className={`text-xs px-2 py-0.5 rounded ${
                      role === 'Ganger' ? 'bg-blue-500 text-white' : 'bg-amber-500 text-white'
                    }`}>
                      {role}
                    </span>
                    {isPersonReadOnly && (
                      <span className="text-xs px-2 py-0.5 rounded bg-emerald-500 text-white flex items-center gap-1">
                        <Shield className="h-3 w-3" />
                        Submitted
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-300 mt-1">
                    Total: {timesheetData.total_hours} minutes
                    {timesheetData.total_hours > 0 && (
                      <span> ({(timesheetData.total_hours / 60).toFixed(1)}h)</span>
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
                        const entry = timesheetData.entries[item.name];
                        const rowTotal = entry?.total_hours || 0;

                        return (
                          <tr
                            key={item.name}
                            className={`${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'} hover:bg-blue-50/50 transition-colors`}
                          >
                            <td className="px-4 py-2 text-sm text-slate-900 font-medium border-b border-slate-200">
                              {item.name}
                            </td>
                            {DAYS.map((day) => {
                              const fieldKey = `${day.key}_hours` as keyof HavsTimesheetEntry;
                              const currentValue = entry ? (entry[fieldKey] as number) || 0 : 0;

                              return (
                                <td key={day.key} className="px-1 py-1 border-b border-slate-200">
                                  <input
                                    type="text"
                                    inputMode="numeric"
                                    value={currentValue === 0 ? '' : currentValue.toString()}
                                    onChange={(e) => {
                                      const raw = e.target.value.replace(/[^0-9]/g, '');
                                      const num = raw === '' ? 0 : parseInt(raw, 10);
                                      updateHours(personIndex, item.name, day.key, num);
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === 'ArrowUp') {
                                        e.preventDefault();
                                        updateHours(personIndex, item.name, day.key, currentValue + 1);
                                      } else if (e.key === 'ArrowDown') {
                                        e.preventDefault();
                                        updateHours(personIndex, item.name, day.key, Math.max(0, currentValue - 1));
                                      } else if (e.key === 'Enter') {
                                        e.preventDefault();
                                        (e.target as HTMLInputElement).blur();
                                      }
                                    }}
                                    onFocus={(e) => e.target.select()}
                                    placeholder="0"
                                    disabled={isPersonReadOnly}
                                    className={`w-full px-2 py-2 text-center text-sm border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
                                      isPersonReadOnly
                                        ? 'bg-slate-100 text-slate-500 cursor-not-allowed'
                                        : 'bg-white hover:border-slate-300'
                                    }`}
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
                      const fieldKey = `${day.key}_hours` as keyof HavsTimesheetEntry;
                      const dayTotal = Object.values(timesheetData.entries).reduce((sum, entry) => {
                        return sum + ((entry[fieldKey] as number) || 0);
                      }, 0);
                      return (
                        <td key={day.key} className="px-2 py-3 text-center text-sm font-semibold text-slate-300">
                          {dayTotal > 0 ? dayTotal : '-'}
                        </td>
                      );
                    })}
                    <td className="px-4 py-3 text-center text-base font-bold text-amber-400 bg-slate-900">
                      {timesheetData.total_hours}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 border-t border-slate-200">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-2">Comments</label>
                <textarea
                  value={timesheetData.comments}
                  onChange={(e) => updateField(personIndex, 'comments', e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                  rows={3}
                  placeholder="Equipment usage notes, conditions, etc."
                  disabled={isPersonReadOnly}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-2">Actions Required</label>
                <textarea
                  value={timesheetData.actions}
                  onChange={(e) => updateField(personIndex, 'actions', e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                  rows={3}
                  placeholder="Record any actions taken or required..."
                  disabled={isPersonReadOnly}
                />
              </div>
            </div>
          </div>
        );
      })}

      {!allSubmitted && (
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
            <div className="mt-3 space-y-2">
              {peopleTimesheets.map((p) => (
                <div key={p.operative.id} className="flex items-center justify-between text-xs">
                  <span className="text-slate-600">{p.operative.full_name}:</span>
                  <span className="font-semibold text-amber-600">{p.timesheetData.total_hours} min</span>
                </div>
              ))}
            </div>
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
                  Submit {peopleTimesheets.length === 1 ? '' : `All ${peopleTimesheets.length} People`} for Compliance Review
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
                  You are about to submit HAVs exposure records for {peopleTimesheets.length} {peopleTimesheets.length === 1 ? 'person' : 'people'} for compliance review.
                </p>

                <div className="bg-red-50 border-2 border-red-300 rounded-md p-4 space-y-3">
                  <div className="flex items-start gap-2">
                    <Shield className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-red-800 font-medium">
                      THIS ACTION CANNOT BE UNDONE
                    </p>
                  </div>
                  <div className="flex items-start gap-2">
                    <FileText className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-red-800">
                      Once submitted, these records become <strong>read-only</strong> and will be used for <strong>HSE compliance audits</strong>.
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-slate-50 rounded-md p-4 mb-6 max-h-64 overflow-y-auto">
                <p className="text-xs text-slate-500 uppercase tracking-wide mb-3">Submission Summary</p>
                <div className="space-y-3">
                  {peopleTimesheets.map((personData) => (
                    <div key={personData.operative.id} className="pb-3 border-b border-slate-200 last:border-0">
                      <div className="flex items-center gap-2 mb-2">
                        <p className="font-medium text-slate-900">{personData.operative.full_name}</p>
                        {personData.operative.is_manual && (
                          <span className="text-xs px-2 py-0.5 rounded bg-emerald-100 text-emerald-700">
                            Manual
                          </span>
                        )}
                        <span className={`text-xs px-2 py-0.5 rounded ${
                          personData.role === 'Ganger' ? 'bg-blue-500 text-white' : 'bg-amber-500 text-white'
                        }`}>
                          {personData.role}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <p className="text-slate-500">Week Ending</p>
                          <p className="font-medium text-slate-900">
                            {new Date(personData.timesheetData.week_ending).toLocaleDateString('en-GB')}
                          </p>
                        </div>
                        <div>
                          <p className="text-slate-500">Exposure</p>
                          <p className="font-medium text-amber-600">
                            {personData.timesheetData.total_hours} min
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
