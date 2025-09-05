import React, { useState, useEffect } from 'react';
import {
  Plus, Edit, Trash2, Save, X, RefreshCw, Users, UserPlus, AlertTriangle
} from 'lucide-react';
import { supabase } from '../../../lib/supabase';

interface Vehicle {
  id: string;
  registration_number: string;
  make_model: string;
}

interface Employee {
  id: string;
  full_name: string;
  role: 'Ganger' | 'Labourer' | 'Backup Driver';
  rate: number;
  email: string;
  password: string;
  assigned_vehicle_id?: string | null;
  assigned_vehicle?: Vehicle | null;
  created_at: string;
}

interface EmployeeFormData {
  full_name: string;
  role: 'Ganger' | 'Labourer' | 'Backup Driver' | '';
  rate: string;
  email: string;
  password: string;
  assigned_vehicle_id: string | null;
}

interface EmployeeManagementProps {
  employees: any[];
  onEmployeesUpdate: () => void;
}

export const EmployeeManagement: React.FC<EmployeeManagementProps> = ({
  employees: _propEmployees,
  onEmployeesUpdate,
}) => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showAssignVehicleModal, setShowAssignVehicleModal] = useState(false);
  const [assigningEmployee, setAssigningEmployee] = useState<Employee | null>(null);
  const [selectedVehicleForAssignment, setSelectedVehicleForAssignment] = useState('');

  const [newEmployee, setNewEmployee] = useState<EmployeeFormData>({
    full_name: '',
    role: '',
    rate: '38.00',
    email: '',
    password: '',
    assigned_vehicle_id: null,
  });

  const [editForm, setEditForm] = useState<EmployeeFormData>({
    full_name: '',
    role: '',
    rate: '',
    email: '',
    password: '',
    assigned_vehicle_id: null,
  });

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      setLoading(true); setError(null);

      const { data: employeesData, error: employeesError } = await supabase
        .from('employees')
        .select(`
          *,
          assigned_vehicle:vehicles!assigned_vehicle_id(id, registration_number, make_model)
        `)
        .order('created_at', { ascending: false });
      if (employeesError) throw employeesError;

      const { data: vehiclesData, error: vehiclesError } = await supabase
        .from('vehicles')
        .select('id, registration_number, make_model')
        .order('registration_number');
      if (vehiclesError) throw vehiclesError;

      setEmployees((employeesData || []) as unknown as Employee[]);
      setVehicles((vehiclesData || []) as Vehicle[]);
    } catch (err) {
      console.error('Error loading data:', err);
      setError('Failed to load data. Please try again.');
    } finally { setLoading(false); }
  };

  const refreshData = async () => {
    setRefreshing(true);
    await loadData();
    onEmployeesUpdate && onEmployeesUpdate();
    setRefreshing(false);
  };

  const handleAddEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null); setSuccess(null);

    if (!newEmployee.full_name.trim() || !newEmployee.role || !newEmployee.rate || !newEmployee.email.trim() || !newEmployee.password.trim()) {
      setError('Please fill in all required fields'); return;
    }

    setLoading(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('add-employee', {
        body: {
          full_name: newEmployee.full_name.trim(),
          role: newEmployee.role,
          rate: parseFloat(newEmployee.rate),
          email: newEmployee.email.trim().toLowerCase(),
          password: newEmployee.password.trim(),
          assigned_vehicle_id: newEmployee.assigned_vehicle_id || null,
        },
      });

      if (fnError) throw new Error(fnError.message || 'Edge Function error');
      if (!data?.ok) throw new Error(data?.error || 'Failed to add employee');

      setSuccess(`Employee ${newEmployee.full_name} added and login created.`);
      setNewEmployee({ full_name: '', role: '', rate: '', email: '', password: '', assigned_vehicle_id: null });
      setShowAddForm(false);
      await loadData();
      onEmployeesUpdate && onEmployeesUpdate();
    } catch (err: any) {
      console.error('Error adding employee:', err);
      setError(err?.message || 'Failed to add employee');
    } finally { setLoading(false); }
  };

  const handleEditEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEmployee) return;

    setError(null); setSuccess(null); setLoading(true);
    try {
      const { error } = await supabase
        .from('employees')
        .update({
          full_name: editForm.full_name.trim(),
          role: editForm.role,
          rate: parseFloat(editForm.rate),
          email: editForm.email.trim(),
          assigned_vehicle_id: editForm.assigned_vehicle_id || null,
        })
        .eq('id', editingEmployee.id);
      if (error) throw error;

      setSuccess('Employee updated successfully!');
      setEditingEmployee(null);
      await loadData();
      onEmployeesUpdate && onEmployeesUpdate();
    } catch (err) {
      console.error('Error updating employee:', err);
      setError('Failed to update employee');
    } finally { setLoading(false); }
  };

  // DELETE — call existing 'delete-user' function on the server
  const handleDeleteEmployee = async (employee: Employee) => {
    if (!confirm(`Delete ${employee.full_name}? This also removes their login (if any).`)) return;

    setLoading(true); setError(null); setSuccess(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('delete-user', {
        body: { employee_id: employee.id },
      });
      if (fnErr) throw new Error(fnErr.message || 'Edge Function error');
      if (!data?.ok) throw new Error(data?.error || 'Failed to delete employee');

      setSuccess(`Employee ${employee.full_name} deleted successfully!`);
      await loadData();
      onEmployeesUpdate && onEmployeesUpdate();
    } catch (err: any) {
      console.error('Error deleting employee:', err);
      setError(err?.message || 'Failed to delete employee');
    } finally { setLoading(false); }
  };

  const openAssignVehicleModal = (employee: Employee) => {
    setAssigningEmployee(employee);
    setSelectedVehicleForAssignment(employee.assigned_vehicle?.id || '');
    setShowAssignVehicleModal(true);
  };

  const handleAssignVehicle = async (employeeId: string, vehicleId: string | null) => {
    setLoading(true); setError(null);
    try {
      const { error } = await supabase.from('employees').update({ assigned_vehicle_id: vehicleId }).eq('id', employeeId);
      if (error) throw error;
      setSuccess('Vehicle assignment updated successfully!');
      setShowAssignVehicleModal(false);
      setAssigningEmployee(null);
      setSelectedVehicleForAssignment('');
      await loadData();
      onEmployeesUpdate && onEmployeesUpdate();
    } catch (err) {
      console.error('Error assigning vehicle:', err);
      setError('Failed to assign vehicle');
    } finally { setLoading(false); }
  };

  const startEdit = (employee: Employee) => {
    setEditingEmployee(employee);
    setEditForm({
      full_name: employee.full_name,
      role: employee.role,
      rate: employee.rate.toString(),
      email: employee.email,
      password: '',
      assigned_vehicle_id: employee.assigned_vehicle_id || null,
    });
  };

  const cancelEdit = () => {
    setEditingEmployee(null);
    setEditForm({ full_name: '', role: '', rate: '', email: '', password: '', assigned_vehicle_id: null });
  };

  return (
    <div className="space-y-8">
      {/* header + stats omitted for brevity; left exactly as your current file */}
      {/* ... paste entire file as provided ... */}
    </div>
  );
};
