import React, { useState } from 'react';
import { Plus, Trash2, FileText, Clock, ArrowLeft, CheckCircle } from 'lucide-react';
import { ChooseRateTypeModal } from '../../components/timesheets/ChooseRateTypeModal';
import { PriceWorkWizard, PriceWorkEntry } from '../../components/timesheets/PriceWorkWizard';
import { DayRateWizard, DayRateEntry } from '../../components/timesheets/DayRateWizard';
import { TimesheetEntryCard } from '../../components/TimesheetEntryCard';
import { supabase, Employee, getWeekEndDate } from '../../lib/supabase';

interface NewTimesheetFormProps {
  mode?: 'ipsom' | 'mollsworth';
  selectedEmployee: Employee | null;
  onJobAdded: (jobNumber: string, totalValue: number) => void;
  onBack: () => void;
}

interface TimesheetSuccessProps {
  jobNumber: string;
  totalValue: number;
  onNewTimesheet: () => void;
}

const TimesheetSuccessMessage: React.FC<TimesheetSuccessProps> = ({
  jobNumber,
  totalValue,
  onNewTimesheet,
}) => {
  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white rounded-xl shadow-sm p-8 text-center">
        <div className="mb-6">
          <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
            <CheckCircle className="h-8 w-8 text-green-600" />
          </div>
          
          <h2 className="text-2xl font-semibold text-slate-900 mb-2">
            You have added timesheet
          </h2>
          
          <div className="text-slate-600 mb-4">
            <div className="flex items-center justify-center space-x-2 mb-2">
              <FileText className="h-4 w-4" />
              <span className="font-medium">Job Number: {jobNumber}</span>
            </div>
            <div className="text-lg font-semibold text-green-600">
              Total Value: £{totalValue.toFixed(2)}
            </div>
          </div>
          
          <div className="bg-green-50 border border-green-200 rounded-lg p-6 mb-6">
            <p className="text-green-800">
              Your job has been added to your timesheet successfully. You can add more jobs throughout the week and submit your complete timesheet from "My Timesheet" page.
            </p>
            
            <div className="mt-4 pt-4 border-t border-green-200">
              <p className="text-green-700 text-sm">
                The job is saved as a draft. Go to "My Timesheet" to add more jobs or submit your complete week when ready.
              </p>
            </div>
          </div>
        </div>
        
        <button
          onClick={onNewTimesheet}
          className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-6 rounded-lg transition-colors flex items-center justify-center mx-auto space-x-2"
        >
          <FileText className="h-4 w-4" />
          <span>Go to My Timesheet</span>
        </button>
      </div>
    </div>
  );
};
interface FormData {
  jobNumber: string;
  teamName: string;
  address: string;
  weekEnding: string;
  workingDays: {
    Monday: boolean;
    Tuesday: boolean;
    Wednesday: boolean;
    Thursday: boolean;
    Friday: boolean;
    Saturday: boolean;
    Sunday: boolean;
  };
}

interface FormErrors {
  jobNumber?: string;
  teamName?: string;
  address?: string;
  weekEnding?: string;
  workingDays?: string;
  entries?: string;
}

