import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Database types
export interface Vehicle {
  id: string;
  registration_number: string;
  make_model: string;
  next_service_date?: string | null;
  next_mot_date?: string | null;
  last_service_date?: string | null;
  last_mot_date?: string | null;
  created_at: string;
}

export interface Employee {
  id: string;
  full_name: string;
  role: string;
  assigned_vehicle_id?: string;
  created_at: string;
  assigned_vehicle?: Vehicle;
  user_id?: string;
  driving_license?: string;
  training_qualifications?: string[];
  is_ganger?: boolean;
  emergency_contact?: string;
  phone_number?: string;
  start_date?: string;
  email?: string;
  rate: number;
  password: string;
}

export interface ChecklistTemplate {
  id: string;
  name: string;
  items: string[];
  created_at: string;
}

export interface VehicleInspection {
  id: string;
  vehicle_id: string;
  employee_id?: string;
  override_vehicle_registration?: string;
  submitted_at: string;
  has_defects: boolean;
  vehicle?: Vehicle;
  employee?: Employee;
  inspection_items?: InspectionItem[];
}

export interface InspectionItem {
  id: string;
  inspection_id: string;
  item_name: string;
  status: 'no_defect' | 'defect';
  comments?: string;
  photo_url?: string;
}

export interface PlantRecord {
  id: string;
  vehicle_id: string;
  employee_id?: string;
  override_vehicle_registration?: string;
  description: string;
  photo_url?: string;
  submitted_at: string;
  vehicle?: Vehicle;
  employee?: Employee;
}

// Timesheet system types
export interface WorkRate {
  id: string;
  work_type: string;
  voltage_type: 'LV' | 'HV' | 'ANY';
  site_type?: string;
  rate_type: 'price_work' | 'day_rate';
  rate_value: number;
  unit?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Timesheet {
  id: string;
  employee_id: string;
  team_name: string;
  job_number: string;
  address?: string;
  week_ending: string;
  sheet_number?: string;
  status: 'draft' | 'submitted' | 'approved';
  total_value: number;
  supervisor_signature?: string;
  employee_signature?: string;
  agreed_daywork_reason?: string;
  agreed_daywork_hours?: number;
  created_at: string;
  submitted_at?: string;
  updated_at: string;
  employee?: Employee;
  timesheet_entries?: TimesheetEntry[];
}

export interface TimesheetEntry {
  id: string;
  timesheet_id: string;
  ipsom_rate_id?: string;
  mollsworth_rate_id?: string;
  work_rate_id?: string;
  work_item?: string;
  col2?: string;
  col3?: string;
  col4?: string;
  quantity?: number;
  rate_gbp?: number;
  monday: number;
  tuesday: number;
  wednesday: number;
  thursday: number;
  friday: number;
  saturday: number;
  sunday: number;
  total_hours: number;
  line_total: number;
  created_at: string;
  work_rate?: WorkRate;
  ipsom_rate?: IpsomRate;
  mollsworth_rate?: MollsworthWorkRate;
}

// Ipsom Rates types
export interface IpsomRate {
  id: string;
  sheet_no: number;
  line_no: number;
  work_item: string;
  col2: string;
  col3: string;
  col4: string;
  rate_gbp: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// Mollsworth Work Rates types
export interface MollsworthWorkRate {
  id: string;
  col1_work_item: string;
  col2_param: string;
  col3_param: string;
  col4_param: string;
  rate_gbp: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// Helper functions
export const uploadInspectionPhoto = async (file: File, inspectionId: string, itemName: string) => {
  const fileExt = file.name.split('.').pop();
  const fileName = `${inspectionId}_${itemName.replace(/\s+/g, '_')}_${Date.now()}.${fileExt}`;
  
  const { data, error } = await supabase.storage
    .from('inspection-photos')
    .upload(fileName, file);

  if (error) throw error;

  const { data: { publicUrl } } = supabase.storage
    .from('inspection-photos')
    .getPublicUrl(data.path);

  return publicUrl;
};

export const uploadPlantPhoto = async (file: File, recordId: string) => {
  const fileExt = file.name.split('.').pop();
  const fileName = `plant_${recordId}_${Date.now()}.${fileExt}`;
  
  const { data, error } = await supabase.storage
    .from('inspection-photos')
    .upload(fileName, file);

  if (error) throw error;

  const { data: { publicUrl } } = supabase.storage
    .from('inspection-photos')
    .getPublicUrl(data.path);

  return publicUrl;
};

// Vehicle assignment helpers
export const getVehicleServiceStatus = (vehicle: Vehicle) => {
  const today = new Date();
  const serviceDate = vehicle.next_service_date ? new Date(vehicle.next_service_date) : null;
  const motDate = vehicle.next_mot_date ? new Date(vehicle.next_mot_date) : null;
  
  const serviceDaysUntil = serviceDate ? Math.ceil((serviceDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)) : null;
  const motDaysUntil = motDate ? Math.ceil((motDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)) : null;
  
  return {
    serviceOverdue: serviceDaysUntil !== null && serviceDaysUntil < 0,
    serviceDue: serviceDaysUntil !== null && serviceDaysUntil <= 30 && serviceDaysUntil >= 0,
    motOverdue: motDaysUntil !== null && motDaysUntil < 0,
    motDue: motDaysUntil !== null && motDaysUntil <= 30 && motDaysUntil >= 0,
    serviceDaysUntil,
    motDaysUntil,
  };
};

export const getWeekEndDate = (date: Date = new Date()): Date => {
  const weekStart = getWeekStartDate(date);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  return weekEnd;
};

// Week calculation helpers
export const getWeekStartDate = (date: Date = new Date()): Date => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
  return new Date(d.setDate(diff));
};