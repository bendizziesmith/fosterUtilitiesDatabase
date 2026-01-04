import React, { useState, useEffect } from 'react';
import { Save, Send, ArrowLeft, HardHat, Clock, CheckCircle, AlertTriangle, Shield, FileText, X } from 'lucide-react';
import { supabase, Employee, HavsTimesheetEntry, getWeekEndDate } from '../../../lib/supabase';

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
  const [selectedWeek, setSelectedWeek] = useState(getWeekEndDate().toISOString().split('T')[0]);
  const [timesheetData, setTimesheetData] = useState<TimesheetData>({
    employee_name: selectedEmployee.full_name,
    week_ending: selectedWeek,
    comments: '',
    actions: '',
    supervisor_name: '',
    entries: createEmptyEntries(),
    status: 'draft',
    total_hours: 0,
  });

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
    loadTimesheet(selectedWeek);
  }, [selectedEmployee.id, selectedWeek]);

  const generateAvailableWeeks = () => {
    const weeks = [];
    const today = new Date();
    for (let i = 0; i < 8; i++) {
      const sunday = new Date(today);
      const daysUntilSunday = (7 - today.getDay()) % 7;
      sunday.setDate(today.getDate() + daysUntilSunday + (7 * i));
      weeks.push(sunday.toISOString().split('T')[0]);
    }
    setAvailableWeeks(weeks);
  };

  const loadTimesheet = async (weekEnding: string) => {
    setIsLoading(true);
    setSaveError(null);

    try {
      const { data: existingTimesheet, error } = await supabase
        .from('havs_timesheets')
        .select(`
          *,
          havs_entries:havs_timesheet_entries(*)
        `)
        .eq('employee_id', selectedEmployee.id)
        .eq('week_ending', weekEnding)
        .maybeSingle();

      if (error) throw error;

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

        setTimesheetData({
          id: existingTimesheet.id,
          employee_name: existingTimesheet.employee_name,
          week_ending: existingTimesheet.week_ending,
          comments: existingTimesheet.comments || '',
          actions: existingTimesheet.actions || '',
          supervisor_name: existingTimesheet.supervisor_name || '',
          entries: entriesMap,
          status: existingTimesheet.status,
          total_hours: calculateWeeklyTotal(entriesMap),
        });
        setLastSaved(new Date(existingTimesheet.updated_at));
      } else {
        setTimesheetData({
          employee_name: selectedEmployee.full_name,
          week_ending: weekEnding,
          comments: '',
          actions: '',
          supervisor_name: '',
          entries: createEmptyEntries(),
          status: 'draft',
          total_hours: 0,
        });
        setLastSaved(null);
      }

      setHasUnsavedChanges(false);
    } catch (error) {
      console.error('Error loading timesheet:', error);
      setSaveError('Failed to load timesheet');
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

  const updateHours = (equipmentName: string, day: DayKey, value: number) => {
    const safeValue = Math.max(0, Math.round(value));

    setTimesheetData(prev => {
      const updatedEntries = { ...prev.entries };
      const entry = updatedEntries[equipmentName];

      if (entry) {
        const updatedEntry = {
          ...entry,
          [`${day}_hours`]: safeValue,
        };
        updatedEntry.total_hours = calculateEntryTotal(updatedEntry as HavsTimesheetEntry);
        updatedEntries[equipmentName] = updatedEntry as HavsTimesheetEntry;
      }

      return {
        ...prev,
        entries: updatedEntries,
        total_hours: calculateWeeklyTotal(updatedEntries),
      };
    });

    setHasUnsavedChanges(true);
  };

  const updateField = (field: 'comments' | 'actions' | 'supervisor_name', value: string) => {
    setTimesheetData(prev => ({ ...prev, [field]: value }));
    setHasUnsavedChanges(true);
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);

    try {
      let timesheetId = timesheetData.id;

      if (timesheetId) {
        const { error } = await supabase
          .from('havs_timesheets')
          .update({
            employee_name: timesheetData.employee_name,
            week_ending: timesheetData.week_ending,
            comments: timesheetData.comments,
            actions: timesheetData.actions,
            supervisor_name: timesheetData.supervisor_name,
            total_hours: timesheetData.total_hours,
            updated_at: new Date().toISOString(),
          })
          .eq('id', timesheetId);

        if (error) throw error;
      } else {
        const { data: newTimesheet, error } = await supabase
          .from('havs_timesheets')
          .insert({
            employee_id: selectedEmployee.id,
            employee_name: timesheetData.employee_name,
            week_ending: timesheetData.week_ending,
            comments: timesheetData.comments,
            actions: timesheetData.actions,
            supervisor_name: timesheetData.supervisor_name,
            total_hours: timesheetData.total_hours,
          })
          .select()
          .single();

        if (error) throw error;
        timesheetId = newTimesheet.id;

        setTimesheetData(prev => ({
          ...prev,
          id: timesheetId,
          entries: Object.fromEntries(
            Object.entries(prev.entries).map(([key, entry]) => [
              key,
              { ...entry, timesheet_id: timesheetId }
            ])
          ),
        }));
      }

      for (const entry of Object.values(timesheetData.entries)) {
        if (entry.id) {
          const { error } = await supabase
            .from('havs_timesheet_entries')
            .update({
              monday_hours: entry.monday_hours,
              tuesday_hours: entry.tuesday_hours,
              wednesday_hours: entry.wednesday_hours,
              thursday_hours: entry.thursday_hours,
              friday_hours: entry.friday_hours,
              saturday_hours: entry.saturday_hours,
              sunday_hours: entry.sunday_hours,
              total_hours: entry.total_hours,
              updated_at: new Date().toISOString(),
            })
            .eq('id', entry.id);

          if (error) throw error;
        } else if (entry.total_hours > 0) {
          const { data: newEntry, error } = await supabase
            .from('havs_timesheet_entries')
            .insert({
              timesheet_id: timesheetId,
              equipment_name: entry.equipment_name,
              equipment_category: entry.equipment_category,
              monday_hours: entry.monday_hours,
              tuesday_hours: entry.tuesday_hours,
              wednesday_hours: entry.wednesday_hours,
              thursday_hours: entry.thursday_hours,
              friday_hours: entry.friday_hours,
              saturday_hours: entry.saturday_hours,
              sunday_hours: entry.sunday_hours,
              total_hours: entry.total_hours,
            })
            .select()
            .single();

          if (error) throw error;

          setTimesheetData(prev => ({
            ...prev,
            entries: {
              ...prev.entries,
              [entry.equipment_name]: { ...prev.entries[entry.equipment_name], id: newEntry.id }
            }
          }));
        }
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
    if (timesheetData.total_hours === 0) {
      alert('Please add exposure time before submitting.');
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

      const { error } = await supabase
        .from('havs_timesheets')
        .update({
          status: 'submitted',
          submitted_at: new Date().toISOString(),
        })
        .eq('id', timesheetData.id);

      if (error) throw error;

      setTimesheetData(prev => ({ ...prev, status: 'submitted' }));
      setHasUnsavedChanges(false);
    } catch (error) {
      console.error('Error submitting:', error);
      alert('Failed to submit. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const isReadOnly = timesheetData.status === 'submitted';

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
                  <p className="text-sm text-slate-500">Hand Arm Vibration Syndrome Timesheet</p>
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
              {isReadOnly && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-md">
                  <Shield className="h-4 w-4 text-emerald-600" />
                  <span className="text-sm font-medium text-emerald-700">Submitted</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 divide-x divide-slate-200">
          <div className="px-6 py-4">
            <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Employee</p>
            <p className="text-sm font-medium text-slate-900">{timesheetData.employee_name}</p>
          </div>
          <div className="px-6 py-4">
            <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Week Ending</p>
            <button
              type="button"
              onClick={() => !isReadOnly && setShowWeekSelector(true)}
              disabled={isReadOnly}
              className={`text-sm font-medium ${isReadOnly ? 'text-slate-500' : 'text-blue-600 hover:text-blue-700'}`}
            >
              {new Date(timesheetData.week_ending).toLocaleDateString('en-GB', {
                day: 'numeric',
                month: 'long',
                year: 'numeric'
              })}
              {!isReadOnly && <span className="ml-1 text-xs">(change)</span>}
            </button>
          </div>
          <div className="px-6 py-4">
            <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Total Exposure</p>
            <p className="text-sm font-semibold text-amber-600">
              {timesheetData.total_hours} minutes
              {timesheetData.total_hours > 0 && (
                <span className="font-normal text-slate-500 ml-1">
                  ({(timesheetData.total_hours / 60).toFixed(1)}h)
                </span>
              )}
            </p>
          </div>
        </div>
      </div>

      {isReadOnly && (
        <div className="flex justify-end">
          <button
            onClick={() => setShowWeekSelector(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors"
          >
            <HardHat className="h-4 w-4" />
            Start New Week
          </button>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-6 py-3 bg-slate-800 border-b border-slate-700">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white uppercase tracking-wide">
              Equipment Exposure Time (Minutes)
            </h2>
            <div className="flex items-center gap-2 text-xs text-slate-300">
              <Clock className="h-3.5 w-3.5" />
              <span>Enter time in minutes per day</span>
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
                                  updateHours(item.name, day.key, num);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'ArrowUp') {
                                    e.preventDefault();
                                    updateHours(item.name, day.key, currentValue + 1);
                                  } else if (e.key === 'ArrowDown') {
                                    e.preventDefault();
                                    updateHours(item.name, day.key, Math.max(0, currentValue - 1));
                                  } else if (e.key === 'Enter') {
                                    e.preventDefault();
                                    (e.target as HTMLInputElement).blur();
                                  }
                                }}
                                onFocus={(e) => e.target.select()}
                                placeholder="0"
                                disabled={isReadOnly}
                                className={`w-full px-2 py-2 text-center text-sm border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
                                  isReadOnly
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
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded-lg">
          <div className="px-4 py-3 border-b border-slate-200">
            <h3 className="text-sm font-semibold text-slate-900">Comments</h3>
          </div>
          <div className="p-4">
            <textarea
              value={timesheetData.comments}
              onChange={(e) => updateField('comments', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              rows={4}
              placeholder="Equipment usage notes, conditions, etc."
              disabled={isReadOnly}
            />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg">
          <div className="px-4 py-3 border-b border-slate-200">
            <h3 className="text-sm font-semibold text-slate-900">Actions Required</h3>
          </div>
          <div className="p-4">
            <textarea
              value={timesheetData.actions}
              onChange={(e) => updateField('actions', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              rows={4}
              placeholder="Record any actions taken or required..."
              disabled={isReadOnly}
            />
          </div>
        </div>
      </div>

      {!isReadOnly && (
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
            <div className="mt-3 flex items-center justify-center gap-2 text-xs text-slate-500">
              <Clock className="h-3.5 w-3.5" />
              <span>Total Exposure: <strong className="text-amber-600">{timesheetData.total_hours} minutes</strong></span>
            </div>
          </div>

          <div className="bg-red-50 border-2 border-red-200 rounded-lg p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-red-100 rounded-lg">
                <Send className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Submit to Employer</h3>
                <p className="text-xs text-red-600 font-medium">FINAL - Cannot be edited after submission</p>
              </div>
            </div>
            <button
              onClick={handleSubmitClick}
              disabled={submitting || timesheetData.total_hours === 0 || hasUnsavedChanges}
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
                  Submit for Compliance Review
                </>
              )}
            </button>
            {hasUnsavedChanges && (
              <p className="text-xs text-red-600 mt-2 text-center font-medium">
                Save changes before submitting
              </p>
            )}
            {!hasUnsavedChanges && timesheetData.total_hours === 0 && (
              <p className="text-xs text-slate-500 mt-2 text-center">
                Add exposure time to enable submission
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
                  You are about to submit your HAVs exposure record for compliance review.
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
                      Once submitted, this record becomes <strong>read-only</strong> and will be used for <strong>HSE compliance audits</strong>.
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-slate-50 rounded-md p-4 mb-6">
                <p className="text-xs text-slate-500 uppercase tracking-wide mb-2">Submission Summary</p>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-slate-500">Week Ending</p>
                    <p className="font-medium text-slate-900">
                      {new Date(timesheetData.week_ending).toLocaleDateString('en-GB')}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-500">Total Exposure</p>
                    <p className="font-medium text-amber-600">
                      {timesheetData.total_hours} minutes
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-500">Employee</p>
                    <p className="font-medium text-slate-900">{timesheetData.employee_name}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Status</p>
                    <p className="font-medium text-slate-900">Ready to Submit</p>
                  </div>
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
