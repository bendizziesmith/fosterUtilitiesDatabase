import { supabase } from './supabase';

export interface CreateUserRequest {
  email: string;
  password: string;
  full_name: string;
  role: 'employee' | 'admin';
}

export interface CreateUserResponse {
  success: boolean;
  message: string;
  user_id?: string;
  user?: {
    id: string;
    email: string;
    full_name: string;
    role: string;
    created_at: string;
  };
  error?: string;
}

export interface AddEmployeeRequest {
  firstName: string;
  lastName: string;
  role: string;
  email: string;
  password: string;
  assignedVehicle: string;
}

export interface AddEmployeeResponse {
  success: boolean;
  message: string;
  user_id?: string;
  employee_id?: string;
  employee?: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    role: string;
    created_at: string;
  };
  error?: string;
}

export const createUser = async (userData: CreateUserRequest): Promise<CreateUserResponse> => {
  try {
    // Get current session
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError || !session) {
      throw new Error('No active session. Please log in.');
    }

    // Call the edge function
    const { data, error } = await supabase.functions.invoke('create-user', {
      body: userData,
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    });

    if (error) {
      throw new Error(error.message || 'Failed to create user');
    }

    return data as CreateUserResponse;
  } catch (error) {
    console.error('Error creating user:', error);
    return {
      success: false,
      message: 'Failed to create user',
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
};

export const addEmployee = async (employeeData: AddEmployeeRequest): Promise<AddEmployeeResponse> => {
  try {
    // Get current session
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError || !session) {
      throw new Error('No active session. Please log in.');
    }

    console.log('Calling add-employee function with:', employeeData);

    // Call the edge function
    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/add-employee`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(employeeData),
    });

    const data = await response.json();

    console.log('Edge function response:', { data, response: response.status });
    if (!response.ok) {
      console.error('Edge function error details:', data);
      
      // Try to extract error message from various possible locations
      let errorMessage = 'Failed to add employee';
      
      if (data.error) {
        errorMessage = data.error;
      } else if (data.message) {
        errorMessage = data.message;
      }
      
      throw new Error(errorMessage);
    }
    
    // Check if the response indicates an error even if no error object
    if (data && !data.success && data.error) {
      throw new Error(data.error);
    }

    return data as AddEmployeeResponse;
  } catch (error) {
    console.error('Error adding employee:', error);
    return {
      success: false,
      message: 'Failed to add employee',
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
};