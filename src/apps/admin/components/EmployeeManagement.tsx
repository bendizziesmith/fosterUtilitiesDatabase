// src/apps/admin/components/EmployeeManagement.tsx
import React, { useState, useEffect } from 'react';
import {
  Plus, Edit, Trash2, Save, X, RefreshCw, Users, UserPlus, AlertTriangle,
  KeyRound, Loader2
} from 'lucide-react';
import { supabase } from '../../../lib/supabase';

// ---------- Types ----------
interface Vehicle {
  id: string;
  registration_number: string;
  make_model: string; // your schema uses make_model (no separate make/model/year)
}

interface Employee {
  id: string;
  full_name: string;
  role: 'Ganger' | 'Labourer' | 'Backup Driver';
  rate: number;
  email: string;
  assigned_vehicle_id?: string | null;
  assigned_vehicle?: Vehicle | null;
  created_at: string;
}

interface EmployeeFormData {
  full_name: string;
  role: 'Ganger' | 'Labourer' | 'Backup Driver' | '';
  rate: string;
  email: string;
  password: string; // only for creating auth; we don't save it in employees
  assigned_vehicle_id: string | null;
}

interface EmployeeManagementProps {
  employees: any[];
  onEmployeesUpdate: () => void;
}

// ---------- Inline Enable Login button + modal ----------
const EnableLoginButton: React.FC<{ employee: Employee; onCreated?: () => void }> = ({ employee, onCreated }) => {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState((employee.email || '').toLowerCase());
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'employee' | 'admin'>('employee');
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const reset = () => { setPassword(''); setRole('employee'); setMsg(null); };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    if (!email || !password) {
      setMsg({ type: 'error', text: 'Email and temporary password are required.' });
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-user', {
        body: { email, password, role, employee_id: employee.id },
      });
      if (error) throw new Error(error.message || 'Function call failed');
      if (!data?.ok) throw new Error(data?.error || 'Server error creating user');
      setMsg({ type: 'success', text: `Login enabled for ${data.email} (role: ${data.role}).` });
      onCreated && onCreated();
      setTimeout(() => { setOpen(false); reset(); }, 900);
    } catch (err: any) {
      setMsg({ type: 'error', text: err?.message || 'Failed to create user.' });
    } finally { setSubmitting(false); }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="p-2 text-slate-600 hover:text-amber-700 hover:bg-amber-50 rounded-lg transition-colors"
        title="Enable login for this employee"
      >
        <KeyRound className="h-4 w-4" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => { setOpen(false); reset(); }} />
          <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-xl border border-slate-200">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center">
                  <KeyRound className="w-5 h-5 text-blue-600" />
                </div>
                <h2 className="text-lg font-semibold text-slate-900">Enable Login</h2>
              </div>
              <button onClick={() => { setOpen(false); reset(); }} className="p-1 rounded hover:bg-slate-100" aria-label="Close">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            {msg && (
              <div className={`mb-3 rounded-lg p-3 text-sm ${msg.type === 'success'
                ? 'bg-green-50 text-green-800 border border-green-200'
                : 'bg-red-50 text-red-800 border border-red-200'}`}>
                {msg.text}
              </div>
            )}

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                <input
                  type="email"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="employee@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value.toLowerCase())}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Temporary Password</label>
                <input
                  type="text"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Temporary password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <p className="text-xs text-slate-500 mt-1">Ask them to change this after first login.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Role</label>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2">
                    <input type="radio" name={`role-${employee.id}`} value="employee" checked={role === 'employee'} onChange={() => setRole('employee')} />
                    <span>Employee</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="radio" name={`role-${employee.id}`} value="admin" checked={role === 'admin'} onChange={() => setRole('admin')} />
                    <span>Admin</span>
                  </label>
                </div>
              </div>
              <div className="flex items-center justify-end gap-3 pt-2">
                <button type="button" onClick={() => { setOpen(false); reset(); }} className="rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-600 text-white px-4 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-60"
                >
                  {submitting ? (<><Loader2 className="w-4 h-4 animate-spin" />Creating…</>) : (<><UserPlus className="w-4 h-4" />Create Login</>)}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};