export const NewTimesheetForm: React.FC<NewTimesheetFormProps> = ({
  mode,
  selectedEmployee,
  onJobAdded,
  onBack,
}) => {
  const [showSuccess, setShowSuccess] = useState(false);
  const [submittedJobNumber, setSubmittedJobNumber] = useState('');
  const [submittedTotalValue, setSubmittedTotalValue] = useState(0);
  
  // Validation modal state
  const [showValidationModal, setShowValidationModal] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  
  const [formData, setFormData] = useState<FormData>({
    jobNumber: '',
    teamName: selectedEmployee?.name || '',
    teamName: selectedEmployee?.full_name || '',
    address: '',
    weekEnding: getWeekEndDate().toISOString().split('T')[0],
    workingDays: {
      Monday: false,
      Tuesday: false,
      Wednesday: false,
      Thursday: false,
      Friday: false,
      Saturday: false,
      Sunday: false,
    },
  });

  const [priceWorkEntries, setPriceWorkEntries] = useState<PriceWorkEntry[]>([]);
  const [dayRateEntries, setDayRateEntries] = useState<DayRateEntry[]>([]);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);

  // Modal states
  const [showChooseRateModal, setShowChooseRateModal] = useState(false);
  const [showPriceWorkWizard, setShowPriceWorkWizard] = useState(false);
  const [showDayRateWizard, setShowDayRateWizard] = useState(false);
  const [currentMode, setCurrentMode] = useState<'ipsom' | 'mollsworth'>(mode || 'ipsom');

  const handleChooseRateType = (selectedMode: 'ipsom' | 'mollsworth') => {
    setCurrentMode(selectedMode);
    setShowChooseRateModal(false);
    setShowPriceWorkWizard(true);
  };

  const handleAddPriceWorkEntry = (entry: PriceWorkEntry) => {
    setPriceWorkEntries(prev => [...prev, entry]);
    setErrors(prev => ({ ...prev, entries: undefined }));
  };

  const handleAddDayRateEntry = (entry: DayRateEntry) => {
    // Simple deduplication: check if entry with same ID already exists
    setDayRateEntries(prev => {
      const existingIds = new Set(prev.map(e => e.id));
      if (existingIds.has(entry.id)) {
        console.warn('Duplicate day rate entry prevented:', entry.id);
        return prev; // Don't add duplicate
      }
      return [...prev, entry];
    });
    setErrors(prev => ({ ...prev, entries: undefined }));
  };

  
  const removePriceWorkEntry = (id: string) => {
    setPriceWorkEntries(prev => prev.filter(entry => entry.id !== id));
  };

  const removeDayRateEntry = (id: string) => {
    setDayRateEntries(prev => prev.filter(entry => entry.id !== id));
  };

  const updateFormField = <K extends keyof FormData>(field: K, value: FormData[K]) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setErrors(prev => ({ ...prev, [field]: undefined }));
  };

  const updateWorkingDay = (day: keyof FormData['workingDays'], checked: boolean) => {
    setFormData(prev => ({
      ...prev,
      workingDays: { ...prev.workingDays, [day]: checked }
    }));
  };

  const getTotalValue = () => {
    const priceWorkTotal = priceWorkEntries.reduce((sum, entry) => sum + entry.total, 0);
    const dayRateTotal = dayRateEntries.reduce((sum, entry) => sum + entry.total, 0);
    return priceWorkTotal + dayRateTotal;
  };

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};
    const validationErrorsList: string[] = [];

    if (!formData.jobNumber.trim()) {
      newErrors.jobNumber = 'Job number is required';
      validationErrorsList.push('Job Number');
    }

    if (!formData.teamName.trim()) {
      newErrors.teamName = 'Team name is required';
      validationErrorsList.push('Team Name');
    }

    if (!formData.address.trim()) {
      newErrors.address = 'Address is required';
      validationErrorsList.push('Address');
    }

    if (!formData.weekEnding) {
      newErrors.weekEnding = 'Week ending date is required';
      validationErrorsList.push('Week Ending Date');
    }

    // Check if at least one working day is selected
    const selectedWorkingDays = Object.values(formData.workingDays).filter(Boolean);
    if (selectedWorkingDays.length === 0) {
      newErrors.workingDays = 'At least one working day must be selected';
      validationErrorsList.push('At least one Working Day');
    }
    if (priceWorkEntries.length === 0 && dayRateEntries.length === 0) {
      newErrors.entries = 'At least one price work or day rate entry is required';
      validationErrorsList.push('At least one Price Work or Day Rate entry');
    }

    setErrors(newErrors);
    setValidationErrors(validationErrorsList);
    
    if (validationErrorsList.length > 0) {
      setShowValidationModal(true);
    }
    
    return Object.keys(newErrors).length === 0;
  };

  const handleAddJob = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm() || !selectedEmployee) return;

    setSubmitting(true);
    
    try {
      // Check if a draft timesheet already exists for this week
      const { data: existingTimesheet, error: checkError } = await supabase
        .from('new_timesheets')
        .select('*')
        .eq('employee_id', selectedEmployee.id)
        .eq('week_ending', formData.weekEnding)
        .eq('job_number', formData.jobNumber)
        .eq('status', 'draft')
        .maybeSingle();

      if (checkError) throw checkError;

      let timesheet;
      
      if (existingTimesheet) {
        // Update existing timesheet
        const { data: updatedTimesheet, error: updateError } = await supabase
          .from('new_timesheets')
          .update({
            team_name: formData.teamName,
            address: formData.address,
            total_value: (existingTimesheet.total_value || 0) + getTotalValue(),
          })
          .eq('id', existingTimesheet.id)
          .select()
          .single();

        if (updateError) throw updateError;
        timesheet = updatedTimesheet;
      } else {
        // Create new timesheet
        const { data: newTimesheet, error: timesheetError } = await supabase
          .from('new_timesheets')
          .insert({
            employee_id: selectedEmployee.id,
            team_name: formData.teamName,
            job_number: formData.jobNumber,
            address: formData.address,
            week_ending: formData.weekEnding,
            status: 'draft',
            total_value: getTotalValue(),
          })
          .select()
          .single();

        if (timesheetError) throw timesheetError;
        timesheet = newTimesheet;
      }

      // Create job entries
      const entries = [];

      // Add price work entries
      for (const entry of priceWorkEntries) {
        // Set working days based on form selection (8 hours per selected day for price work)
        const hoursPerDay = 8; // Standard 8 hours per working day
        
        const entryData: any = {
          timesheet_id: timesheet.id,
          quantity: entry.quantity,
          line_total: entry.total,
          // Set working days from form
          monday: formData.workingDays.Monday ? hoursPerDay : 0,
          tuesday: formData.workingDays.Tuesday ? hoursPerDay : 0,
          wednesday: formData.workingDays.Wednesday ? hoursPerDay : 0,
          thursday: formData.workingDays.Thursday ? hoursPerDay : 0,
          friday: formData.workingDays.Friday ? hoursPerDay : 0,
          saturday: formData.workingDays.Saturday ? hoursPerDay : 0,
          sunday: formData.workingDays.Sunday ? hoursPerDay : 0,
          total_hours: Object.values(formData.workingDays).filter(Boolean).length * hoursPerDay,
        };

        if (entry.type === 'ipsom') {
          entryData.ipsom_rate_id = entry.rateId;
        } else {
          entryData.mollsworth_rate_id = entry.rateId;
        }

        entries.push(entryData);
      }

      // Add day rate entries
      for (const entry of dayRateEntries) {
        // For day rate entries, set hours on the specific day (10 hours per day)
        const dayKey = entry.day.toLowerCase();
        
        entries.push({
          timesheet_id: timesheet.id,
          quantity: entry.hours,
          line_total: entry.total,
          // Set hours for the specific day rate day
          monday: dayKey === 'monday' ? entry.hours : (formData.workingDays.Monday ? 10 : 0),
          tuesday: dayKey === 'tuesday' ? entry.hours : (formData.workingDays.Tuesday ? 10 : 0),
          wednesday: dayKey === 'wednesday' ? entry.hours : (formData.workingDays.Wednesday ? 10 : 0),
          thursday: dayKey === 'thursday' ? entry.hours : (formData.workingDays.Thursday ? 10 : 0),
          friday: dayKey === 'friday' ? entry.hours : (formData.workingDays.Friday ? 10 : 0),
          saturday: dayKey === 'saturday' ? entry.hours : (formData.workingDays.Saturday ? 10 : 0),
          sunday: dayKey === 'sunday' ? entry.hours : (formData.workingDays.Sunday ? 10 : 0),
          total_hours: entry.hours,
        });
      }

      if (entries.length > 0) {
        const { error: entriesError } = await supabase
          .from('timesheet_entries')
          .insert(entries);

        if (entriesError) throw entriesError;
      }

      // Show success message and navigate to timesheet list
      setSubmittedJobNumber(formData.jobNumber);
      setSubmittedTotalValue(getTotalValue());
      setShowSuccess(true);
    } catch (error) {
      console.error('Error adding job to timesheet:', error);
      alert('Failed to add job to timesheet. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleNewTimesheet = () => {
    setShowSuccess(false);
    // Navigate directly to timesheet list page
    onBack(); // This will take us back to the timesheet list
  };

  // Show success message if timesheet was submitted
  if (showSuccess) {
    return (
      <TimesheetSuccessMessage
        jobNumber={submittedJobNumber}
        totalValue={submittedTotalValue}
        onNewTimesheet={handleNewTimesheet}
      />
    );
  }
  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <button
              onClick={onBack}
              className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <ArrowLeft className="h-5 w-5 text-slate-600" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">
                New Timesheet{mode ? ` - ${mode === 'ipsom' ? 'Ipsom' : 'Mollsworth'}` : ''}
              </h1>
              <p className="text-slate-600">{selectedEmployee?.full_name} - {selectedEmployee?.role}</p>
            </div>
          </div>
        </div>
      </div>

      <form onSubmit={handleAddJob} className="space-y-8">
        {/* Basic Information */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-6">Basic Information</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Job Number *
              </label>
              <input
                type="text"
                value={formData.jobNumber}
                onChange={(e) => updateFormField('jobNumber', e.target.value)}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                  errors.jobNumber ? 'border-red-300' : 'border-slate-300'
                }`}
                placeholder="Enter job number..."
              />
              {errors.jobNumber && (
                <p className="mt-1 text-sm text-red-600">{errors.jobNumber}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Team Name *
              </label>
              <input
                type="text"
                value={formData.teamName}
                onChange={(e) => updateFormField('teamName', e.target.value)}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                  errors.teamName ? 'border-red-300' : 'border-slate-300'
                }`}
                placeholder="Team name..."
                readOnly
              />
              {errors.teamName && (
                <p className="mt-1 text-sm text-red-600">{errors.teamName}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Address
              </label>
              <input
                type="text"
                value={formData.address}
                onChange={(e) => updateFormField('address', e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter job address..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Week Ending *
              </label>
              <input
                type="date"
                value={formData.weekEnding}
                onChange={(e) => updateFormField('weekEnding', e.target.value)}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                  errors.weekEnding ? 'border-red-300' : 'border-slate-300'
                }`}
                onFocus={(e) => {
                  // Only allow Sundays to be selected
                  const today = new Date();
                  const currentSunday = new Date(today);
                  currentSunday.setDate(today.getDate() + (7 - today.getDay()) % 7);
                  
                  // Set min to current Sunday
                  e.target.min = currentSunday.toISOString().split('T')[0];
                  
                  // Add event listener to only allow Sundays
                  e.target.addEventListener('input', (event) => {
                    const selectedDate = new Date(event.target.value);
                    if (selectedDate.getDay() !== 0) { // 0 = Sunday
                      // Find the next Sunday
                      const nextSunday = new Date(selectedDate);
                      nextSunday.setDate(selectedDate.getDate() + (7 - selectedDate.getDay()));
                      event.target.value = nextSunday.toISOString().split('T')[0];
                      updateFormField('weekEnding', nextSunday.toISOString().split('T')[0]);
                    }
                  });
                }}
              />
              <p className="mt-1 text-xs text-slate-500">
                Week ending must be a Sunday
              </p>
              {errors.weekEnding && (
                <p className="mt-1 text-sm text-red-600">{errors.weekEnding}</p>
              )}
            </div>
          </div>
        </div>

        {/* Working Days */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-6">Working Days</h2>
          
          <div className="grid grid-cols-7 gap-3">
            {Object.entries(formData.workingDays).map(([day, checked]) => (
              <button
                key={day}
                type="button"
                onClick={() => updateWorkingDay(day as keyof FormData['workingDays'], !checked)}
                className={`flex flex-col items-center space-y-2 p-3 rounded-lg border-2 transition-all duration-200 ${
                  checked
                    ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-sm'
                    : 'border-slate-300 hover:border-blue-400 hover:bg-blue-50 text-slate-600'
                }`}
              >
                <span className={`text-xs font-medium ${
                  checked ? 'text-blue-700' : 'text-slate-700'
                }`}>
                  {day.slice(0, 3)}
                </span>
                <span className={`text-xs capitalize font-medium ${
                  checked ? 'text-blue-600' : 'text-slate-500'
                }`}>
                  {day}
                </span>
                {checked && (
                  <div className="w-2 h-2 bg-blue-600 rounded-full"></div>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Price Work Section */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-slate-900">Price Work</h2>
            <button
              type="button"
              onClick={() => mode ? setShowPriceWorkWizard(true) : setShowChooseRateModal(true)}
              className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
            >
              <Plus className="h-4 w-4" />
              <span>Add Price Work</span>
            </button>
          </div>

          {priceWorkEntries.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              <FileText className="h-12 w-12 mx-auto mb-4 text-slate-400" />
              <p>No price work entries added yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {priceWorkEntries.map((entry) => {
                // Convert PriceWorkEntry to format expected by TimesheetEntryCard
                const cardEntry = entry.type === 'ipsom' ? {
                  id: entry.id,
                  workItem: entry.workItem,
                  col2: entry.col2,
                  col3: entry.col3,
                  col4: entry.col4,
                  quantity: entry.quantity,
                  rate: entry.rate,
                  total: entry.total
                } : {
                  id: entry.id,
                  workItem: entry.workItem,
                  voltage: entry.col2,
                  excavation: entry.col3,
                  site: entry.col4,
                  quantity: entry.quantity,
                  rate: entry.rate,
                  total: entry.total
                };
                
                return (
                  <TimesheetEntryCard
                    key={entry.id}
                    entry={cardEntry}
                    onDelete={() => removePriceWorkEntry(entry.id)}
                  />
                );
              })}
            </div>
          )}
        </div>

        {/* Day Rate Section */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-slate-900">Day Rate</h2>
            <button
              type="button"
              onClick={() => setShowDayRateWizard(true)}
              className="flex items-center space-x-2 bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-lg transition-colors"
            >
              <Plus className="h-4 w-4" />
              <span>Add Day Rate</span>
            </button>
          </div>

          {dayRateEntries.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              <Clock className="h-12 w-12 mx-auto mb-4 text-slate-400" />
              <p>No day rate entries added yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {dayRateEntries.map((entry) => (
                <TimesheetEntryCard
                  key={entry.id}
                  entry={{
                    id: entry.id,
                    day: entry.day,
                    hours: entry.hours,
                    reason: entry.reason || '',
                    supervisorName: entry.supervisor || '',
                    total: entry.total
                  }}
                  onDelete={() => removeDayRateEntry(entry.id)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Entries Error */}
        {errors.entries && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-800 text-sm">{errors.entries}</p>
          </div>
        )}

        {/* Total & Submit */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Total Value</h2>
              <div className="text-3xl font-bold text-green-600">£{getTotalValue().toFixed(2)}</div>
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 text-white font-medium py-3 px-8 rounded-lg transition-colors"
            >
              {submitting ? 'Adding Job...' : 'Add Job to My Timesheet'}
            </button>
          </div>
        </div>
      </form>

      {/* Validation Error Modal */}
      {showValidationModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full">
            <div className="p-6">
              <div className="flex items-center justify-center mb-4">
                <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.268 18.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                </div>
              </div>
              
              <h3 className="text-xl font-bold text-slate-900 text-center mb-4">
                Missing Required Information
              </h3>
              
              <p className="text-slate-600 text-center mb-6">
                Please complete the following required fields before adding the job to your timesheet:
              </p>
              
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
                <ul className="space-y-2">
                  {validationErrors.map((error, index) => (
                    <li key={index} className="flex items-center text-red-800">
                      <svg className="w-4 h-4 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                      </svg>
                      <span className="font-medium">{error}</span>
                    </li>
                  ))}
                </ul>
              </div>
              
              <button
                onClick={() => {
                  setShowValidationModal(false);
                  setValidationErrors([]);
                }}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-lg transition-colors"
              >
                OK, I'll Complete These Fields
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      <ChooseRateTypeModal
        isOpen={showChooseRateModal}
        onClose={() => setShowChooseRateModal(false)}
        onSelect={handleChooseRateType}
      />

      <PriceWorkWizard
        isOpen={showPriceWorkWizard}
        onClose={() => setShowPriceWorkWizard(false)}
        mode={currentMode}
        onAddEntry={handleAddPriceWorkEntry}
      />

      <DayRateWizard
        isOpen={showDayRateWizard}
        onClose={() => setShowDayRateWizard(false)}
        onAddEntry={handleAddDayRateEntry}
        employeeRate={selectedEmployee?.rate || 38.00}
        onWorkingDaysUpdate={(days) => {
          // Auto-select working days based on day rate selection
          const newWorkingDays = { ...formData.workingDays };
          
          // Reset all days to false first
          Object.keys(newWorkingDays).forEach(day => {
            newWorkingDays[day as keyof FormData['workingDays']] = false;
          });
          
          // Set selected days to true
          days.forEach(day => {
            newWorkingDays[day as keyof FormData['workingDays']] = true;
          });
          
          setFormData(prev => ({
            ...prev,
            workingDays: newWorkingDays
          }));
        }}
      />
    </div>
  );
};