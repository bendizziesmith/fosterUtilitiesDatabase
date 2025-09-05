import React, { useState, useEffect } from 'react';
import { Save, Send, ArrowLeft, HardHat, Clock, CheckCircle, AlertTriangle } from 'lucide-react';
import { supabase, Employee, HavsTimesheet, HavsTimesheetEntry, getWeekEndDate } from '../../../lib/supabase';

interface HavsTimesheetFormProps {
  selectedEmployee: Employee;
  onBack: () => void;
}

interface EquipmentItem {
  name: string;
  category: 'CIVILS' | 'JOINTING' | 'OVERHEADS' | 'EARTH PIN DRIVER';
}

const EQUIPMENT_ITEMS: EquipmentItem[] = [
  // CIVILS
  { name: 'Petrol Cut - Off Saw', category: 'CIVILS' },
  { name: 'NRSWA Vibrating Plate', category: 'CIVILS' },
  { name: 'Hydraulic Breaker', category: 'CIVILS' },
  { name: 'Vibro - Tamper', category: 'CIVILS' },
  
  // JOINTING
  { name: 'Impact Wrench', category: 'JOINTING' },
  { name: 'Combo Hammer Drill', category: 'JOINTING' },
  { name: 'Recip Saw', category: 'JOINTING' },
  { name: 'Angle Grinder', category: 'JOINTING' },
  { name: 'Hammer Drill', category: 'JOINTING' },
  { name: 'Impact Driver', category: 'JOINTING' },
  
  // OVERHEADS
  { name: 'Chainsaw', category: 'OVERHEADS' },
  { name: 'Petrol Auger', category: 'OVERHEADS' },
  { name: 'Battery Recip Saw', category: 'OVERHEADS' },
  { name: 'Battery Impact Gun', category: 'OVERHEADS' },
  { name: 'Battery Angle Grinder', category: 'OVERHEADS' },
  { name: 'Hydraulic Duckbill Driver', category: 'OVERHEADS' },
  
  // EARTH PIN DRIVER
  { name: 'K900 Chipping Hammer', category: 'EARTH PIN DRIVER' },
];