// ---------- Main ----------
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

      // IMPORTANT: vehicles table has no 'year' column
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
        .select('id, registration_number, make_model') // explicit (no year)
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

  // Keep your existing add flow; just don't store plaintext password in employees
  const handleAddEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null); setSuccess(null);
    if (!newEmployee.full_name.trim() || !newEmployee.role || !newEmployee.rate || !newEmployee.email.trim() || !newEmployee.password.trim()) {
      setError('Please fill in all required fields'); return;
    }
    setLoading(true);
    try {
      // 1) Create auth user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: newEmployee.email.trim(),
        password: newEmployee.password.trim(),
        options: { data: { full_name: newEmployee.full_name.trim() } }
      });
      if (authError) throw new Error(`Failed to create user account: ${authError.message}`);
      if (!authData.user) throw new Error('Failed to create user account - no user data returned');

      // 2) Create employee row
      const { data: employee, error: employeeError } = await supabase
        .from('employees')
        .insert({
          role: newEmployee.role,
          email: newEmployee.email.trim(),
          rate: parseFloat(newEmployee.rate),
          full_name: newEmployee.full_name.trim(),
          assigned_vehicle_id: newEmployee.assigned_vehicle_id || null,
          created_at: new Date().toISOString(),
        })
        .select()
        .single();
      if (employeeError) {
        await supabase.auth.admin.deleteUser(authData.user.id); // rollback
        throw employeeError;
      }

      // 3) Link profile
      const { error: profileError } = await supabase.from('user_profiles').insert({
        id: authData.user.id,
        employee_id: employee.id,
        role: 'employee',
      });
      if (profileError) console.warn('Profile insert failed (user can still log in):', profileError);

      setSuccess(`Employee ${newEmployee.full_name} added successfully!`);
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

  // Delete fully: remove linked auth + profile (server function), then employee row
  const handleDeleteEmployee = async (employee: Employee) => {
    if (!confirm(`Delete ${employee.full_name}? This also removes their login if it exists.`)) return;

    setLoading(true); setError(null);
    try {
      // 1) Try to delete login/profile (non-fatal if none)
      const { data: delData, error: delFnErr } = await supabase.functions.invoke('delete-user-by-employee', {
        body: { employee_id: employee.id },
      });
      if (delFnErr) console.warn('delete-user-by-employee warning:', delFnErr.message);
      else if (delData?.error) console.warn('delete-user-by-employee:', delData.error);

      // 2) Delete employee row
      const { error } = await supabase.from('employees').delete().eq('id', employee.id);
      if (error) throw error;

      setSuccess(`Employee ${employee.full_name} deleted successfully!`);
      await loadData();
      onEmployeesUpdate && onEmployeesUpdate();
    } catch (err) {
      console.error('Error deleting employee:', err);
      setError('Failed to delete employee');
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
      password: '', // not used
      assigned_vehicle_id: employee.assigned_vehicle_id || null,
    });
  };

  const cancelEdit = () => {
    setEditingEmployee(null);
    setEditForm({ full_name: '', role: '', rate: '', email: '', password: '', assigned_vehicle_id: null });
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="bg-white rounded-2xl shadow-sm p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <div className="p-3 bg-blue-100 rounded-lg"><Users className="h-6 w-6 text-blue-600" /></div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Employee Management</h1>
              <p className="text-slate-600">Add, edit, and manage employee accounts</p>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={refreshData}
              disabled={refreshing}
              className="flex items-center space-x-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 disabled:bg-slate-50 rounded-lg transition-colors"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              <span>{refreshing ? 'Refreshing...' : 'Refresh'}</span>
            </button>
            <button
              onClick={() => setShowAddForm(true)}
              className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg transition-colors"
            >
              <Plus className="h-5 w-5" />
              <span>Add Employee</span>
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
            <div className="text-2xl font-bold text-blue-700">{employees.length}</div>
            <div className="text-sm text-blue-600">Total Employees</div>
          </div>
          <div className="bg-green-50 rounded-lg p-4 border border-green-200">
            <div className="text-2xl font-bold text-green-700">{employees.filter(e => e.role === 'Ganger').length}</div>
            <div className="text-sm text-green-600">Gangers</div>
          </div>
          <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
            <div className="text-2xl font-bold text-purple-700">{employees.filter(e => e.role === 'Labourer').length}</div>
            <div className="text-sm text-purple-600">Labourers</div>
          </div>
        </div>
      </div>

      {/* Success/Error */}
      {success && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4">
          <div className="flex items-center space-x-2 text-green-800">
            <UserPlus className="h-5 w-5" />
            <span className="text-sm font-medium">{success}</span>
          </div>
        </div>
      )}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="flex items-center space-x-2 text-red-800">
            <AlertTriangle className="h-5 w-5" />
            <span className="text-sm font-medium">{error}</span>
          </div>
        </div>
      )}

      {/* Add Employee Form */}
      {showAddForm && (
        <div className="bg-white rounded-2xl shadow-sm p-6 border border-blue-200">
          <h3 className="text-lg font-semibold text-slate-900 mb-6">Add New Employee</h3>
          <form onSubmit={handleAddEmployee} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Full Name *</label>
                <input
                  type="text"
                  value={newEmployee.full_name}
                  onChange={(e) => setNewEmployee(prev => ({ ...prev, full_name: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="John Doe"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Role *</label>
                <select
                  value={newEmployee.role}
                  onChange={(e) => setNewEmployee(prev => ({ ...prev, role: e.target.value as any }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                >
                  <option value="">Select Role</option>
                  <option value="Ganger">Ganger</option>
                  <option value="Labourer">Labourer</option>
                  <option value="Backup Driver">Backup Driver</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Hourly Rate (£) *</label>
                <input
                  type="number"
                  step="0.01"
                  value={newEmployee.rate}
                  onChange={(e) => setNewEmployee(prev => ({ ...prev, rate: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="38.00"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Email *</label>
                <input
                  type="email"
                  value={newEmployee.email}
                  onChange={(e) => setNewEmployee(prev => ({ ...prev, email: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="john@example.com"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Password *</label>
                <input
                  type="password"
                  value={newEmployee.password}
                  onChange={(e) => setNewEmployee(prev => ({ ...prev, password: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Enter password"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Assigned Vehicle (Optional)</label>
                <select
                  value={newEmployee.assigned_vehicle_id || ''}
                  onChange={(e) => setNewEmployee(prev => ({ ...prev, assigned_vehicle_id: e.target.value || null }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Select Vehicle</option>
                  {vehicles.map((vehicle) => (
                    <option key={vehicle.id} value={vehicle.id}>
                      {vehicle.registration_number} - {vehicle.make_model}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex space-x-3">
              <button
                type="submit"
                disabled={loading}
                className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-6 py-3 rounded-lg transition-colors"
              >
                <Save className="h-4 w-4" />
                <span>{loading ? 'Adding...' : 'Add Employee'}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowAddForm(false);
                  setNewEmployee({ full_name: '', role: '', rate: '', email: '', password: '', assigned_vehicle_id: null });
                  setError(null); setSuccess(null);
                }}
                className="flex items-center space-x-2 bg-slate-200 hover:bg-slate-300 text-slate-700 px-6 py-3 rounded-lg transition-colors"
              >
                <X className="h-4 w-4" />
                <span>Cancel</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Employees List */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-200">
          <h3 className="text-lg font-semibold text-slate-900">Employees ({employees.length})</h3>
        </div>

        {loading && !refreshing ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-2 text-slate-600">Loading employees...</p>
          </div>
        ) : employees.length === 0 ? (
          <div className="p-8 text-center">
            <Users className="h-12 w-12 text-slate-400 mx-auto mb-4" />
            <p className="text-slate-600">No employees found.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {employees.map((employee) => (
              <div key={employee.id} className="p-6">
                {editingEmployee?.id === employee.id ? (
                  <form onSubmit={handleEditEmployee} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <input
                        type="text"
                        value={editForm.full_name}
                        onChange={(e) => setEditForm(prev => ({ ...prev, full_name: e.target.value }))}
                        className="px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="Full Name"
                        required
                      />
                      <select
                        value={editForm.role}
                        onChange={(e) => setEditForm(prev => ({ ...prev, role: e.target.value as any }))}
                        className="px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        required
                      >
                        <option value="Ganger">Ganger</option>
                        <option value="Labourer">Labourer</option>
                        <option value="Backup Driver">Backup Driver</option>
                      </select>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <input
                        type="number"
                        step="0.01"
                        value={editForm.rate}
                        onChange={(e) => setEditForm(prev => ({ ...prev, rate: e.target.value }))}
                        className="px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="Hourly Rate"
                        required
                      />
                      <input
                        type="email"
                        value={editForm.email}
                        onChange={(e) => setEditForm(prev => ({ ...prev, email: e.target.value }))}
                        className="px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="Email"
                        required
                      />
                      <select
                        value={editForm.assigned_vehicle_id || ''}
                        onChange={(e) => setEditForm(prev => ({ ...prev, assigned_vehicle_id: e.target.value || null }))}
                        className="px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        <option value="">Select Vehicle</option>
                        {vehicles.map((vehicle) => (
                          <option key={vehicle.id} value={vehicle.id}>
                            {vehicle.registration_number} - {vehicle.make_model}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex space-x-3">
                      <button
                        type="submit"
                        disabled={loading}
                        className="flex items-center space-x-2 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white px-4 py-2 rounded-lg transition-colors"
                      >
                        <Save className="h-4 w-4" />
                        <span>{loading ? 'Saving...' : 'Save'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={cancelEdit}
                        className="flex items-center space-x-2 bg-slate-200 hover:bg-slate-300 text-slate-700 px-4 py-2 rounded-lg transition-colors"
                      >
                        <X className="h-4 w-4" />
                        <span>Cancel</span>
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <div className="p-3 bg-blue-100 rounded-lg">
                        <Users className="h-6 w-6 text-blue-600" />
                      </div>
                      <div>
                        <h4 className="text-lg font-semibold text-slate-900">{employee.full_name}</h4>
                        <div className="space-y-1">
                          <p className="text-sm text-slate-600"><span className="font-medium">Role:</span> {employee.role}</p>
                          <p className="text-sm text-slate-600"><span className="font-medium">Rate:</span> £{employee.rate}/hour</p>
                          <p className="text-sm text-slate-600"><span className="font-medium">Email:</span> {employee.email}</p>
                          <p className="text-sm text-slate-600">
                            <span className="font-medium">Vehicle:</span>{' '}
                            {employee.assigned_vehicle
                              ? `${employee.assigned_vehicle.registration_number} - ${employee.assigned_vehicle.make_model}`
                              : 'Not assigned'}
                          </p>
                          <p className="text-xs text-slate-500">Added: {new Date(employee.created_at).toLocaleDateString()}</p>
                        </div>
                      </div>
                    </div>
                    <div className="flex space-x-2">
                      {/* Assign Vehicle */}
                      <button
                        onClick={() => openAssignVehicleModal(employee)}
                        className="p-2 text-slate-600 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                        title="Assign Vehicle"
                      >
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                        </svg>
                      </button>

                      {/* Enable Login (NEW) */}
                      <EnableLoginButton employee={employee} onCreated={refreshData} />

                      {/* Edit */}
                      <button
                        onClick={() => startEdit(employee)}
                        className="p-2 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      >
                        <Edit className="h-4 w-4" />
                      </button>

                      {/* Delete */}
                      <button
                        onClick={() => handleDeleteEmployee(employee)}
                        className="p-2 text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Assign Vehicle Modal */}
      {showAssignVehicleModal && assigningEmployee && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full">
            <div className="p-6">
              <h3 className="text-xl font-bold text-slate-900 mb-4">
                Assign Vehicle to {assigningEmployee.full_name}
              </h3>

              <div className="mb-6">
                <label className="block text-sm font-medium text-slate-700 mb-2">Select Vehicle</label>
                <select
                  value={selectedVehicleForAssignment}
                  onChange={(e) => setSelectedVehicleForAssignment(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Unassigned</option>
                  {vehicles.map((vehicle) => {
                    const isAssigned = employees.some(emp => emp.assigned_vehicle_id === vehicle.id && emp.id !== assigningEmployee.id);
                    return (
                      <option key={vehicle.id} value={vehicle.id} disabled={isAssigned}>
                        {vehicle.registration_number} - {vehicle.make_model} {isAssigned ? '(Already assigned)' : ''}
                      </option>
                    );
                  })}
                </select>
              </div>

              <div className="flex space-x-3">
                <button
                  onClick={() => { setShowAssignVehicleModal(false); setAssigningEmployee(null); setSelectedVehicleForAssignment(''); }}
                  className="flex-1 px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleAssignVehicle(assigningEmployee.id, selectedVehicleForAssignment || null)}
                  disabled={loading}
                  className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg transition-colors"
                >
                  {loading ? 'Assigning...' : 'Assign Vehicle'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
