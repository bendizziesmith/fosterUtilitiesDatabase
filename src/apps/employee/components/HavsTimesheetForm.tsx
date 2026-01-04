import React, { useState, useEffect, useRef, useCallback } from 'react';
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

export const HavsTimesheetForm: React.FC<HavsTimesheetFormProps> = ({
  selectedEmployee,
  onBack,
}) => {
  const [showWeekSelector, setShowWeekSelector] = useState(false);
  const [showSubmitConfirmation, setShowSubmitConfirmation] = useState(false);
  const [availableWeeks, setAvailableWeeks] = useState<string[]>([]);
  const [timesheetData, setTimesheetData] = useState<TimesheetData>({
    employee_name: selectedEmployee.full_name,
    week_ending: getWeekEndDate().toISOString().split('T')[0],
    comments: '',
    actions: '',
    supervisor_name: '',
    entries: {},
    status: 'draft',
    total_hours: 0,
  });

  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const timesheetDataRef = useRef(timesheetData);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isInitialLoadRef = useRef(true);
  const loadedWeekRef = useRef<string | null>(null);

  useEffect(() => {
    timesheetDataRef.current = timesheetData;
  }, [timesheetData]);

  const isCurrentWeekSubmitted = timesheetData.status === 'submitted';

  useEffect(() => {
    generateAvailableWeeks();
  }, []);

  useEffect(() => {
    const weekEnding = timesheetData.week_ending;
    if (loadedWeekRef.current !== weekEnding || isInitialLoadRef.current) {
      loadedWeekRef.current = weekEnding;
      isInitialLoadRef.current = false;
      loadExistingTimesheet();
    }
  }, [selectedEmployee.id, timesheetData.week_ending]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (timesheetDataRef.current.status === 'draft') {
        autoSave();
      }
    }, 30000);

    return () => clearInterval(interval);
  }, []);

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

  const handleStartNewWeek = () => {
    setShowWeekSelector(true);
  };

  const handleWeekSelect = (weekEnding: string) => {
    setTimesheetData(prev => ({
      employee_name: selectedEmployee.full_name,
      week_ending: weekEnding,
      comments: '',
      actions: '',
      supervisor_name: '',
      entries: {},
      status: 'draft',
      total_hours: 0,
    }));
    setShowWeekSelector(false);
    setLastSaved(null);
    setSaveError(null);
  };

  const loadExistingTimesheet = async () => {
    try {
      const { data: existingTimesheet, error } = await supabase
        .from('havs_timesheets')
        .select(`
          *,
          havs_entries:havs_timesheet_entries(*)
        `)
        .eq('employee_id', selectedEmployee.id)
        .eq('week_ending', timesheetData.week_ending)
        .maybeSingle();

      if (error) throw error;

      if (existingTimesheet) {
        const entriesMap: { [key: string]: HavsTimesheetEntry } = {};

        EQUIPMENT_ITEMS.forEach(item => {
          entriesMap[item.name] = {
            id: '',
            timesheet_id: existingTimesheet.id,
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

        existingTimesheet.havs_entries?.forEach((entry: HavsTimesheetEntry) => {
          if (entriesMap[entry.equipment_name]) {
            entriesMap[entry.equipment_name] = {
              ...entriesMap[entry.equipment_name],
              ...entry
            };
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
          total_hours: existingTimesheet.total_hours || 0,
        });
      } else {
        const entriesMap: { [key: string]: HavsTimesheetEntry } = {};
        EQUIPMENT_ITEMS.forEach(item => {
          entriesMap[item.name] = {
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

        setTimesheetData(prev => ({
          ...prev,
          entries: entriesMap,
        }));
      }
    } catch (error) {
      console.error('Error loading existing timesheet:', error);
    }
  };

  const debouncedAutoSave = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      if (timesheetDataRef.current.status === 'draft') {
        autoSave();
      }
    }, 1500);
  }, []);

  const updateHours = useCallback((equipmentName: string, day: string, hours: number) => {
    setTimesheetData(prev => {
      const updatedEntries = { ...prev.entries };
      const entry = updatedEntries[equipmentName];

      if (entry) {
        const updatedEntry = {
          ...entry,
          [`${day}_hours`]: Math.max(0, Math.round(hours))
        };

        updatedEntry.total_hours =
          updatedEntry.monday_hours +
          updatedEntry.tuesday_hours +
          updatedEntry.wednesday_hours +
          updatedEntry.thursday_hours +
          updatedEntry.friday_hours +
          updatedEntry.saturday_hours +
          updatedEntry.sunday_hours;

        updatedEntries[equipmentName] = updatedEntry;
      }

      const totalHours = Object.values(updatedEntries).reduce((sum, e) => sum + e.total_hours, 0);

      return {
        ...prev,
        entries: updatedEntries,
        total_hours: totalHours,
      };
    });

    debouncedAutoSave();
  }, [debouncedAutoSave]);

  const updateField = useCallback((field: keyof TimesheetData, value: string) => {
    setTimesheetData(prev => ({ ...prev, [field]: value }));
    debouncedAutoSave();
  }, [debouncedAutoSave]);

  const autoSave = async () => {
    if (saving || submitting) return;

    setSaving(true);
    setSaveError(null);

    try {
      await saveTimesheet();
      setLastSaved(new Date());
    } catch (error) {
      console.error('Auto-save error:', error);
      setSaveError('Auto-save failed');
    } finally {
      setSaving(false);
    }
  };

  const saveTimesheet = async () => {
    const currentData = timesheetDataRef.current;
    let timesheetId = currentData.id;

    if (timesheetId) {
      const { error } = await supabase
        .from('havs_timesheets')
        .update({
          employee_name: currentData.employee_name,
          week_ending: currentData.week_ending,
          comments: currentData.comments,
          actions: currentData.actions,
          supervisor_name: currentData.supervisor_name,
          total_hours: currentData.total_hours,
          updated_at: new Date().toISOString(),
        })
        .eq('id', timesheetId);

      if (error) throw error;
    } else {
      const { data: newTimesheet, error } = await supabase
        .from('havs_timesheets')
        .insert({
          employee_id: selectedEmployee.id,
          employee_name: currentData.employee_name,
          week_ending: currentData.week_ending,
          comments: currentData.comments,
          actions: currentData.actions,
          supervisor_name: currentData.supervisor_name,
          total_hours: currentData.total_hours,
        })
        .select()
        .single();

      if (error) throw error;

      timesheetId = newTimesheet.id;
      setTimesheetData(prev => ({ ...prev, id: timesheetId }));
    }

    const entriesToSave = Object.values(currentData.entries);
    for (const entry of entriesToSave) {
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
  };

  const handleManualSave = async () => {
    setSaving(true);
    setSaveError(null);

    try {
      await saveTimesheet();
      setLastSaved(new Date());
    } catch (error) {
      console.error('Save error:', error);
      setSaveError('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleSubmitClick = () => {
    if (timesheetData.total_hours === 0) {
      alert('Please add exposure time before submitting');
      return;
    }
    setShowSubmitConfirmation(true);
  };

  const handleConfirmSubmit = async () => {
    setSubmitting(true);
    setShowSubmitConfirmation(false);

    try {
      await saveTimesheet();

      const { error } = await supabase
        .from('havs_timesheets')
        .update({
          status: 'submitted',
          submitted_at: new Date().toISOString(),
        })
        .eq('id', timesheetData.id);

      if (error) throw error;

      setTimesheetData(prev => ({ ...prev, status: 'submitted' }));
    } catch (error) {
      console.error('Error submitting timesheet:', error);
      alert('Failed to submit timesheet. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const formatMinutes = (minutes: number): string => {
    return minutes.toString();
  };

  const parseMinutes = (value: string): number => {
    const parsed = parseFloat(value);
    return isNaN(parsed) ? 0 : Math.round(parsed);
  };

  const groupedEquipment = EQUIPMENT_ITEMS.reduce((acc, item) => {
    if (!acc[item.category]) {
      acc[item.category] = [];
    }
    acc[item.category].push(item);
    return acc;
  }, {} as Record<string, EquipmentItem[]>);

  const isReadOnly = timesheetData.status === 'submitted';

  const days = [
    { key: 'monday', label: 'Mon', full: 'Monday' },
    { key: 'tuesday', label: 'Tue', full: 'Tuesday' },
    { key: 'wednesday', label: 'Wed', full: 'Wednesday' },
    { key: 'thursday', label: 'Thu', full: 'Thursday' },
    { key: 'friday', label: 'Fri', full: 'Friday' },
    { key: 'saturday', label: 'Sat', full: 'Saturday' },
    { key: 'sunday', label: 'Sun', full: 'Sunday' },
  ];

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
              {saving ? (
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <div className="w-4 h-4 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
                  <span>Saving...</span>
                </div>
              ) : lastSaved ? (
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <CheckCircle className="h-4 w-4 text-emerald-500" />
                  <span>Saved {lastSaved.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              ) : saveError ? (
                <div className="flex items-center gap-2 text-sm text-red-600">
                  <AlertTriangle className="h-4 w-4" />
                  <span>{saveError}</span>
                </div>
              ) : null}

              {timesheetData.status === 'submitted' && (
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
              {formatMinutes(timesheetData.total_hours)} minutes
              {timesheetData.total_hours > 0 && (
                <span className="font-normal text-slate-500 ml-1">
                  ({(timesheetData.total_hours / 60).toFixed(1)}h)
                </span>
              )}
            </p>
          </div>
        </div>
      </div>

      {timesheetData.status === 'submitted' && (
        <div className="flex justify-end">
          <button
            onClick={handleStartNewWeek}
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
                {days.map((day) => (
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
                        {days.map((day) => (
                          <td key={day.key} className="px-1 py-1 border-b border-slate-200">
                            <input
                              type="text"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              value={entry && entry[`${day.key}_hours` as keyof HavsTimesheetEntry] !== undefined
                                ? (entry[`${day.key}_hours` as keyof HavsTimesheetEntry] as number || 0).toString()
                                : '0'}
                              onChange={(e) => {
                                const val = e.target.value.replace(/[^0-9]/g, '');
                                updateHours(item.name, day.key, parseMinutes(val));
                              }}
                              onFocus={(e) => e.target.select()}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  (e.target as HTMLInputElement).blur();
                                }
                              }}
                              className={`w-full px-2 py-2 text-center text-sm border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all ${
                                isReadOnly ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : 'bg-white'
                              }`}
                              placeholder="0"
                              readOnly={isReadOnly}
                            />
                          </td>
                        ))}
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
                {days.map((day) => {
                  const dayTotal = Object.values(timesheetData.entries).reduce((sum, entry) => {
                    return sum + (entry[`${day.key}_hours` as keyof HavsTimesheetEntry] as number || 0);
                  }, 0);
                  return (
                    <td key={day.key} className="px-2 py-3 text-center text-sm font-semibold text-slate-300">
                      {dayTotal > 0 ? dayTotal : '-'}
                    </td>
                  );
                })}
                <td className="px-4 py-3 text-center text-base font-bold text-amber-400 bg-slate-900">
                  {formatMinutes(timesheetData.total_hours)}
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
              readOnly={isReadOnly}
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
              readOnly={isReadOnly}
            />
          </div>
        </div>
      </div>

      {!isReadOnly && (
        <div className="bg-white border border-slate-200 rounded-lg">
          <div className="p-6">
            <div className="flex items-start justify-between gap-8">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 bg-blue-50 rounded-lg">
                    <Save className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">Save Progress</h3>
                    <p className="text-xs text-slate-500">Save your work without submitting</p>
                  </div>
                </div>
                <button
                  onClick={handleManualSave}
                  disabled={saving}
                  className="w-full px-4 py-3 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-md transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {saving ? (
                    <>
                      <div className="w-4 h-4 border-2 border-slate-400 border-t-slate-600 rounded-full animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4" />
                      Save Draft
                    </>
                  )}
                </button>
                <p className="text-xs text-slate-500 mt-2 text-center">
                  Auto-saves every 30 seconds
                </p>
              </div>

              <div className="w-px bg-slate-200 self-stretch" />

              <div className="flex-1">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 bg-red-50 rounded-lg">
                    <Send className="h-5 w-5 text-red-600" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">Submit to Employer</h3>
                    <p className="text-xs text-red-600 font-medium">Final submission - cannot be edited</p>
                  </div>
                </div>
                <button
                  onClick={handleSubmitClick}
                  disabled={submitting || timesheetData.total_hours === 0}
                  className="w-full px-4 py-3 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md transition-colors disabled:bg-slate-300 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {submitting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4" />
                      Submit for Compliance
                    </>
                  )}
                </button>
                {timesheetData.total_hours === 0 && (
                  <p className="text-xs text-slate-500 mt-2 text-center">
                    Add exposure time to enable submission
                  </p>
                )}
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-200">
              <div className="flex items-center justify-center gap-2 text-sm text-slate-600">
                <Clock className="h-4 w-4" />
                <span>Weekly Exposure: <strong className="text-amber-600">{formatMinutes(timesheetData.total_hours)} minutes</strong></span>
                {timesheetData.total_hours > 0 && (
                  <span className="text-slate-400">({(timesheetData.total_hours / 60).toFixed(1)} hours)</span>
                )}
              </div>
            </div>
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
                <h3 className="text-lg font-semibold text-slate-900">Confirm Submission</h3>
              </div>
            </div>

            <div className="p-6">
              <div className="mb-6">
                <p className="text-sm text-slate-700 mb-4">
                  You are about to submit your HAVs exposure record for compliance review.
                </p>

                <div className="bg-amber-50 border border-amber-200 rounded-md p-4 space-y-2">
                  <div className="flex items-start gap-2">
                    <Shield className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-amber-800">
                      <strong>This submission is final.</strong> Once submitted, this record cannot be edited.
                    </p>
                  </div>
                  <div className="flex items-start gap-2">
                    <FileText className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-amber-800">
                      This record will be used for <strong>HSE compliance and audits</strong>.
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
                      {formatMinutes(timesheetData.total_hours)} minutes
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
                      Confirm Submission
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