interface TimesheetData {
  id?: string;
  employee_name: string;
  employee_no: string;
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
  const [timesheetData, setTimesheetData] = useState<TimesheetData>({
    employee_name: selectedEmployee.full_name,
    employee_no: selectedEmployee.id.slice(-6).toUpperCase(),
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

  useEffect(() => {
    loadExistingTimesheet();
  }, [selectedEmployee.id, timesheetData.week_ending]);

  useEffect(() => {
    // Auto-save every 30 seconds
    const interval = setInterval(() => {
      if (timesheetData.status === 'draft') {
        autoSave();
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [timesheetData]);

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
        
        // Initialize all equipment items first
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
        
        // Then override with existing data
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
          employee_no: existingTimesheet.employee_no || selectedEmployee.id.slice(-6).toUpperCase(),
          week_ending: existingTimesheet.week_ending,
          comments: existingTimesheet.comments || '',
          actions: existingTimesheet.actions || '',
          supervisor_name: existingTimesheet.supervisor_name || '',
          entries: entriesMap,
          status: existingTimesheet.status,
          total_hours: existingTimesheet.total_hours || 0,
        });
      } else {
        // Initialize empty entries for all equipment
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

  const updateHours = (equipmentName: string, day: string, hours: number) => {
    console.log('Updating hours for:', equipmentName, day, hours);
    
    setTimesheetData(prev => {
      const updatedEntries = { ...prev.entries };
      const entry = updatedEntries[equipmentName];
      
      if (entry) {
        const updatedEntry = { 
          ...entry, 
          [`${day}_hours`]: Math.max(0, Math.round(hours)) // Ensure non-negative
        };
        
        // Calculate total minutes for this equipment
        updatedEntry.total_hours = 
          updatedEntry.monday_hours +
          updatedEntry.tuesday_hours +
          updatedEntry.wednesday_hours +
          updatedEntry.thursday_hours +
          updatedEntry.friday_hours +
          updatedEntry.saturday_hours +
          updatedEntry.sunday_hours;
        
        updatedEntries[equipmentName] = updatedEntry;
      } else {
        console.warn('Entry not found for equipment:', equipmentName);
      }

      // Calculate total minutes for entire timesheet
      const totalHours = Object.values(updatedEntries).reduce((sum, entry) => sum + entry.total_hours, 0);

      return {
        ...prev,
        entries: updatedEntries,
        total_hours: totalHours,
      };
    });

    // Auto-save after a short delay
    setTimeout(() => {
      if (timesheetData.status === 'draft') {
        autoSave();
      }
    }, 1000);
  };

  const updateField = (field: keyof TimesheetData, value: string) => {
    setTimesheetData(prev => ({ ...prev, [field]: value }));
    
    // Auto-save after a short delay
    setTimeout(() => {
      if (timesheetData.status === 'draft') {
        autoSave();
      }
    }, 2000);
  };

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
    let timesheetId = timesheetData.id;

    // Create or update timesheet
    if (timesheetId) {
      const { error } = await supabase
        .from('havs_timesheets')
        .update({
          employee_name: timesheetData.employee_name,
          employee_no: timesheetData.employee_no,
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
          employee_no: timesheetData.employee_no,
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
      setTimesheetData(prev => ({ ...prev, id: timesheetId }));
    }

    // Save entries
    for (const entry of Object.values(timesheetData.entries)) {
      if (entry.id) {
        // Update existing entry
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
        // Create new entry only if there are hours
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
        
        // Update local state with new entry ID
        setTimesheetData(prev => ({
          ...prev,
          entries: {
            ...prev.entries,
            [entry.equipment_name]: { ...entry, id: newEntry.id }
          }
        }));
      }
    }
  };

  const handleSubmit = async () => {
    if (timesheetData.total_hours === 0) {
      alert('Please add some hours before submitting');
      return;
    }

    setSubmitting(true);
    
    try {
      await saveTimesheet();
      
      // Update status to submitted
      const { error } = await supabase
        .from('havs_timesheets')
        .update({
          status: 'submitted',
          submitted_at: new Date().toISOString(),
        })
        .eq('id', timesheetData.id);

      if (error) throw error;

      setTimesheetData(prev => ({ ...prev, status: 'submitted' }));
      alert('HAVs timesheet submitted successfully!');
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
    return isNaN(parsed) ? 0 : Math.round(parsed); // Round to whole minutes
  };

  const groupedEquipment = EQUIPMENT_ITEMS.reduce((acc, item) => {
    if (!acc[item.category]) {
      acc[item.category] = [];
    }
    acc[item.category].push(item);
    return acc;
  }, {} as Record<string, EquipmentItem[]>);

  const isReadOnly = timesheetData.status === 'submitted';

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <button
              onClick={onBack}
              className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <ArrowLeft className="h-5 w-5 text-slate-600" />
            </button>
            <div className="flex items-center space-x-3">
              <div className="p-3 bg-orange-100 rounded-lg">
                <HardHat className="h-6 w-6 text-orange-600" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900">HAVs Timesheet</h1>
                <p className="text-slate-600">Hand Arm Vibration Syndrome Exposure Record</p>
              </div>
            </div>
          </div>
          
          <div className="flex items-center space-x-3">
            {/* Auto-save status */}
            <div className="flex items-center space-x-2 text-sm">
              {saving ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                  <span className="text-blue-600">Saving...</span>
                </>
              ) : lastSaved ? (
                <>
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <span className="text-green-600">
                    Saved {lastSaved.toLocaleTimeString()}
                  </span>
                </>
              ) : saveError ? (
                <>
                  <AlertTriangle className="h-4 w-4 text-red-600" />
                  <span className="text-red-600">Save failed</span>
                </>
              ) : null}
            </div>

            {timesheetData.status === 'submitted' && (
              <div className="flex items-center space-x-2 bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm font-medium">
                <CheckCircle className="h-4 w-4" />
                <span>Submitted</span>
              </div>
            )}
          </div>
        </div>

        {/* Basic Information */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Employee Name</label>
            <input
              type="text"
              value={timesheetData.employee_name}
              onChange={(e) => updateField('employee_name', e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              readOnly={isReadOnly}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Employee No:</label>
            <input
              type="text"
              value={timesheetData.employee_no}
              onChange={(e) => updateField('employee_no', e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              readOnly={isReadOnly}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Week Ending:</label>
            <input
              type="date"
              value={timesheetData.week_ending}
              onChange={(e) => updateField('week_ending', e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              readOnly={isReadOnly}
            />
          </div>
        </div>
      </div>

      {/* Equipment Table */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="bg-slate-100 p-4">
          <h2 className="text-lg font-semibold text-slate-900 text-center">
            EXPOSURE TIME IN MINUTES AGAINST THE EQUIPMENT USED
          </h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-slate-50">
                <th className="border border-slate-300 px-4 py-3 text-left text-sm font-medium text-slate-700">
                  Description of Equipment
                </th>
                <th className="border border-slate-300 px-4 py-3 text-center text-sm font-medium text-slate-700">Monday</th>
                <th className="border border-slate-300 px-4 py-3 text-center text-sm font-medium text-slate-700">Tuesday</th>
                <th className="border border-slate-300 px-4 py-3 text-center text-sm font-medium text-slate-700">Wednesday</th>
                <th className="border border-slate-300 px-4 py-3 text-center text-sm font-medium text-slate-700">Thursday</th>
                <th className="border border-slate-300 px-4 py-3 text-center text-sm font-medium text-slate-700">Friday</th>
                <th className="border border-slate-300 px-4 py-3 text-center text-sm font-medium text-slate-700">Saturday</th>
                <th className="border border-slate-300 px-4 py-3 text-center text-sm font-medium text-slate-700">Sunday</th>
                <th className="border border-slate-300 px-4 py-3 text-center text-sm font-medium text-slate-700 bg-blue-50">Total (min)</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(groupedEquipment).map(([category, items]) => (
                <React.Fragment key={category}>
                  {/* Category Header */}
                  <tr>
                    <td 
                      colSpan={8} 
                      className="border border-slate-300 bg-slate-200 px-4 py-2 text-sm font-bold text-slate-900 text-center"
                    >
                      {category}
                    </td>
                  </tr>
                  
                  {/* Equipment Items */}
                  {items.map((item) => {
                    const entry = timesheetData.entries[item.name];
                    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
                    
                    return (
                      <tr key={item.name} className="hover:bg-slate-50">
                        <td className="border border-slate-300 px-4 py-3 text-sm text-slate-900 font-medium">
                          {item.name}
                        </td>
                        {days.map((day) => (
                          <td key={day} className="border border-slate-300 px-2 py-2">
                            <input
                              type="number"
                              min="0"
                              max="1440"
                              value={entry && entry[`${day}_hours` as keyof HavsTimesheetEntry] !== undefined 
                                ? (entry[`${day}_hours` as keyof HavsTimesheetEntry] as number || 0).toString()
                                : '0'}
                              onChange={(e) => updateHours(item.name, day, parseMinutes(e.target.value))}
                              onFocus={(e) => e.target.select()}
                              className="w-full px-2 py-1 text-center border-0 bg-transparent focus:bg-white focus:ring-2 focus:ring-orange-500 rounded transition-all duration-200 text-sm"
                              placeholder="0"
                              readOnly={isReadOnly}
                            />
                          </td>
                        ))}
                        <td className="border border-slate-300 px-4 py-3 text-center text-sm font-bold text-blue-700 bg-blue-50">
                          {entry && entry.total_hours !== undefined ? entry.total_hours.toString() : '0'}
                        </td>
                      </tr>
                    );
                  })}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>

        {/* Total Hours Summary */}
        <div className="bg-blue-50 border-t border-slate-300 p-4">
          <div className="text-center">
            <div className="text-lg font-bold text-blue-700">
              Total Weekly Exposure: {formatMinutes(timesheetData.total_hours)} minutes
            </div>
            {timesheetData.total_hours > 0 && (
              <div className="text-sm text-blue-600">
                ({(timesheetData.total_hours / 60).toFixed(1)} hours)
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Comments and Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">Comments</h3>
          <textarea
            value={timesheetData.comments}
            onChange={(e) => updateField('comments', e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
            rows={6}
            placeholder="Add any comments about equipment usage..."
            readOnly={isReadOnly}
          />
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">Actions</h3>
          <textarea
            value={timesheetData.actions}
            onChange={(e) => updateField('actions', e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
            rows={6}
            placeholder="Record any actions taken or required..."
            readOnly={isReadOnly}
          />
        </div>
      </div>

      {/* Supervisor Section */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Supervisor Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Supervisor Name</label>
            <input
              type="text"
              value={timesheetData.supervisor_name}
              onChange={(e) => updateField('supervisor_name', e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              placeholder="Enter supervisor name..."
              readOnly={isReadOnly}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Supervisor Signature</label>
            <input
              type="text"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-slate-50"
              placeholder="Digital signature (to be added)"
              readOnly
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Date</label>
            <input
              type="date"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-slate-50"
              value={new Date().toISOString().split('T')[0]}
              readOnly
            />
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      {!isReadOnly && (
        <div className="bg-white rounded-xl shadow-sm p-6">
          <div className="flex items-center justify-between">
            <div className="text-sm text-slate-600">
              {lastSaved && (
                <span>Last saved: {lastSaved.toLocaleTimeString()}</span>
              )}
              {saveError && (
                <span className="text-red-600">{saveError}</span>
              )}
            </div>
            
            <div className="flex space-x-3">
              <button
                onClick={autoSave}
                disabled={saving}
                className="flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg transition-colors"
              >
                <Save className="h-4 w-4" />
                <span>{saving ? 'Saving...' : 'Save Now'}</span>
              </button>
              
              <button
                onClick={handleSubmit}
                disabled={submitting || timesheetData.total_hours === 0}
                className="flex items-center space-x-2 px-6 py-2 bg-green-600 hover:bg-green-700 disabled:bg-slate-400 text-white rounded-lg transition-colors"
              >
                <Send className="h-4 w-4" />
                <span>{submitting ? 'Submitting...' : 'Submit to Employer'}</span>
              </button>
            </div>
          </div>
          
          <div className="mt-4 text-center">
            <div className="text-lg font-bold text-orange-600">
              <Clock className="h-5 w-5 inline mr-2" />
              Total Weekly Exposure: {formatMinutes(timesheetData.total_hours)} minutes
            </div>
            <p className="text-sm text-slate-600 mt-1">
              Auto-saves every 30 seconds • Enter time in minutes
            </p>
          </div>
        </div>
      )}

      {isReadOnly && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
          <div className="flex items-center justify-center space-x-2 text-green-800">
            <CheckCircle className="h-5 w-5" />
            <span className="font-medium">This timesheet has been submitted to your employer</span>
          </div>
          <p className="text-green-700 text-sm mt-2">
            No further changes can be made. Contact your supervisor if corrections are needed.
          </p>
        </div>
      )}
    </div>
  );
};