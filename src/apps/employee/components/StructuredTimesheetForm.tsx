import React, { useState, useEffect } from 'react';
import { Calendar, Clock, Plus, Trash2, FileText, Save, Copy, MapPin, AlertTriangle } from 'lucide-react';
import { supabase, Employee, JobEntry, StructuredTimesheet, getWeekEndDate } from '../../../lib/supabase';

interface StructuredTimesheetFormProps {
  selectedEmployee: Employee;
  onSubmissionSuccess: () => void;
  editingTimesheet?: StructuredTimesheet | null;
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const FULL_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

interface ExtendedJobEntry extends JobEntry {
  id: string;
  day: string;
  completed: boolean;
}

interface WorkDayValidation {
  person: string;
  day: string;
  hasFullDay: boolean;
  reason?: string;
}

export const StructuredTimesheetForm: React.FC<StructuredTimesheetFormProps> = ({
  selectedEmployee,
  onSubmissionSuccess,
  editingTimesheet = null,
}) => {
  const [formData, setFormData] = useState({
    weekEnding: getWeekEndDate().toISOString().split('T')[0],
    sheetNumber: '',
    ganger: '',
    labourer: '',
    workDays: {} as Record<string, string[]>,
    standbyMonThu: [] as string[], // Monday-Thursday standby
    standbyFriSun: [] as string[], // Friday-Sunday standby
    jobEntries: [] as ExtendedJobEntry[],
    summaryHours: {
      basicShift: {} as Record<string, number>,
      overtime: {} as Record<string, number>,
    },
    workDayReasons: {} as Record<string, string>, // For incomplete work days
    notes: '',
    status: 'draft' as 'draft' | 'submitted',
  });

  const [submitting, setSubmitting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [existingTimesheetId, setExistingTimesheetId] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);

  // Load existing timesheet on component mount
  useEffect(() => {
    if (editingTimesheet) {
      // Load the specific timesheet being edited
      loadEditingTimesheet(editingTimesheet);
    } else {
      // For new timesheets, check if there's already a draft for this week
      loadOrCreateDraftTimesheet();
    }
  }, [editingTimesheet, selectedEmployee.id, formData.weekEnding]);

  // Auto-save draft every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      if (hasFormData() && formData.status === 'draft') {
        saveDraft();
      }
    }, 30000); // 30 seconds

    return () => clearInterval(interval);
  }, [formData]);

  const loadEditingTimesheet = (timesheet: StructuredTimesheet) => {
    setExistingTimesheetId(timesheet.id);
    
    // Enhanced job loading with proper day assignment
    const loadedJobEntries = (timesheet.job_entries || []).map((job: any, index: number) => ({
      ...job,
      id: `existing-${index}`,
      day: job.day || 'Monday', // Use stored day or default to Monday
      completed: !!(job.start_time && job.finish_time),
    }));

    setFormData({
      weekEnding: timesheet.week_ending,
      sheetNumber: timesheet.sheet_number || '',
      ganger: timesheet.labour_1 || '',
      labourer: timesheet.labour_2 || '',
      workDays: timesheet.work_days || {},
      standbyMonThu: timesheet.standby?.mon_thu || [],
      standbyFriSun: timesheet.standby?.fri_sun || [],
      jobEntries: loadedJobEntries,
      summaryHours: {
        basicShift: timesheet.summary_hours?.basic_shift || {},
        overtime: timesheet.summary_hours?.overtime || {},
      },
      workDayReasons: timesheet.summary_hours?.work_day_reasons || {},
      notes: timesheet.notes || '',
      status: timesheet.status || 'draft',
    });
  };

  const loadOrCreateDraftTimesheet = async () => {
    try {
      // First, try to find existing draft for this week ending
      const { data: existingDraft, error: searchError } = await supabase
        .from('structured_timesheets')
        .select('*')
        .eq('employee_id', selectedEmployee.id)
        .eq('week_ending', formData.weekEnding)
        .eq('status', 'draft')
        .maybeSingle();

      if (searchError && searchError.code !== 'PGRST116') {
        throw searchError;
      }

      if (existingDraft) {
        // Load existing draft
        console.log('Loading existing draft for week ending:', formData.weekEnding);
        loadEditingTimesheet(existingDraft);
      } else {
        // No existing draft found - this is a new timesheet
        console.log('No existing draft found for week ending:', formData.weekEnding);
        setExistingTimesheetId(null);
        // Keep the form data as initialized (fresh form)
      }
    } catch (error) {
      console.error('Error loading/creating draft timesheet:', error);
    }
  };

  const hasFormData = () => {
    return formData.ganger.trim() || 
           formData.labourer.trim() || 
           Object.keys(formData.workDays).length > 0 ||
           formData.jobEntries.length > 0 ||
           Object.keys(formData.summaryHours.basicShift).length > 0 ||
           Object.keys(formData.summaryHours.overtime).length > 0 ||
           formData.standbyMonThu.length > 0 ||
           formData.standbyFriSun.length > 0 ||
           formData.notes.trim();
  };

  const saveDraft = async () => {
    if (!hasFormData()) return;

    setSaving(true);
    try {
      // Enhanced job entries with day information
      const basicJobEntries = formData.jobEntries.map(job => ({
        job_number: job.job_number,
        address: job.address,
        start_time: job.start_time,
        finish_time: job.finish_time,
        office: job.office,
        day: job.day, // Store the day with each job
      }));

      const timesheetData = {
        employee_id: selectedEmployee.id,
        week_ending: formData.weekEnding,
        sheet_number: formData.sheetNumber || null,
        driver: null,
        hand: null,
        machine: null,
        labour_1: formData.ganger || null,
        labour_2: formData.labourer || null,
        work_days: formData.workDays, // Save work days
        standby: { 
          mon_thu: formData.standbyMonThu,
          fri_sun: formData.standbyFriSun
        },
        job_entries: basicJobEntries,
        summary_hours: {
          basic_shift: formData.summaryHours.basicShift, // Save calculated hours
          overtime: formData.summaryHours.overtime, // Save calculated hours
          work_day_reasons: formData.workDayReasons
        },
        notes: formData.notes || null,
        status: formData.status, // Save status
        submitted_at: formData.status === 'submitted' ? new Date().toISOString() : null,
      };

      if (existingTimesheetId) {
        // Update existing timesheet
        const { error } = await supabase
          .from('structured_timesheets')
          .update(timesheetData)
          .eq('id', existingTimesheetId);

        if (error) throw error;
        console.log('Updated existing timesheet:', existingTimesheetId);
      } else {
        // Create new timesheet - use UPSERT with the correct conflict columns
        const { data, error } = await supabase
          .from('structured_timesheets')
          .upsert(
            timesheetData,
            { 
              onConflict: 'employee_id,week_ending',
              ignoreDuplicates: false 
            }
          )
          .select()
          .maybeSingle();

        if (error) {
          // If upsert fails, try to find existing and update
          console.log('Upsert failed, trying to find existing timesheet...');
          const { data: existing, error: findError } = await supabase
            .from('structured_timesheets')
            .select('id')
            .eq('employee_id', selectedEmployee.id)
            .eq('week_ending', formData.weekEnding)
            .eq('status', 'draft')
            .maybeSingle();

          if (!findError && existing) {
            // Update the existing one
            const { error: updateError } = await supabase
              .from('structured_timesheets')
              .update(timesheetData)
              .eq('id', existing.id);

            if (updateError) throw updateError;
            setExistingTimesheetId(existing.id);
            console.log('Updated existing timesheet found:', existing.id);
          } else {
            throw error;
          }
        } else if (data) {
          setExistingTimesheetId(data.id);
          console.log('Created new timesheet:', data.id);
        }
      }

      setLastSaved(new Date());
    } catch (error) {
      console.error('Error saving draft:', error);
    } finally {
      setSaving(false);
    }
  };

  const updateFormData = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const updateWorkDays = (person: string, day: string, checked: boolean) => {
    setFormData(prev => {
      const newWorkDays = {
        ...prev.workDays,
        [person]: checked
          ? [...(prev.workDays[person] || []), day]
          : (prev.workDays[person] || []).filter(d => d !== day)
      };

      return { ...prev, workDays: newWorkDays };
    });
  };

  const updateStandby = (type: 'monThu' | 'friSun', day: string, checked: boolean) => {
    const field = type === 'monThu' ? 'standbyMonThu' : 'standbyFriSun';
    setFormData(prev => ({
      ...prev,
      [field]: checked
        ? [...prev[field], day]
        : prev[field].filter(d => d !== day)
    }));
  };

  const addJobEntry = (day?: string) => {
    const newJob: ExtendedJobEntry = {
      id: Date.now().toString(),
      job_number: '',
      address: '',
      start_time: '',
      finish_time: '',
      office: false,
      day: day || 'Monday',
      completed: false,
    };

    setFormData(prev => ({
      ...prev,
      jobEntries: [...prev.jobEntries, newJob]
    }));
  };

  const updateJobEntry = (id: string, field: keyof ExtendedJobEntry, value: any) => {
    setFormData(prev => {
      const updatedEntries = prev.jobEntries.map(job => 
        job.id === id ? { ...job, [field]: value } : job
      );

      // If updating start_time or finish_time, automatically calculate hours
      if (field === 'start_time' || field === 'finish_time') {
        const updatedJob = updatedEntries.find(j => j.id === id);
        if (updatedJob && updatedJob.start_time && updatedJob.finish_time) {
          // Calculate hours and update summary
          const calculatedData = calculateAndAddHours(updatedJob, prev);
          if (calculatedData) {
            return {
              ...prev,
              jobEntries: updatedEntries.map(j => 
                j.id === id ? { ...j, completed: true } : j
              ),
              summaryHours: calculatedData.summaryHours,
              workDays: calculatedData.workDays
            };
          }
        }
      }

      return { ...prev, jobEntries: updatedEntries };
    });
  };

  const calculateAndAddHours = (job: ExtendedJobEntry, currentFormData: typeof formData) => {
    if (!job.start_time || !job.finish_time) return null;

    try {
      // Calculate hours worked
      const start = new Date(`2000-01-01T${job.start_time}:00`);
      let finish = new Date(`2000-01-01T${job.finish_time}:00`);
      
      // Handle overnight shifts
      if (finish < start) {
        finish = new Date(`2000-01-02T${job.finish_time}:00`);
      }
      
      const diffMs = finish.getTime() - start.getTime();
      const totalHours = diffMs / (1000 * 60 * 60);

      if (totalHours <= 0) return null;

      // Determine if it's a weekend
      const dayIndex = FULL_DAYS.indexOf(job.day);
      const isWeekend = dayIndex >= 5; // Saturday = 5, Sunday = 6

      let basicHours = 0;
      let overtimeHours = 0;

      if (isWeekend) {
        // All weekend hours are overtime
        overtimeHours = totalHours;
      } else {
        // Weekday logic: check if hours fall within 07:00-17:00
        const startHour = start.getHours() + (start.getMinutes() / 60);
        const finishHour = finish.getHours() + (finish.getMinutes() / 60);
        
        // Standard work day is 07:00-17:00 (7-17 in 24hr format)
        const workDayStart = 7; // 07:00
        const workDayEnd = 17; // 17:00
        
        // Calculate overlap with standard work hours
        const workStart = Math.max(startHour, workDayStart);
        const workEnd = Math.min(finishHour, workDayEnd);
        
        if (workStart < workEnd) {
          basicHours = workEnd - workStart;
        }
        
        // Overtime is any hours outside 07:00-17:00
        overtimeHours = totalHours - basicHours;
      }

      // Update summary hours by ADDING to existing hours for the day
      const newSummaryHours = {
        basicShift: {
          ...currentFormData.summaryHours.basicShift,
          [job.day]: (currentFormData.summaryHours.basicShift[job.day] || 0) + basicHours
        },
        overtime: {
          ...currentFormData.summaryHours.overtime,
          [job.day]: (currentFormData.summaryHours.overtime[job.day] || 0) + overtimeHours
        }
      };

      // Auto-tick work day when total hours reach 10 (full work day)
      const dayBasicHours = newSummaryHours.basicShift[job.day] || 0;
      const dayOvertimeHours = newSummaryHours.overtime[job.day] || 0;
      const dayTotalHours = dayBasicHours + dayOvertimeHours;

      let newWorkDays = { ...currentFormData.workDays };
      const gangMembers = [currentFormData.ganger, currentFormData.labourer].filter(Boolean);
      
      if (dayTotalHours >= 10) {
        // Auto-tick work day for all gang members
        gangMembers.forEach(person => {
          const dayShort = DAYS[FULL_DAYS.indexOf(job.day)];
          
          if (dayShort && !((newWorkDays[person] || []).includes(dayShort))) {
            newWorkDays[person] = [...(newWorkDays[person] || []), dayShort];
          }
        });
      }

      return {
        summaryHours: newSummaryHours,
        workDays: newWorkDays
      };
    } catch (error) {
      console.error('Error calculating hours:', error);
      return null;
    }
  };

  const removeJobEntry = (id: string) => {
    setFormData(prev => ({
      ...prev,
      jobEntries: prev.jobEntries.filter(job => job.id !== id)
    }));
  };

  const copyJobToNextDay = (jobId: string) => {
    const job = formData.jobEntries.find(j => j.id === jobId);
    if (!job) return;

    const currentDayIndex = FULL_DAYS.indexOf(job.day);
    const nextDayIndex = (currentDayIndex + 1) % FULL_DAYS.length;
    const nextDay = FULL_DAYS[nextDayIndex];

    const copiedJob: ExtendedJobEntry = {
      ...job,
      id: Date.now().toString(),
      day: nextDay,
      completed: false,
      // Copy the times from the original job
      start_time: job.start_time,
      finish_time: job.finish_time,
    };

    setFormData(prev => {
      const newFormData = {
        ...prev,
        jobEntries: [...prev.jobEntries, copiedJob]
      };

      // If the copied job has both start and finish times, calculate hours immediately
      if (copiedJob.start_time && copiedJob.finish_time) {
        const calculatedData = calculateAndAddHours(copiedJob, newFormData);
        if (calculatedData) {
          return {
            ...newFormData,
            jobEntries: newFormData.jobEntries.map(j => 
              j.id === copiedJob.id ? { ...j, completed: true } : j
            ),
            summaryHours: calculatedData.summaryHours,
            workDays: calculatedData.workDays
          };
        }
      }

      return newFormData;
    });
  };

  // Enhanced quick access entries with day-specific addition
  const addQuickAccessEntry = (type: 'travel' | 'unutilised', day?: string) => {
    const entry: ExtendedJobEntry = {
      id: Date.now().toString(),
      job_number: type === 'travel' ? 'TRAVEL TIME' : 'UNUTILISED TIME',
      address: type === 'travel' ? 'Various locations' : 'Standby/Waiting',
      start_time: '',
      finish_time: '',
      office: false,
      day: day || 'Monday',
      completed: false,
    };

    setFormData(prev => ({
      ...prev,
      jobEntries: [...prev.jobEntries, entry]
    }));
  };

  const updateSummaryHours = (type: keyof typeof formData.summaryHours, day: string, value: number) => {
    setFormData(prev => {
      const newSummaryHours = {
        ...prev.summaryHours,
        [type]: {
          ...prev.summaryHours[type],
          [day]: value
        }
      };

      // Auto-tick work day when total hours reach 10 (07:00-17:00)
      const basicHours = newSummaryHours.basicShift[day] || 0;
      const overtimeHours = newSummaryHours.overtime[day] || 0;
      const totalHours = basicHours + overtimeHours;

      let newWorkDays = { ...prev.workDays };
      const gangMembers = [prev.ganger, prev.labourer].filter(Boolean);
      
      if (totalHours >= 10) {
        // Auto-tick work day for all gang members
        gangMembers.forEach(person => {
          const dayShort = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
            .indexOf(day) >= 0 ? DAYS[['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].indexOf(day)] : day;
          
          if (dayShort && !((newWorkDays[person] || []).includes(dayShort))) {
            newWorkDays[person] = [...(newWorkDays[person] || []), dayShort];
          }
        });
      }

      return { 
        ...prev, 
        summaryHours: newSummaryHours,
        workDays: newWorkDays
      };
    });
  };

  const updateWorkDayReason = (person: string, day: string, reason: string) => {
    const key = `${person}-${day}`;
    setFormData(prev => ({
      ...prev,
      workDayReasons: {
        ...prev.workDayReasons,
        [key]: reason
      }
    }));
  };

  const validateWorkDays = (): WorkDayValidation[] => {
    const validations: WorkDayValidation[] = [];
    const gangMembers = [formData.ganger, formData.labourer].filter(Boolean);

    gangMembers.forEach(person => {
      const workedDays = formData.workDays[person] || [];
      workedDays.forEach(day => {
        const fullDayName = FULL_DAYS[DAYS.indexOf(day)];
        const basicHours = formData.summaryHours.basicShift[fullDayName] || 0;
        const overtimeHours = formData.summaryHours.overtime[fullDayName] || 0;
        const totalHours = basicHours + overtimeHours;
        
        // Check if it's a full work day (07:00-17:00 = 10 hours)
        const hasFullDay = totalHours >= 10;
        
        validations.push({
          person,
          day,
          hasFullDay,
          reason: formData.workDayReasons[`${person}-${day}`]
        });
      });
    });

    return validations;
  };

  const handleSubmitConfirm = () => {
    setShowSubmitConfirm(true);
  };

  const handleSubmitCancel = () => {
    setShowSubmitConfirm(false);
  };

  const handleSubmit = async () => {
    setShowSubmitConfirm(false);
    
    // Validate work days
    const workDayValidations = validateWorkDays();
    const incompleteWorkDays = workDayValidations.filter(v => !v.hasFullDay);
    const incompleteWithoutReason = incompleteWorkDays.filter(v => !v.reason?.trim());

    if (incompleteWithoutReason.length > 0) {
      setValidationErrors([
        'Please provide reasons for incomplete work days (less than 10 hours) or ensure all work days have 07:00-17:00 hours.'
      ]);
      return;
    }

    setValidationErrors([]);
    setSubmitting(true);

    try {
      // Enhanced job entries with day information
      const basicJobEntries = formData.jobEntries.map(job => ({
        job_number: job.job_number,
        address: job.address,
        start_time: job.start_time,
        finish_time: job.finish_time,
        office: job.office,
        day: job.day, // Store the day with each job
      }));

      const timesheetData = {
        employee_id: selectedEmployee.id,
        week_ending: formData.weekEnding,
        sheet_number: formData.sheetNumber || null,
        driver: null,
        hand: null,
        machine: null,
        labour_1: formData.ganger || null,
        labour_2: formData.labourer || null,
        work_days: formData.workDays, // Save work days
        standby: { 
          mon_thu: formData.standbyMonThu,
          fri_sun: formData.standbyFriSun
        },
        job_entries: basicJobEntries,
        summary_hours: {
          basic_shift: formData.summaryHours.basicShift, // Save calculated hours
          overtime: formData.summaryHours.overtime, // Save calculated hours
          work_day_reasons: formData.workDayReasons
        },
        notes: formData.notes || null,
        status: 'submitted', // CRITICAL: Set status to submitted
        submitted_at: new Date().toISOString(), // CRITICAL: Set submission timestamp
      };

      let result;
      if (existingTimesheetId) {
        // Update existing timesheet
        const { data, error } = await supabase
          .from('structured_timesheets')
          .update(timesheetData)
          .eq('id', existingTimesheetId)
          .select()
          .maybeSingle();

        if (error) throw error;
        result = data;
      } else {
        // Create new timesheet
        const { data, error } = await supabase
          .from('structured_timesheets')
          .insert(timesheetData)
          .select()
          .maybeSingle();

        if (error) throw error;
        result = data;
      }

      // Verify the submission was successful
      console.log('Timesheet submitted successfully:', result);
      
      // Update local state to reflect submission
      setFormData(prev => ({ ...prev, status: 'submitted' }));
      
      onSubmissionSuccess();
    } catch (error) {
      console.error('Error submitting timesheet:', error);
      alert('Failed to submit timesheet. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const gangMembers = [
    { key: 'ganger', label: 'Ganger', value: formData.ganger },
    { key: 'labourer', label: 'Labourer', value: formData.labourer },
  ].filter(member => member.value.trim());

  // Group jobs by day
  const jobsByDay = FULL_DAYS.reduce((acc, day) => {
    acc[day] = formData.jobEntries.filter(job => job.day === day);
    return acc;
  }, {} as Record<string, ExtendedJobEntry[]>);

  // Get work day validations for display
  const workDayValidations = validateWorkDays();
  const incompleteWorkDays = workDayValidations.filter(v => !v.hasFullDay);

  // Calculate total hours for display
  const totalBasicHours = Object.values(formData.summaryHours.basicShift).reduce((sum, hours) => sum + hours, 0);
  const totalOvertimeHours = Object.values(formData.summaryHours.overtime).reduce((sum, hours) => sum + hours, 0);
  const totalHours = totalBasicHours + totalOvertimeHours;
  const totalPayHours = totalBasicHours + (totalOvertimeHours * 1.5);

  // Disable form if already submitted
  const isSubmitted = formData.status === 'submitted';

  return (
    <div className="space-y-6">
      {/* Submit Confirmation Modal */}
      {showSubmitConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <div className="flex items-center space-x-3 mb-4">
              <AlertTriangle className="h-6 w-6 text-amber-600" />
              <h3 className="text-lg font-semibold text-slate-900">Submit Timesheet?</h3>
            </div>
            <p className="text-slate-600 mb-6">
              Are you sure you want to submit this timesheet? Once submitted, it will be sent to your supervisor for review and payroll processing. You will not be able to make further changes.
            </p>
            <div className="flex space-x-3">
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium py-2 px-4 rounded-lg transition-colors"
              >
                {submitting ? 'Submitting...' : 'Yes, Submit'}
              </button>
              <button
                onClick={handleSubmitCancel}
                className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-700 font-medium py-2 px-4 rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Submitted Status Banner */}
      {isSubmitted && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4">
          <div className="flex items-center space-x-2 text-green-800">
            <AlertTriangle className="h-5 w-5" />
            <span className="font-medium">
              ✅ This timesheet has been submitted successfully and is now available to your employer for payroll processing. Contact your supervisor if changes are needed.
            </span>
          </div>
        </div>
      )}

      <form onSubmit={(e) => { e.preventDefault(); if (!isSubmitted) handleSubmitConfirm(); }} className="space-y-6">
        {/* Header Section */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold text-slate-900 flex items-center">
              <FileText className="h-6 w-6 mr-2 text-blue-600" />
              Professional Gang Timesheet
            </h1>
            <div className="flex items-center space-x-4">
              {saving && (
                <div className="flex items-center space-x-2 text-blue-600">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                  <span className="text-sm">Saving draft...</span>
                </div>
              )}
              {lastSaved && !saving && (
                <div className="text-sm text-green-600">
                  Last saved: {lastSaved.toLocaleTimeString()}
                </div>
              )}
              {!isSubmitted && (
                <button
                  type="button"
                  onClick={saveDraft}
                  disabled={saving}
                  className="flex items-center space-x-2 px-4 py-2 bg-slate-600 hover:bg-slate-700 disabled:bg-slate-400 text-white rounded-lg transition-colors"
                >
                  <Save className="h-4 w-4" />
                  <span>Save Draft</span>
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Week Ending (Sunday) *
              </label>
              <input
                type="date"
                value={formData.weekEnding}
                onChange={(e) => updateFormData('weekEnding', e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={isSubmitted}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Sheet No.
              </label>
              <input
                type="text"
                value={formData.sheetNumber}
                onChange={(e) => updateFormData('sheetNumber', e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="e.g., TS001"
                disabled={isSubmitted}
              />
            </div>
          </div>

          {/* Hours Summary Display */}
          {totalHours > 0 && (
            <div className="mt-4 bg-gradient-to-r from-blue-50 to-green-50 rounded-lg p-4 border border-blue-200">
              <h3 className="text-sm font-semibold text-slate-900 mb-2">Current Week Summary</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                <div>
                  <div className="text-lg font-bold text-blue-600">{totalBasicHours.toFixed(1)}</div>
                  <div className="text-xs text-slate-600">Basic Hours</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-orange-600">{totalOvertimeHours.toFixed(1)}</div>
                  <div className="text-xs text-slate-600">Overtime Hours</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-slate-900">{totalHours.toFixed(1)}</div>
                  <div className="text-xs text-slate-600">Total Worked</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-green-600">{totalPayHours.toFixed(1)}</div>
                  <div className="text-xs text-slate-600">Pay Hours</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Gang Info Section - Only Ganger and Labourer */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Gang Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Ganger</label>
              <input
                type="text"
                value={formData.ganger}
                onChange={(e) => updateFormData('ganger', e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Ganger name"
                disabled={isSubmitted}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Labourer</label>
              <input
                type="text"
                value={formData.labourer}
                onChange={(e) => updateFormData('labourer', e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Labourer name"
                disabled={isSubmitted}
              />
            </div>
          </div>
        </div>

        {/* Enhanced Standby Section - Split into Mon-Thu and Fri-Sun */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Standby Information</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Monday-Thursday Standby */}
            <div className="bg-blue-50 rounded-lg p-4">
              <h3 className="text-sm font-medium text-slate-700 mb-3">Standby Mon-Thu</h3>
              <div className="space-y-2">
                {['Mon', 'Tue', 'Wed', 'Thu'].map(day => (
                  <label key={day} className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={formData.standbyMonThu.includes(day)}
                      onChange={(e) => updateStandby('monThu', day, e.target.checked)}
                      className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                      disabled={isSubmitted}
                    />
                    <span className="text-sm text-slate-700">{day}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Friday-Sunday Standby */}
            <div className="bg-green-50 rounded-lg p-4">
              <h3 className="text-sm font-medium text-slate-700 mb-3">Standby Fri-Sun</h3>
              <div className="space-y-2">
                {['Fri', 'Sat', 'Sun'].map(day => (
                  <label key={day} className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={formData.standbyFriSun.includes(day)}
                      onChange={(e) => updateStandby('friSun', day, e.target.checked)}
                      className="w-4 h-4 text-green-600 border-slate-300 rounded focus:ring-green-500"
                      disabled={isSubmitted}
                    />
                    <span className="text-sm text-slate-700">{day}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Enhanced Job Entry Section - Moved above Work Days */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-slate-900">Job Entries by Day</h2>
          </div>

          <div className="space-y-6">
            {FULL_DAYS.map(day => (
              <div key={day} className="border border-slate-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-medium text-slate-900">{day}</h3>
                  {!isSubmitted && (
                    <div className="flex items-center space-x-2">
                      {/* Quick Access Buttons for each day */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          addQuickAccessEntry('travel', day);
                        }}
                        className="flex items-center space-x-1 px-3 py-1 bg-orange-600 hover:bg-orange-700 text-white text-sm rounded transition-colors"
                        title={`Add Travel Time for ${day}`}
                      >
                        <MapPin className="h-3 w-3" />
                        <span>Travel</span>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          addQuickAccessEntry('unutilised', day);
                        }}
                        className="flex items-center space-x-1 px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white text-sm rounded transition-colors"
                        title={`Add Unutilised Time for ${day}`}
                      >
                        <Clock className="h-3 w-3" />
                        <span>Unutilised</span>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          addJobEntry(day);
                        }}
                        className="text-sm text-blue-600 hover:text-blue-800 transition-colors"
                      >
                        + Add Job
                      </button>
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  {jobsByDay[day].map(job => (
                    <div key={job.id} className={`border rounded-lg p-4 ${job.completed ? 'bg-green-50 border-green-200' : 'border-slate-200'}`}>
                      <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
                        <div className="md:col-span-2">
                          <label className="block text-sm font-medium text-slate-700 mb-1">
                            Job Number
                          </label>
                          <input
                            type="text"
                            value={job.job_number}
                            onChange={(e) => updateJobEntry(job.id, 'job_number', e.target.value)}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            placeholder="Job number"
                            disabled={isSubmitted}
                          />
                        </div>
                        <div className="md:col-span-2">
                          <label className="block text-sm font-medium text-slate-700 mb-1">
                            Location/Address
                          </label>
                          <input
                            type="text"
                            value={job.address}
                            onChange={(e) => updateJobEntry(job.id, 'address', e.target.value)}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            placeholder="Job location"
                            disabled={isSubmitted}
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">
                            Start Time
                          </label>
                          <input
                            type="time"
                            value={job.start_time}
                            onChange={(e) => updateJobEntry(job.id, 'start_time', e.target.value)}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            disabled={isSubmitted}
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">
                            Finish Time
                          </label>
                          <input
                            type="time"
                            value={job.finish_time}
                            onChange={(e) => updateJobEntry(job.id, 'finish_time', e.target.value)}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            disabled={isSubmitted}
                          />
                        </div>
                      </div>
                      
                      <div className="flex items-center justify-between mt-4">
                        <div className="flex items-center space-x-4">
                          <label className="flex items-center space-x-2">
                            <input
                              type="checkbox"
                              checked={job.office}
                              onChange={(e) => updateJobEntry(job.id, 'office', e.target.checked)}
                              className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                              disabled={isSubmitted}
                            />
                            <span className="text-sm text-slate-700">Office</span>
                          </label>
                          
                          {job.completed && (
                            <div className="flex items-center space-x-2 text-green-700">
                              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                              <span className="text-sm font-medium">Hours Added to Summary</span>
                            </div>
                          )}
                        </div>
                        
                        {!isSubmitted && (
                          <div className="flex items-center space-x-2">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                copyJobToNextDay(job.id);
                              }}
                              className="flex items-center space-x-1 px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors"
                              title="Copy job and times to next day"
                            >
                              <Copy className="h-3 w-3" />
                              <span>Copy to Next Day</span>
                            </button>
                            
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                removeJobEntry(job.id);
                              }}
                              className="text-red-600 hover:text-red-800 transition-colors"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  
                  {jobsByDay[day].length === 0 && (
                    <div className="text-center py-4 text-slate-500">
                      <Clock className="h-6 w-6 mx-auto mb-2 text-slate-400" />
                      <p className="text-sm">No jobs scheduled for {day}</p>
                      {!isSubmitted && (
                        <p className="text-xs text-slate-400 mt-1">Use the buttons above to add jobs or quick access entries</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Work Days Grid */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Work Days</h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-2 px-3 text-sm font-medium text-slate-700">Person</th>
                  {DAYS.map(day => (
                    <th key={day} className="text-center py-2 px-2 text-sm font-medium text-slate-700">
                      {day}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {gangMembers.map(member => (
                  <tr key={member.key} className="border-b border-slate-100">
                    <td className="py-3 px-3 text-sm font-medium text-slate-900">
                      {member.value}
                    </td>
                    {DAYS.map(day => {
                      const fullDayName = FULL_DAYS[DAYS.indexOf(day)];
                      const basicHours = formData.summaryHours.basicShift[fullDayName] || 0;
                      const overtimeHours = formData.summaryHours.overtime[fullDayName] || 0;
                      const totalHours = basicHours + overtimeHours;
                      const isFullDay = totalHours >= 10;
                      const isChecked = (formData.workDays[member.value] || []).includes(day);
                      
                      return (
                        <td key={day} className="text-center py-3 px-2">
                          <div className="flex items-center justify-center space-x-1">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => updateWorkDays(member.value, day, e.target.checked)}
                              className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                              disabled={isSubmitted}
                            />
                            {isFullDay && isChecked && (
                              <div className="w-2 h-2 bg-green-500 rounded-full" title="Full work day (10+ hours)" />
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Work Day Validation Warnings */}
          {incompleteWorkDays.length > 0 && !isSubmitted && (
            <div className="mt-4 space-y-3">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <div className="flex items-center space-x-2 mb-3">
                  <AlertTriangle className="h-5 w-5 text-amber-600" />
                  <h4 className="text-sm font-semibold text-amber-800">Incomplete Work Days Detected</h4>
                </div>
                <p className="text-sm text-amber-700 mb-3">
                  The following work days have less than 10 hours (07:00-17:00). Please provide reasons:
                </p>
                
                <div className="space-y-3">
                  {incompleteWorkDays.map(validation => (
                    <div key={`${validation.person}-${validation.day}`} className="bg-white rounded border border-amber-200 p-3">
                      <div className="text-sm font-medium text-slate-900 mb-2">
                        {validation.person} - {validation.day}
                      </div>
                      <textarea
                        value={formData.workDayReasons[`${validation.person}-${validation.day}`] || ''}
                        onChange={(e) => updateWorkDayReason(validation.person, validation.day, e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                        placeholder="Reason for incomplete work day (e.g., sick leave, early finish, etc.)"
                        rows={2}
                        disabled={isSubmitted}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Summary Hours Grid - Only Basic Shift and Overtime */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Summary Hours (Auto-calculated from job times)</h2>
          <div className="space-y-6">
            {[
              { key: 'basicShift', label: 'Basic Shift Hours (Mon-Fri 07:00-17:00)', color: 'bg-blue-50' },
              { key: 'overtime', label: 'Overtime Hours (Outside 07:00-17:00 + Weekends)', color: 'bg-orange-50' },
            ].map(section => (
              <div key={section.key} className={`${section.color} rounded-lg p-4`}>
                <h3 className="text-sm font-medium text-slate-700 mb-3">{section.label}</h3>
                <div className="grid grid-cols-7 gap-3">
                  {FULL_DAYS.map((day, index) => (
                    <div key={day}>
                      <label className="block text-xs text-slate-600 mb-1 text-center font-medium">
                        {DAYS[index]}
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        value={formData.summaryHours[section.key as keyof typeof formData.summaryHours][day] || ''}
                        onChange={(e) => updateSummaryHours(
                          section.key as keyof typeof formData.summaryHours,
                          day,
                          parseFloat(e.target.value) || 0
                        )}
                        className="w-full px-2 py-2 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent text-center"
                        placeholder="0"
                        disabled={isSubmitted}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          
          <div className="mt-4 bg-slate-50 rounded-lg p-4">
            <p className="text-sm text-slate-600">
              <strong>Note:</strong> Hours are automatically calculated when you enter start and finish times for jobs. 
              You can also manually adjust hours if needed. Basic hours are capped at 8 hours per weekday (07:00-17:00). 
              All weekend hours and hours outside 07:00-17:00 on weekdays are overtime.
            </p>
          </div>
        </div>

        {/* Validation Errors */}
        {validationErrors.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4">
            <div className="flex items-center space-x-2 mb-2">
              <AlertTriangle className="h-5 w-5 text-red-600" />
              <h3 className="text-sm font-semibold text-red-800">Validation Errors</h3>
            </div>
            <ul className="text-sm text-red-700 space-y-1">
              {validationErrors.map((error, index) => (
                <li key={index}>• {error}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Notes Section */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Additional Notes</h2>
          <textarea
            value={formData.notes}
            onChange={(e) => updateFormData('notes', e.target.value)}
            rows={3}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Any additional notes or comments..."
            disabled={isSubmitted}
          />
        </div>

        {/* Submit Section */}
        {!isSubmitted && (
          <div className="bg-white rounded-xl shadow-sm p-6">
            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center"
            >
              {submitting ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Submitting Timesheet...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Submit Professional Gang Timesheet
                </>
              )}
            </button>
            
            <p className="mt-3 text-sm text-slate-600 text-center">
              Your timesheet is automatically saved as a draft. Hours are calculated automatically when you enter start and finish times.
            </p>
          </div>
        )}
      </form>
    </div>
  );
};