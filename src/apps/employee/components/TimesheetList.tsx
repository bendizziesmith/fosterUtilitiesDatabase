import React, { useState, useEffect } from 'react';
import { FileText, Calendar, DollarSign, RefreshCw, Plus, Send, ChevronDown, ChevronRight, MapPin, Briefcase, Clock, Trash2, Edit } from 'lucide-react';
import { supabase, Timesheet, Employee, TimesheetEntry as DbTimesheetEntry } from '../../../lib/supabase';
import { PriceWorkWizard, PriceWorkEntry } from '../../../components/timesheets/PriceWorkWizard';
import { DayRateWizard, DayRateEntry } from '../../../components/timesheets/DayRateWizard';
import { ChooseRateTypeModal } from '../../../components/timesheets/ChooseRateTypeModal';
import { TimesheetEntryCard } from '../../../components/TimesheetEntryCard';

interface TimesheetListProps {
  selectedEmployee: Employee;
  onStartNewTimesheet: () => void;
}

interface TimesheetEntry {
  id: string;
  work_item: string;
  col2: string;
  col3: string;
  col4: string;
  quantity: number;
  rate: number;
  total: number;
  day: string;
  type: 'ipsom' | 'mollsworth' | 'dayrate';
}

interface WeeklyTimesheet {
  weekEnding: string;
  jobs: JobTimesheet[];
  totalValue: number;
  status: 'draft' | 'submitted';
  jobCount: number;
}

interface JobTimesheet {
  id: string;
  jobNumber: string;
  teamName: string;
  address: string;
  entries: TimesheetEntry[];
  totalValue: number;
  status: 'draft' | 'submitted';
  submittedAt?: string;
}

