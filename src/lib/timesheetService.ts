import { supabase, Employee } from './supabase';
import { getWeekEndingSunday, DAYS_OF_WEEK, calculateDayHours } from './timesheetUtils';

export interface TimesheetWeek {
  id: string;
  ganger_employee_id: string;
  week_ending: string;
  status: 'draft' | 'submitted' | 'returned';
  ganger_name_snapshot: string;
  vehicle_id: string | null;
  vehicle_registration_snapshot: string | null;
  labourer_1_name: string | null;
  labourer_2_name: string | null;
  weekly_notes: string | null;
  weekly_total_hours: number;
  submitted_at: string | null;
  returned_at: string | null;
  returned_reason: string | null;
  submission_count: number;
  created_at: string;
  updated_at: string;
  job_rows?: TimesheetJobRow[];
  ganger?: Employee;
}

export interface TimesheetJobRow {
  id: string;
  timesheet_week_id: string;
  sort_order: number;
  job_number: string;
  job_address: string;
  default_start_time: string | null;
  default_finish_time: string | null;
  created_at: string;
  updated_at: string;
  day_entries?: TimesheetDayEntry[];
}

export interface TimesheetDayEntry {
  id: string;
  timesheet_job_row_id: string;
  day_of_week: string;
  start_time: string | null;
  finish_time: string | null;
  office_duration: string | null;
  hours_total: number;
  created_at: string;
  updated_at: string;
}

export async function loadTimesheetForWeek(
  gangerEmployeeId: string,
  weekEnding: string
): Promise<TimesheetWeek | null> {
  const { data, error } = await supabase
    .from('timesheet_weeks')
    .select(`
      *,
      job_rows:timesheet_job_rows(
        *,
        day_entries:timesheet_day_entries(*)
      )
    `)
    .eq('ganger_employee_id', gangerEmployeeId)
    .eq('week_ending', weekEnding)
    .maybeSingle();

  if (error) {
    console.error('Error loading timesheet:', error);
    throw error;
  }

  if (data?.job_rows) {
    data.job_rows.sort(
      (a: TimesheetJobRow, b: TimesheetJobRow) => a.sort_order - b.sort_order
    );
  }

  return data;
}

export async function loadGangerTimesheets(
  gangerEmployeeId: string
): Promise<TimesheetWeek[]> {
  const { data, error } = await supabase
    .from('timesheet_weeks')
    .select('*')
    .eq('ganger_employee_id', gangerEmployeeId)
    .order('week_ending', { ascending: false });

  if (error) {
    console.error('Error loading timesheets:', error);
    throw error;
  }

  return data || [];
}

