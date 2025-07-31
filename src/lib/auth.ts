import { supabase } from './supabase';

export interface UserProfile {
  id: string;
  employee_id?: string;
  role: 'employee' | 'admin';
  employee?: any;
}

export const getCurrentUser = async (): Promise<{ user: any; profile: UserProfile | null }> => {
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  
  if (userError || !user) {
    return { user: null, profile: null };
  }

  // Get user profile
  const { data: profile, error: profileError } = await supabase
    .from('user_profiles')
    .select(`
      *,
      employee:employees(*)
    `)
    .eq('id', user.id)
    .maybeSingle();

  if (profileError) {
    // Log actual database errors (maybeSingle won't error for no rows found)
    console.error('Error fetching user profile:', profileError);
    return { user, profile: null };
  }

  return { user, profile };
};

export const signOut = async () => {
  const { error } = await supabase.auth.signOut();
  if (error) {
    console.error('Error signing out:', error);
    throw error;
  }
};

export const createEmployeeAccount = async (employeeData: {
  name: string;
  email: string;
  password: string;
  role: string;
  assigned_vehicle_id?: string;
  driving_license?: string;
  training_qualifications?: string[];
  is_ganger?: boolean;
  emergency_contact?: string;
  phone_number?: string;
  start_date?: string;
}) => {
  // Create auth user directly with Supabase Auth
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email: employeeData.email.trim(),
    password: employeeData.password,
    options: {
      emailRedirectTo: undefined, // Disable email confirmation
      data: {
        full_name: employeeData.name.trim()
      }
    }
  });

  if (authError) {
    throw new Error(`Failed to create user account: ${authError.message}`);
  }

  if (!authData.user) {
    throw new Error('Failed to create user account - no user data returned');
  }

  // Now create the employee record
  const { data: employee, error: employeeError } = await supabase
    .from('employees')
    .insert({
      name: employeeData.name.trim(),
      email: employeeData.email.trim(),
      role: employeeData.role.trim(),
      user_id: authData.user.id,
      assigned_vehicle_id: employeeData.assigned_vehicle_id || null,
      driving_license: employeeData.driving_license || null,
      training_qualifications: employeeData.training_qualifications?.length ? employeeData.training_qualifications : null,
      is_ganger: employeeData.is_ganger || false,
      emergency_contact: employeeData.emergency_contact || null,
      phone_number: employeeData.phone_number || null,
      start_date: employeeData.start_date || null,
    })
    .select()
    .maybeSingle();

  if (employeeError) throw employeeError;

  // Create user profile linking the auth user to the employee
  const { error: profileError } = await supabase
    .from('user_profiles')
    .insert({
      id: authData.user.id,
      employee_id: employee.id,
      role: 'employee'
    });

  if (profileError) {
    // Log actual database errors
    // Don't fail the entire process if profile creation fails
    // The user can still log in and we'll create the profile during login
  }

  return { 
    employee, 
    user: { 
      id: authData.user.id,
      email: employeeData.email.trim()
    }
  };
};