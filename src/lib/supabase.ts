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

export interface GangOperative {
  id: string;
  full_name: string;
  role: string;
  is_manual: boolean;
  employee_id?: string;
}

export interface GangMembership {
  id: string;
  week_ending: string;
  ganger_id: string;
  operative_id?: string;
  operative_name?: string;
  operative_role: string;
  is_manual: boolean;
  created_at: string;
  updated_at: string;
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
  notes?: string;
  comments?: string;
  photo_url?: string;
  defect_severity?: string;
  action_required?: boolean;
  completion_date?: string;
  defect_status?: 'active' | 'fixed';
  defect_fixed?: boolean;
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

// HAVs Timesheet types (Legacy - kept for backwards compatibility)
export interface HavsTimesheet {
  id: string;
  employee_id: string;
  employee_name: string;
  employee_no?: string;
  week_ending: string;
  comments?: string;
  actions?: string;
  supervisor_name?: string;
  supervisor_signature?: string;
  date_signed?: string;
  status: 'draft' | 'submitted';
  submitted_at?: string;
  total_hours: number;
  created_at: string;
  updated_at: string;
  employee?: Employee;
  havs_entries?: HavsTimesheetEntry[];
}

export interface HavsTimesheetEntry {
  id: string;
  timesheet_id: string;
  equipment_name: string;
  equipment_category: 'CIVILS' | 'JOINTING' | 'OVERHEADS' | 'EARTH PIN DRIVER';
  monday_hours: number;
  tuesday_hours: number;
  wednesday_hours: number;
  thursday_hours: number;
  friday_hours: number;
  saturday_hours: number;
  sunday_hours: number;
  total_hours: number;
  created_at: string;
  updated_at: string;
}

// New Gang-Based HAVS types
export interface HavsWeek {
  id: string;
  ganger_id: string;
  week_ending: string;
  status: 'draft' | 'submitted';
  submitted_at?: string;
  last_saved_at?: string;
  revision_number?: number;
  created_at: string;
  updated_at: string;
  members?: HavsWeekMember[];
  ganger?: Employee;
}

export interface HavsRevision {
  id: string;
  havs_week_id: string;
  revision_number: number;
  snapshot_data: any;
  created_at: string;
  created_by?: string;
  notes?: string;
}

export interface HavsWeekMember {
  id: string;
  havs_week_id: string;
  person_type: 'ganger' | 'operative';
  employee_id?: string;
  manual_name?: string;
  role: string;
  comments?: string;
  actions?: string;
  created_at: string;
  employee?: Employee;
  exposure_entries?: HavsExposureEntry[];
}

export interface HavsExposureEntry {
  id: string;
  havs_week_member_id: string;
  equipment_name: string;
  equipment_category: 'CIVILS' | 'JOINTING' | 'OVERHEADS' | 'EARTH PIN DRIVER';
  day_of_week: 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';
  minutes: number;
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