export async function createTimesheetWeek(
  employee: Employee,
  weekEnding?: string
): Promise<TimesheetWeek> {
  const week = weekEnding || getWeekEndingSunday();

  const previousLabourers = await getLabourersFromPreviousWeek(employee.id);

  const { data, error } = await supabase
    .from('timesheet_weeks')
    .insert({
      ganger_employee_id: employee.id,
      week_ending: week,
      status: 'draft',
      ganger_name_snapshot: employee.full_name,
      vehicle_id: employee.assigned_vehicle_id || null,
      vehicle_registration_snapshot:
        employee.assigned_vehicle?.registration_number || null,
      labourer_1_name: previousLabourers.labourer1,
      labourer_2_name: previousLabourers.labourer2,
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating timesheet:', error);
    throw error;
  }

  return data;
}

async function getLabourersFromPreviousWeek(
  gangerEmployeeId: string
): Promise<{ labourer1: string | null; labourer2: string | null }> {
  const { data } = await supabase
    .from('timesheet_weeks')
    .select('labourer_1_name, labourer_2_name')
    .eq('ganger_employee_id', gangerEmployeeId)
    .order('week_ending', { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    labourer1: data?.labourer_1_name || null,
    labourer2: data?.labourer_2_name || null,
  };
}

export async function saveTimesheetHeader(
  timesheetId: string,
  updates: {
    labourer_1_name?: string | null;
    labourer_2_name?: string | null;
    weekly_notes?: string | null;
  }
): Promise<void> {
  const { error } = await supabase
    .from('timesheet_weeks')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', timesheetId);

  if (error) throw error;
}

export async function addJobRow(
  timesheetWeekId: string,
  sortOrder: number,
  jobNumber: string = '',
  jobAddress: string = ''
): Promise<TimesheetJobRow> {
  const { data, error } = await supabase
    .from('timesheet_job_rows')
    .insert({
      timesheet_week_id: timesheetWeekId,
      sort_order: sortOrder,
      job_number: jobNumber,
      job_address: jobAddress,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateJobRow(
  jobRowId: string,
  updates: {
    job_number?: string;
    job_address?: string;
    sort_order?: number;
    default_start_time?: string | null;
    default_finish_time?: string | null;
  }
): Promise<void> {
  const { error } = await supabase
    .from('timesheet_job_rows')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', jobRowId);

  if (error) throw error;
}

export async function deleteJobRow(jobRowId: string): Promise<void> {
  const { error } = await supabase
    .from('timesheet_job_rows')
    .delete()
    .eq('id', jobRowId);

  if (error) throw error;
}

export async function deleteDayEntry(
  jobRowId: string,
  dayOfWeek: string
): Promise<void> {
  const { error } = await supabase
    .from('timesheet_day_entries')
    .delete()
    .eq('timesheet_job_row_id', jobRowId)
    .eq('day_of_week', dayOfWeek);

  if (error) throw error;
}

export async function upsertDayEntry(
  jobRowId: string,
  dayOfWeek: string,
  startTime: string | null,
  finishTime: string | null
): Promise<TimesheetDayEntry> {
  const hoursTotal = calculateDayHours(startTime, finishTime);

  const { data, error } = await supabase
    .from('timesheet_day_entries')
    .upsert(
      {
        timesheet_job_row_id: jobRowId,
        day_of_week: dayOfWeek,
        start_time: startTime || null,
        finish_time: finishTime || null,
        office_duration: '00:00:00',
        hours_total: Math.round(hoursTotal * 100) / 100,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'timesheet_job_row_id,day_of_week' }
    )
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function recalculateWeeklyTotal(
  timesheetId: string
): Promise<number> {
  const { data: jobRows } = await supabase
    .from('timesheet_job_rows')
    .select('id')
    .eq('timesheet_week_id', timesheetId);

  if (!jobRows || jobRows.length === 0) {
    await supabase
      .from('timesheet_weeks')
      .update({ weekly_total_hours: 0, updated_at: new Date().toISOString() })
      .eq('id', timesheetId);
    return 0;
  }

  const rowIds = jobRows.map((r) => r.id);
  const { data: entries } = await supabase
    .from('timesheet_day_entries')
    .select('hours_total')
    .in('timesheet_job_row_id', rowIds);

  const total =
    entries?.reduce((sum, e) => sum + (e.hours_total || 0), 0) || 0;
  const rounded = Math.round(total * 100) / 100;

  await supabase
    .from('timesheet_weeks')
    .update({
      weekly_total_hours: rounded,
      updated_at: new Date().toISOString(),
    })
    .eq('id', timesheetId);

  return rounded;
}

export async function submitTimesheet(timesheetId: string): Promise<void> {
  const { data: current } = await supabase
    .from('timesheet_weeks')
    .select('submission_count')
    .eq('id', timesheetId)
    .single();

  const newCount = (current?.submission_count || 0) + 1;

  const { error } = await supabase
    .from('timesheet_weeks')
    .update({
      status: 'submitted',
      submitted_at: new Date().toISOString(),
      submission_count: newCount,
      updated_at: new Date().toISOString(),
    })
    .eq('id', timesheetId);

  if (error) throw error;
}

export async function returnTimesheet(
  timesheetId: string,
  reason: string
): Promise<void> {
  const { error } = await supabase
    .from('timesheet_weeks')
    .update({
      status: 'returned',
      returned_at: new Date().toISOString(),
      returned_reason: reason,
      updated_at: new Date().toISOString(),
    })
    .eq('id', timesheetId);

  if (error) throw error;
}

export async function loadAllSubmittedTimesheets(): Promise<TimesheetWeek[]> {
  const { data, error } = await supabase
    .from('timesheet_weeks')
    .select(`
      *,
      ganger:employees!ganger_employee_id(id, full_name, role)
    `)
    .in('status', ['submitted', 'returned'])
    .order('submitted_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function loadTimesheetsForWeek(
  weekEnding: string
): Promise<TimesheetWeek[]> {
  const { data, error } = await supabase
    .from('timesheet_weeks')
    .select(`
      *,
      ganger:employees!ganger_employee_id(id, full_name, role),
      job_rows:timesheet_job_rows(
        *,
        day_entries:timesheet_day_entries(*)
      )
    `)
    .eq('week_ending', weekEnding)
    .in('status', ['submitted', 'returned'])
    .order('ganger_name_snapshot');

  if (error) throw error;

  (data || []).forEach((ts: TimesheetWeek) => {
    if (ts.job_rows) {
      ts.job_rows.sort(
        (a: TimesheetJobRow, b: TimesheetJobRow) => a.sort_order - b.sort_order
      );
    }
  });

  return data || [];
}

export async function loadTimesheetDetail(
  timesheetId: string
): Promise<TimesheetWeek | null> {
  const { data, error } = await supabase
    .from('timesheet_weeks')
    .select(`
      *,
      ganger:employees!ganger_employee_id(id, full_name, role),
      job_rows:timesheet_job_rows(
        *,
        day_entries:timesheet_day_entries(*)
      )
    `)
    .eq('id', timesheetId)
    .maybeSingle();

  if (error) throw error;

  if (data?.job_rows) {
    data.job_rows.sort(
      (a: TimesheetJobRow, b: TimesheetJobRow) => a.sort_order - b.sort_order
    );
  }

  return data;
}