export const TimesheetList: React.FC<TimesheetListProps> = ({
  selectedEmployee,
  onStartNewTimesheet,
}) => {
  const [weeklyTimesheets, setWeeklyTimesheets] = useState<WeeklyTimesheet[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedWeek, setSelectedWeek] = useState<WeeklyTimesheet | null>(null);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [expandedWeeks, setExpandedWeeks] = useState<Set<string>>(new Set());
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingJob, setEditingJob] = useState<JobTimesheet | null>(null);
  const [editForm, setEditForm] = useState({
    jobNumber: '',
    teamName: '',
    address: '',
  });
  const [showEditEntriesModal, setShowEditEntriesModal] = useState(false);
  const [editingJobEntries, setEditingJobEntries] = useState<JobTimesheet | null>(null);
  const [editingEntries, setEditingEntries] = useState<TimesheetEntry[]>([]);
  const [showAddEntryModal, setShowAddEntryModal] = useState(false);
  const [addEntryMode, setAddEntryMode] = useState<'ipsom' | 'mollsworth'>('ipsom');
  const [showChooseRateModal, setShowChooseRateModal] = useState(false);
  const [showPriceWorkWizard, setShowPriceWorkWizard] = useState(false);
  const [showDayRateWizard, setShowDayRateWizard] = useState(false);
  const [currentMode, setCurrentMode] = useState<'ipsom' | 'mollsworth'>('ipsom');

  const getDayFromEntry = (entry: any): string => {
    // For price work entries (Ipsom/Mollsworth), return 'Various'
    if (entry.ipsom_rate_id || entry.mollsworth_rate_id) {
      return 'Various';
    }
    
    // For day rate entries, find which day has hours > 0
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    
    // Check each day field to find which one has hours
    for (let i = 0; i < days.length; i++) {
      const dayKey = days[i];
      const dayValue = entry[dayKey];
      
      // Convert to number and check if greater than 0
      const hours = dayValue ? parseFloat(dayValue.toString()) : 0;
      if (hours > 0) {
        console.log(`Found hours for ${dayKey}: ${hours}, returning ${dayNames[i]}`);
        return dayNames[i];
      }
    }
    
    console.log('No day found with hours > 0 for entry:', entry);
    return 'Unknown';
  };

  const handleEditEntries = (job: JobTimesheet) => {
    setEditingJobEntries(job);
    setEditingEntries([...job.entries]);
    setShowEditEntriesModal(true);
  };

  const handleDeleteJob = async (jobId: string) => {
    if (!confirm('Are you sure you want to delete this job? This action cannot be undone.')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('new_timesheets')
        .delete()
        .eq('id', jobId);

      if (error) throw error;
      
      // Refresh the timesheet list
      await loadTimesheets();
    } catch (error) {
      console.error('Error deleting job:', error);
      alert('Failed to delete job. Please try again.');
    }
  };

  const handleAddNewEntry = (mode: 'ipsom' | 'mollsworth') => {
    setCurrentMode(mode);
    setShowChooseRateModal(false);
    setShowPriceWorkWizard(true);
  };

  const handleAddPriceWorkEntry = async (entry: PriceWorkEntry) => {
    if (!editingJobEntries) return;

    try {
      // Add new entry to database
      const { data, error } = await supabase
        .from('timesheet_entries')
        .insert({
          timesheet_id: editingJobEntries.id,
          [currentMode === 'ipsom' ? 'ipsom_rate_id' : 'mollsworth_rate_id']: entry.rateId,
          quantity: entry.quantity,
          line_total: entry.total
        })
        .select()
        .single();

      if (error) throw error;

      // Add to local state
      const newEntry: TimesheetEntry = {
        id: data.id,
        work_item: entry.workItem,
        col2: entry.col2,
        col3: entry.col3,
        col4: entry.col4 || '',
        quantity: entry.quantity,
        rate: entry.rate,
        total: entry.total,
        day: 'Various',
        type: currentMode
      };

      setEditingEntries(prev => [...prev, newEntry]);
      setShowPriceWorkWizard(false);
    } catch (error) {
      console.error('Error adding entry:', error);
      alert('Failed to add entry. Please try again.');
    }
  };

  const handleAddDayRateEntry = async (entry: DayRateEntry) => {
    if (!editingJobEntries) return;

    try {
      // Add new day rate entry to database
      const { data, error } = await supabase
        .from('timesheet_entries')
        .insert({
          timesheet_id: editingJobEntries.id,
          work_rate_id: entry.rateId,
          quantity: entry.hours,
          [entry.day.toLowerCase()]: entry.hours,
          line_total: entry.total
        })
        .select()
        .single();

      if (error) throw error;

      // Add to local state
      const newEntry: TimesheetEntry = {
        id: data.id,
        work_item: entry.workType,
        col2: entry.voltageType,
        col3: entry.siteType || '',
        col4: '',
        quantity: entry.hours,
        rate: entry.rate,
        total: entry.total,
        day: entry.day,
        type: 'dayrate'
      };

      setEditingEntries(prev => [...prev, newEntry]);
      setShowDayRateWizard(false);
    } catch (error) {
      console.error('Error adding day rate entry:', error);
      alert('Failed to add day rate entry. Please try again.');
    }
  };

  const handleDeleteEntry = async (entryId: string) => {
    if (!confirm('Are you sure you want to delete this entry?')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('timesheet_entries')
        .delete()
        .eq('id', entryId);

      if (error) throw error;

      setEditingEntries(prev => prev.filter(entry => entry.id !== entryId));
    } catch (error) {
      console.error('Error deleting entry:', error);
      alert('Failed to delete entry. Please try again.');
    }
  };

  const handleSaveEntries = async () => {
    if (!editingJobEntries) return;

    try {
      // Update all modified entries
      for (const entry of editingEntries) {
        const { error } = await supabase
          .from('timesheet_entries')
          .update({
            quantity: entry.quantity,
            line_total: entry.total
          })
          .eq('id', entry.id);

        if (error) throw error;
      }

      // Update timesheet total
      const newTotal = editingEntries.reduce((sum, entry) => sum + entry.total, 0);
      const { error: timesheetError } = await supabase
        .from('new_timesheets')
        .update({ total_value: newTotal })
        .eq('id', editingJobEntries.id);

      if (timesheetError) throw timesheetError;

      setShowEditEntriesModal(false);
      setEditingJobEntries(null);
      setEditingEntries([]);
      await loadTimesheets(); // Refresh the list
    } catch (error) {
      console.error('Error saving entries:', error);
      alert('Failed to save entries. Please try again.');
    }
  };

  const handleSaveEdit = async () => {
    if (!editingJob) return;

    try {
      const { error } = await supabase
        .from('new_timesheets')
        .update({
          job_number: editForm.jobNumber,
          team_name: editForm.teamName,
          address: editForm.address
        })
        .eq('id', editingJob.id);

      if (error) throw error;

      setShowEditModal(false);
      setEditingJob(null);
      await loadTimesheets(); // Refresh the list
    } catch (error) {
      console.error('Error updating job:', error);
      alert('Failed to update job. Please try again.');
    }
  };

  useEffect(() => {
    loadTimesheets();
  }, [selectedEmployee.id]);

  const loadTimesheets = async () => {
    try {
      setLoading(true);
      
      // Load all timesheets for this employee
      const { data: timesheets, error } = await supabase
        .from('new_timesheets')
        .select(`
          *,
          timesheet_entries(
            *,
            work_rate:work_rates(*),
            ipsom_rate:ipsom_rates(*),
            mollsworth_rate:mollsworth_work_rates(*)
          )
        `)
        .eq('employee_id', selectedEmployee.id)
        .order('week_ending', { ascending: false });

      if (error) throw error;
      
      // Group timesheets by week ending
      const weeklyData = groupTimesheetsByWeek(timesheets || []);
      setWeeklyTimesheets(weeklyData);
    } catch (error) {
      console.error('Error loading timesheets:', error);
    } finally {
      setLoading(false);
    }
  };

  const groupTimesheetsByWeek = (timesheets: any[]): WeeklyTimesheet[] => {
    const weekGroups: { [key: string]: WeeklyTimesheet } = {};

    timesheets.forEach(timesheet => {
      const weekKey = timesheet.week_ending;
      
      if (!weekGroups[weekKey]) {
        weekGroups[weekKey] = {
          weekEnding: weekKey,
          jobs: [],
          totalValue: 0,
          status: timesheet.status as 'draft' | 'submitted',
          jobCount: 0,
        };
      } else {
        // If any job in the week is draft, the whole week is draft
        if (timesheet.status === 'draft') {
          weekGroups[weekKey].status = 'draft';
        }
      }

      // Convert timesheet entries to our format
      const entries: TimesheetEntry[] = (timesheet.timesheet_entries || []).map((entry: any) => ({
        id: entry.id,
        work_item: entry.ipsom_rate?.work_item || 
                  entry.mollsworth_rate?.col1_work_item || 
                  entry.work_rate?.work_type || 
                  'Day Rate',
        col2: entry.ipsom_rate?.col2 || '-',
        col3: entry.ipsom_rate?.col3 || '-',
        col4: entry.ipsom_rate?.col4 || '-',
        voltage: entry.mollsworth_rate?.col2_param || '-',
        excavation: entry.mollsworth_rate?.col3_param || '-',
        site: entry.mollsworth_rate?.col4_param || '-',
        quantity: entry.quantity || 0,
        rate: entry.ipsom_rate?.rate_gbp || 
              entry.mollsworth_rate?.rate_gbp || 
              entry.work_rate?.rate_value || 
              0,
        total: entry.line_total || 0,
        day: entry.ipsom_rate_id || entry.mollsworth_rate_id ? 'Various' : getDayFromEntry(entry),
        type: entry.ipsom_rate_id ? 'ipsom' : entry.mollsworth_rate_id ? 'mollsworth' : 'dayrate',
        hours: entry.total_hours || 0,
        reason: entry.work_rate?.work_type || '',
        supervisorName: '',
        // Add the specific rate data for proper type detection
        ipsom_rate: entry.ipsom_rate,
        mollsworth_rate: entry.mollsworth_rate,
        work_rate: entry.work_rate,
        // Add the day fields for working days display
        monday: entry.monday || 0,
        tuesday: entry.tuesday || 0,
        wednesday: entry.wednesday || 0,
        thursday: entry.thursday || 0,
        friday: entry.friday || 0,
        saturday: entry.saturday || 0,
        sunday: entry.sunday || 0
      }));

      const job: JobTimesheet = {
        id: timesheet.id,
        jobNumber: timesheet.job_number,
        teamName: timesheet.team_name || '',
        address: timesheet.address || '',
        entries: entries,
        totalValue: timesheet.total_value || 0,
        status: timesheet.status as 'draft' | 'submitted',
        submittedAt: timesheet.submitted_at,
      };

      weekGroups[weekKey].jobs.push(job);
      weekGroups[weekKey].totalValue += job.totalValue;
      weekGroups[weekKey].jobCount += 1;
      
      // Week is submitted if all jobs are submitted
      if (timesheet.status === 'submitted') {
        weekGroups[weekKey].status = 'submitted';
      }
    });

    // Helper function to get the earliest working day for a job
    const getJobEarliestDay = (job: JobTimesheet): number => {
      const dayNames = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
      
      // Check all entries for this job to find the earliest working day
      for (let dayIndex = 0; dayIndex < dayNames.length; dayIndex++) {
        const dayKey = dayNames[dayIndex];
        const hasWork = job.entries.some(entry => {
          const dayValue = entry[dayKey as keyof typeof entry];
          return dayValue && Number(dayValue) > 0;
        });
        if (hasWork) {
          return dayIndex; // Return 0 for Monday, 1 for Tuesday, etc.
        }
      }
      return 7; // If no working days found, put at end
    };

    // Sort jobs within each week by day of the week
    Object.values(weekGroups).forEach(week => {
      week.jobs.sort((a, b) => {
        const dayA = getJobEarliestDay(a);
        const dayB = getJobEarliestDay(b);
        return dayA - dayB;
      });
    });

    return Object.values(weekGroups).sort((a, b) => 
      new Date(b.weekEnding).getTime() - new Date(a.weekEnding).getTime()
    );
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadTimesheets();
    setRefreshing(false);
  };

  const handleSubmitWeek = async (week: WeeklyTimesheet) => {
    try {
      // Submit all draft jobs in this week
      const draftJobs = week.jobs.filter(job => job.status === 'draft');
      
      for (const job of draftJobs) {
        const { error } = await supabase
          .from('new_timesheets')
          .update({ 
            status: 'submitted',
            submitted_at: new Date().toISOString()
          })
          .eq('id', job.id);

        if (error) throw error;
      }
      
      setShowSubmitModal(false);
      setSelectedWeek(null);
      loadTimesheets(); // Refresh the list
    } catch (error) {
      console.error('Error submitting week:', error);
      alert('Failed to submit week. Please try again.');
    }
  };

  const toggleWeekExpansion = (weekEnding: string) => {
    const newExpanded = new Set(expandedWeeks);
    if (newExpanded.has(weekEnding)) {
      newExpanded.delete(weekEnding);
    } else {
      newExpanded.add(weekEnding);
    }
    setExpandedWeeks(newExpanded);
  };

  const getStatusBadge = (status: string) => {
    const badges = {
      draft: 'bg-amber-100 text-amber-800 border-amber-200',
      submitted: 'bg-green-100 text-green-800 border-green-200',
    };

    const labels = {
      draft: 'Draft',
      submitted: 'Submitted',
    };

    return (
      <span className={`text-xs px-3 py-1 rounded-full font-medium border ${badges[status as keyof typeof badges]}`}>
        {labels[status as keyof typeof labels]}
      </span>
    );
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-xl shadow-sm p-8 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2 text-slate-600">Loading your timesheets...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Your Timesheets</h1>
            <p className="text-slate-600">{selectedEmployee.full_name} - {selectedEmployee.role}</p>
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center space-x-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 disabled:bg-slate-50 rounded-lg transition-colors"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>

        {/* Add New Timesheet Button */}
        <button
          onClick={onStartNewTimesheet}
          className="w-full bg-green-600 hover:bg-green-700 text-white font-medium py-4 px-6 rounded-lg transition-colors flex items-center justify-center space-x-2"
        >
          <Plus className="h-5 w-5" />
          <span>Add to Your Timesheet</span>
        </button>
      </div>

      {/* Weekly Timesheets */}
      {weeklyTimesheets.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm p-8 text-center">
          <FileText className="h-12 w-12 text-slate-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-900 mb-2">No Timesheets Found</h3>
          <p className="text-slate-600 mb-4">
            You haven't created any timesheets yet. Start by adding to your timesheet.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {weeklyTimesheets.map((week) => (
            <div key={week.weekEnding} className="bg-white rounded-xl shadow-sm overflow-hidden border border-slate-200">
              {/* Week Header */}
              <div 
                className="bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-blue-200 p-6 cursor-pointer hover:from-blue-100 hover:to-indigo-100 transition-colors"
                onClick={() => toggleWeekExpansion(week.weekEnding)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    {expandedWeeks.has(week.weekEnding) ? (
                      <ChevronDown className="h-5 w-5 text-blue-600" />
                    ) : (
                      <ChevronRight className="h-5 w-5 text-blue-600" />
                    )}
                    <div>
                      <h3 className="text-lg font-bold text-slate-900">
                        Week Ending {formatDate(week.weekEnding)}
                      </h3>
                      <p className="text-sm text-slate-600">
                        {week.jobCount} job{week.jobCount !== 1 ? 's' : ''} • £{week.totalValue.toFixed(2)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3">
                    {getStatusBadge(week.status)}
                    <div className="text-right">
                      <div className="text-xl font-bold text-green-600">£{week.totalValue.toFixed(2)}</div>
                      <div className="text-xs text-slate-500">{week.jobCount} job{week.jobCount !== 1 ? 's' : ''}</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Week Content */}
              {expandedWeeks.has(week.weekEnding) && (
                <div className="p-6">
                  {/* Jobs */}
                  {week.jobs.map((job) => (
                    <div key={job.id} className="mb-6 last:mb-0 bg-slate-50 rounded-lg p-6 border border-slate-200">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex-1">
                          <div className="flex items-center space-x-3 mb-2">
                            <h4 className="text-lg font-bold text-slate-900">Job {job.jobNumber}</h4>
                            {getStatusBadge(job.status)}
                          </div>
                          <div className="space-y-1 text-sm text-slate-600">
                            {job.teamName && (
                              <div className="flex items-center">
                                <Briefcase className="h-4 w-4 mr-2" />
                                <span>{job.teamName}</span>
                              </div>
                            )}
                            {job.address && (
                              <div className="flex items-center">
                                <MapPin className="h-4 w-4 mr-2" />
                                <span>{job.address}</span>
                              </div>
                            )}
                            {/* Show working days from timesheet entries */}
                            <div className="flex items-center">
                              <Calendar className="h-4 w-4 mr-2" />
                              <span className="font-medium">Working Days: </span>
                              <span>{(() => {
                                const workingDays = [];
                                const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
                                const dayKeys = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
                                
                                // Check each day across all entries for this job - look for any hours > 0
                                dayKeys.forEach((dayKey, index) => {
                                  const hasHours = job.entries.some(entry => 
                                    entry[dayKey] && Number(entry[dayKey]) > 0
                                  );
                                  if (hasHours) {
                                    workingDays.push(dayNames[index]);
                                  }
                                });
                                
                                return workingDays.length > 0 ? workingDays.join(', ') : 'No working days found';
                              })()}</span>
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-xl font-bold text-green-600">£{job.totalValue.toFixed(2)}</div>
                          <div className="text-xs text-slate-500">
                            {job.submittedAt ? `Submitted: ${new Date(job.submittedAt).toLocaleDateString()}` : 'Draft'}
                          </div>
                        </div>
                      </div>

                      {/* Work Entries */}
                      {job.entries.length > 0 && (
                        <div className="mb-4">
                          <h5 className="text-sm font-medium text-slate-700 mb-3 flex items-center">
                            <Clock className="h-4 w-4 mr-1" />
                            Work Entries ({job.entries.length}):
                          </h5>
                          <div className="space-y-3">
                            {job.entries.map((entry) => (
                              <TimesheetEntryCard
                                key={entry.id}
                                entry={entry}
                              />
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Action buttons for draft jobs */}
                      {job.status === 'draft' && (
                        <div className="grid grid-cols-2 gap-3 mt-4">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEditEntries(job);
                            }}
                            className="bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-lg transition-colors flex items-center justify-center space-x-2"
                          >
                            <Edit className="h-4 w-4" />
                            <span>Edit Entries</span>
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteJob(job.id);
                            }}
                            className="bg-red-600 hover:bg-red-700 text-white py-2 px-4 rounded-lg transition-colors flex items-center justify-center space-x-2"
                          >
                            <Trash2 className="h-4 w-4" />
                            <span>Delete Job</span>
                          </button>
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Week Actions */}
                  {week.status === 'draft' && (
                    <div className="pt-4 border-t border-slate-200">
                      <div className="mb-3">
                        <button
                          onClick={onStartNewTimesheet}
                          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center space-x-2"
                        >
                          <Plus className="h-4 w-4" />
                          <span>Add Another Job to This Week</span>
                        </button>
                      </div>
                      <button
                        onClick={() => {
                          setSelectedWeek(week);
                          setShowSubmitModal(true);
                        }}
                        className="w-full bg-green-600 hover:bg-green-700 text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center space-x-2"
                      >
                        <Send className="h-4 w-4" />
                        <span>Submit Complete Week to Employer (£{week.totalValue.toFixed(2)})</span>
                      </button>
                      <p className="text-xs text-slate-500 mt-2 text-center">
                        This will submit all {week.jobCount} job{week.jobCount !== 1 ? 's' : ''} for this week
                      </p>
                    </div>
                  )}
                  
                  {week.status === 'submitted' && (
                    <div className="pt-4 border-t border-slate-200">
                      <div className="text-center">
                        <div className="inline-flex items-center space-x-2 text-green-600 bg-green-50 px-4 py-2 rounded-lg">
                          <Send className="h-4 w-4" />
                          <span className="text-sm font-medium">Week submitted to employer</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Submit Confirmation Modal */}
      {showSubmitModal && selectedWeek && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full">
            <div className="p-6">
              <h3 className="text-xl font-bold text-slate-900 mb-4">Submit Complete Week</h3>
              <p className="text-slate-600 mb-6">
                Are you sure you want to submit this entire week to your employer? 
                Once submitted, you cannot make changes.
              </p>
              
              <div className="bg-slate-50 rounded-lg p-4 mb-6">
                <div className="text-sm space-y-1">
                  <div><strong>Week Ending:</strong> {formatDate(selectedWeek.weekEnding)}</div>
                  <div><strong>Jobs:</strong> {selectedWeek.jobCount}</div>
                  <div><strong>Total Value:</strong> £{selectedWeek.totalValue.toFixed(2)}</div>
                </div>
              </div>
              
              <div className="flex space-x-3">
                <button
                  onClick={() => {
                    setShowSubmitModal(false);
                    setSelectedWeek(null);
                  }}
                  className="flex-1 px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleSubmitWeek(selectedWeek)}
                  className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                >
                  Submit Week
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Entries Modal */}
      {showEditEntriesModal && editingJobEntries && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-slate-900">
                  Edit Entries - Job {editingJobEntries.jobNumber}
                </h3>
                <button
                  onClick={() => {
                    setShowEditEntriesModal(false);
                    setEditingJobEntries(null);
                    setEditingEntries([]);
                  }}
                  className="text-slate-400 hover:text-slate-600 transition-colors"
                >
                  ✕
                </button>
              </div>

              {/* Add Entry Buttons */}
              <div className="mb-6">
                <div className="flex space-x-3">
                  <button
                    onClick={() => handleAddNewEntry('ipsom')}
                    className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg transition-colors flex items-center space-x-2"
                  >
                    <Plus className="h-4 w-4" />
                    <span>Add Ipsom Rate</span>
                  </button>
                  <button
                    onClick={() => handleAddNewEntry('mollsworth')}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg transition-colors flex items-center space-x-2"
                  >
                    <Plus className="h-4 w-4" />
                    <span>Add Mollsworth Rate</span>
                  </button>
                </div>
              </div>

              {/* Current Entries */}
              <div className="space-y-3 mb-6">
                {editingEntries.map((entry, index) => (
                  <div key={entry.id} className={`p-4 rounded-lg border ${
                    entry.type === 'ipsom' ? 'bg-purple-50 border-purple-200' :
                    entry.type === 'mollsworth' ? 'bg-indigo-50 border-indigo-200' :
                    'bg-orange-50 border-orange-200'
                  }`}>
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className={`font-medium ${
                          entry.type === 'ipsom' ? 'text-purple-800' :
                          entry.type === 'mollsworth' ? 'text-indigo-800' :
                          'text-orange-800'
                        }`}>
                          {entry.work_item}
                        </div>
                        <div className="text-sm text-slate-600 mt-1">
                          {entry.col2} • {entry.col3} {entry.col4 && `• ${entry.col4}`}
                        </div>
                        <div className="flex items-center space-x-4 mt-2">
                          <div>
                            <label className="text-xs text-slate-500">Quantity (m)</label>
                            <input
                              type="number"
                              value={entry.quantity}
                              onChange={(e) => {
                                const newQuantity = parseFloat(e.target.value) || 0;
                                const newTotal = newQuantity * entry.rate;
                                setEditingEntries(prev => prev.map((ent, i) => 
                                  i === index ? { ...ent, quantity: newQuantity, total: newTotal } : ent
                                ));
                              }}
                              className="w-20 px-2 py-1 border border-slate-300 rounded text-sm"
                              step="0.01"
                            />
                          </div>
                          <div className="text-sm">
                            <span className="text-slate-500">Rate: </span>
                            <span className="font-medium">£{entry.rate.toFixed(2)}</span>
                          </div>
                          <div className="text-sm">
                            <span className="text-slate-500">Total: </span>
                            <span className="font-bold text-green-600">£{entry.total.toFixed(2)}</span>
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => handleDeleteEntry(entry.id)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Total */}
              <div className="bg-slate-50 rounded-lg p-4 mb-6">
                <div className="text-right">
                  <div className="text-lg font-bold text-green-600">
                    New Total: £{editingEntries.reduce((sum, entry) => sum + entry.total, 0).toFixed(2)}
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex space-x-3">
                <button
                  onClick={() => {
                    setShowEditEntriesModal(false);
                    setEditingJobEntries(null);
                    setEditingEntries([]);
                  }}
                  className="flex-1 px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveEntries}
                  className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Edit Job Modal */}
      {showEditModal && editingJob && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full">
            <div className="p-6">
              <h3 className="text-xl font-bold text-slate-900 mb-4">Edit Job Details</h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Job Number
                  </label>
                  <input
                    type="text"
                    value={editForm.jobNumber}
                    onChange={(e) => setEditForm(prev => ({ ...prev, jobNumber: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Team Name
                  </label>
                  <input
                    type="text"
                    value={editForm.teamName}
                    onChange={(e) => setEditForm(prev => ({ ...prev, teamName: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Address
                  </label>
                  <input
                    type="text"
                    value={editForm.address}
                    onChange={(e) => setEditForm(prev => ({ ...prev, address: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
              
              <div className="flex space-x-3 mt-6">
                <button
                  onClick={() => {
                    setShowEditModal(false);
                    setEditingJob(null);
                  }}
                  className="flex-1 px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveEdit}
                  className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      <ChooseRateTypeModal
        isOpen={showChooseRateModal}
        onClose={() => setShowChooseRateModal(false)}
        onSelect={(mode) => {
          setCurrentMode(mode);
          setShowChooseRateModal(false);
          setShowPriceWorkWizard(true);
        }}
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
      />
    </div>
  );
};