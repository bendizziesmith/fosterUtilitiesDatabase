import React, { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, Car, Save, X, Calendar, AlertTriangle, RefreshCw } from 'lucide-react';
import { supabase, Vehicle, Employee, getVehicleServiceStatus } from '../../../lib/supabase';

interface VehicleFormData {
  registration_number: string;
  make_model: string;
  next_service_date: string;
  next_mot_date: string;
  last_service_date: string;
  last_mot_date: string;
}

const VehicleManagement: React.FC = () => {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const [newVehicle, setNewVehicle] = useState<VehicleFormData>({
    registration_number: '',
    make_model: '',
    next_service_date: '',
    next_mot_date: '',
    last_service_date: '',
    last_mot_date: '',
  });

  const [editForm, setEditForm] = useState<VehicleFormData>({
    registration_number: '',
    make_model: '',
    next_service_date: '',
    next_mot_date: '',
    last_service_date: '',
    last_mot_date: '',
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setError(null);
      
      // Load vehicles
      const { data: vehiclesData, error: vehiclesError } = await supabase
        .from('vehicles')
        .select('*')
        .order('registration_number');

      if (vehiclesError) throw vehiclesError;

      // Load employees
      const { data: employeesData, error: employeesError } = await supabase
        .from('employees')
        .select('*')
        .order('full_name');

      if (employeesError) throw employeesError;

      setVehicles(vehiclesData || []);
      setEmployees(employeesData || []);
    } catch (err) {
      console.error('Error loading data:', err);
      setError('Failed to load data. Please refresh the page.');
    }
  };

  const refreshData = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleAddVehicle = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!newVehicle.registration_number.trim() || !newVehicle.make_model.trim()) {
      setError('Registration number and make/model are required');
      return;
    }

    setLoading(true);
    
    try {
      const { error } = await supabase
        .from('vehicles')
        .insert({
          registration_number: newVehicle.registration_number.trim().toUpperCase(),
          make_model: newVehicle.make_model.trim(),
          next_service_date: newVehicle.next_service_date || null,
          next_mot_date: newVehicle.next_mot_date || null,
          last_service_date: newVehicle.last_service_date || null,
          last_mot_date: newVehicle.last_mot_date || null,
        });

      if (error) throw error;

      setSuccess(`Vehicle ${newVehicle.registration_number} added successfully!`);
      setNewVehicle({
        registration_number: '',
        make_model: '',
        next_service_date: '',
        next_mot_date: '',
        last_service_date: '',
        last_mot_date: '',
      });
      setShowAddForm(false);
      await loadData();
    } catch (err) {
      console.error('Error adding vehicle:', err);
      setError(err instanceof Error ? err.message : 'Failed to add vehicle');
    } finally {
      setLoading(false);
    }
  };

  const handleEditVehicle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingVehicle) return;

    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      const { error } = await supabase
        .from('vehicles')
        .update({
          registration_number: editForm.registration_number.trim().toUpperCase(),
          make_model: editForm.make_model.trim(),
          next_service_date: editForm.next_service_date || null,
          next_mot_date: editForm.next_mot_date || null,
          last_service_date: editForm.last_service_date || null,
          last_mot_date: editForm.last_mot_date || null,
        })
        .eq('id', editingVehicle.id);

      if (error) throw error;

      setSuccess(`Vehicle updated successfully!`);
      setEditingVehicle(null);
      await loadData();
    } catch (err) {
      console.error('Error updating vehicle:', err);
      setError('Failed to update vehicle');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteVehicle = async (vehicle: Vehicle) => {
    if (!confirm(`Are you sure you want to delete vehicle ${vehicle.registration_number}?`)) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { error } = await supabase
        .from('vehicles')
        .delete()
        .eq('id', vehicle.id);

      if (error) throw error;

      setSuccess(`Vehicle ${vehicle.registration_number} deleted successfully!`);
      await loadData();
    } catch (err) {
      console.error('Error deleting vehicle:', err);
      setError('Failed to delete vehicle');
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (vehicle: Vehicle) => {
    setEditingVehicle(vehicle);
    setEditForm({
      registration_number: vehicle.registration_number,
      make_model: vehicle.make_model,
      next_service_date: vehicle.next_service_date || '',
      next_mot_date: vehicle.next_mot_date || '',
      last_service_date: vehicle.last_service_date || '',
      last_mot_date: vehicle.last_mot_date || '',
    });
  };

  const cancelEdit = () => {
    setEditingVehicle(null);
    setEditForm({
      registration_number: '',
      make_model: '',
      next_service_date: '',
      next_mot_date: '',
      last_service_date: '',
      last_mot_date: '',
    });
  };

  const handleAssignVehicle = async (vehicleId: string, employeeId: string | null) => {
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      // First, unassign this vehicle from any other employee
      const { error: unassignError } = await supabase
        .from('employees')
        .update({ assigned_vehicle_id: null })
        .eq('assigned_vehicle_id', vehicleId);

      if (unassignError) throw unassignError;

      // If assigning to a new employee, update that employee's record
      if (employeeId) {
        // First, unassign any other vehicle from this employee
        const { error: clearError } = await supabase
          .from('employees')
          .update({ assigned_vehicle_id: null })
          .eq('id', employeeId);

        if (clearError) throw clearError;

        // Now assign the new vehicle to this employee
        const { error: assignError } = await supabase
          .from('employees')
          .update({ assigned_vehicle_id: vehicleId })
          .eq('id', employeeId);

        if (assignError) throw assignError;

        const employee = employees.find(e => e.id === employeeId);
        const vehicle = vehicles.find(v => v.id === vehicleId);
        setSuccess(`Vehicle ${vehicle?.registration_number} assigned to ${employee?.full_name} successfully!`);
      } else {
        const vehicle = vehicles.find(v => v.id === vehicleId);
        setSuccess(`Vehicle ${vehicle?.registration_number} unassigned successfully!`);
      }

      // Reload data to reflect changes
      await loadData();
    } catch (err) {
      console.error('Error assigning vehicle:', err);
      setError('Failed to assign vehicle. Please try again.');
    } finally {
      setLoading(false);
    }
  };
  // Filter vehicles
  const filteredVehicles = vehicles.filter(vehicle => {
    const matchesSearch = vehicle.registration_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         vehicle.make_model.toLowerCase().includes(searchTerm.toLowerCase());
    
    if (!filterStatus) return matchesSearch;
    
    const serviceStatus = getVehicleServiceStatus(vehicle);
    switch (filterStatus) {
      case 'service_due':
        return matchesSearch && (serviceStatus.serviceDue || serviceStatus.serviceOverdue);
      case 'mot_due':
        return matchesSearch && (serviceStatus.motDue || serviceStatus.motOverdue);
      case 'overdue':
        return matchesSearch && (serviceStatus.serviceOverdue || serviceStatus.motOverdue);
      case 'assigned':
        return matchesSearch && employees.some(emp => emp.assigned_vehicle_id === vehicle.id);
      case 'unassigned':
        return matchesSearch && !employees.some(emp => emp.assigned_vehicle_id === vehicle.id);
      default:
        return matchesSearch;
    }
  });

  // Calculate stats
  const totalVehicles = vehicles.length;
  const assignedVehicles = vehicles.filter(v => employees.some(emp => emp.assigned_vehicle_id === v.id)).length;
  const serviceDue = vehicles.filter(v => {
    const status = getVehicleServiceStatus(v);
    return status.serviceDue || status.serviceOverdue;
  }).length;
  const motDue = vehicles.filter(v => {
    const status = getVehicleServiceStatus(v);
    return status.motDue || status.motOverdue;
  }).length;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="bg-white rounded-2xl shadow-sm p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <div className="p-3 bg-orange-100 rounded-lg">
              <Car className="h-6 w-6 text-orange-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Vehicle Fleet Management</h1>
              <p className="text-slate-600">Manage fleet vehicles, service schedules, and assignments</p>
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
              className="flex items-center space-x-2 bg-orange-600 hover:bg-orange-700 text-white px-6 py-3 rounded-lg transition-colors"
            >
              <Plus className="h-5 w-5" />
              <span>Add Vehicle</span>
            </button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
            <div className="text-2xl font-bold text-blue-700">{totalVehicles}</div>
            <div className="text-sm text-blue-600">Total Vehicles</div>
          </div>
          <div className="bg-green-50 rounded-lg p-4 border border-green-200">
            <div className="text-2xl font-bold text-green-700">{assignedVehicles}</div>
            <div className="text-sm text-green-600">Assigned</div>
          </div>
          <div className="bg-amber-50 rounded-lg p-4 border border-amber-200">
            <div className="text-2xl font-bold text-amber-700">{serviceDue}</div>
            <div className="text-sm text-amber-600">Service Due</div>
          </div>
          <div className="bg-red-50 rounded-lg p-4 border border-red-200">
            <div className="text-2xl font-bold text-red-700">{motDue}</div>
            <div className="text-sm text-red-600">MOT Due</div>
          </div>
        </div>

        {/* Search and Filters */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Search</label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              placeholder="Search by registration or make/model..."
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Filter by Status</label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
            >
              <option value="">All Vehicles</option>
              <option value="assigned">Assigned</option>
              <option value="unassigned">Unassigned</option>
              <option value="service_due">Service Due</option>
              <option value="mot_due">MOT Due</option>
              <option value="overdue">Overdue</option>
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={() => {
                setSearchTerm('');
                setFilterStatus('');
              }}
              className="w-full px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors"
            >
              Clear Filters
            </button>
          </div>
        </div>
      </div>

      {/* Success/Error Messages */}
      {success && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4">
          <div className="flex items-center space-x-2 text-green-800">
            <Car className="h-5 w-5" />
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

      {/* Add Vehicle Form */}
      {showAddForm && (
        <div className="bg-white rounded-2xl shadow-sm p-6 border border-orange-200">
          <h3 className="text-lg font-semibold text-slate-900 mb-6">Add New Vehicle</h3>
          <form onSubmit={handleAddVehicle} className="space-y-6">
            {/* Basic Information - Required */}
            <div>
              <h4 className="text-md font-medium text-slate-900 mb-4">Vehicle Information</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Registration Number *
                  </label>
                  <input
                    type="text"
                    value={newVehicle.registration_number}
                    onChange={(e) => setNewVehicle(prev => ({ ...prev, registration_number: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    placeholder="e.g., ABC123"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Make/Model *
                  </label>
                  <input
                    type="text"
                    value={newVehicle.make_model}
                    onChange={(e) => setNewVehicle(prev => ({ ...prev, make_model: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    placeholder="e.g., Ford Transit, Mercedes Sprinter"
                    required
                  />
                </div>
              </div>
            </div>
            
            {/* Service & MOT Information - Optional */}
            <div>
              <h4 className="text-md font-medium text-slate-900 mb-4">Service & MOT Information (Optional)</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Next Service Date
                  </label>
                  <input
                    type="date"
                    value={newVehicle.next_service_date}
                    onChange={(e) => setNewVehicle(prev => ({ ...prev, next_service_date: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Next MOT Date
                  </label>
                  <input
                    type="date"
                    value={newVehicle.next_mot_date}
                    onChange={(e) => setNewVehicle(prev => ({ ...prev, next_mot_date: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Last Service Date
                  </label>
                  <input
                    type="date"
                    value={newVehicle.last_service_date}
                    onChange={(e) => setNewVehicle(prev => ({ ...prev, last_service_date: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Last MOT Date
                  </label>
                  <input
                    type="date"
                    value={newVehicle.last_mot_date}
                    onChange={(e) => setNewVehicle(prev => ({ ...prev, last_mot_date: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  />
                </div>
              </div>
            </div>
            
            <div className="flex space-x-3">
              <button
                type="submit"
                disabled={loading}
                className="flex items-center space-x-2 bg-orange-600 hover:bg-orange-700 disabled:bg-orange-400 text-white px-6 py-3 rounded-lg transition-colors"
              >
                <Save className="h-4 w-4" />
                <span>{loading ? 'Adding...' : 'Add Vehicle'}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowAddForm(false);
                  setNewVehicle({
                    registration_number: '',
                    make_model: '',
                    next_service_date: '',
                    next_mot_date: '',
                    last_service_date: '',
                    last_mot_date: '',
                  });
                  setError(null);
                  setSuccess(null);
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

      {/* Vehicles List */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-200">
          <h3 className="text-lg font-semibold text-slate-900">
            Fleet Vehicles ({filteredVehicles.length})
          </h3>
        </div>
        
        {filteredVehicles.length === 0 ? (
          <div className="p-8 text-center">
            <Car className="h-12 w-12 text-slate-400 mx-auto mb-4" />
            <p className="text-slate-600">No vehicles found matching your criteria.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {filteredVehicles.map((vehicle) => {
              const serviceStatus = getVehicleServiceStatus(vehicle);
              const assignedEmployee = employees.find(e => e.assigned_vehicle_id === vehicle.id);
              
              return (
                <div key={vehicle.id} className="p-6">
                  {editingVehicle?.id === vehicle.id ? (
                    <form onSubmit={handleEditVehicle} className="space-y-4">
                      {/* Edit Form */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">
                            Registration Number *
                          </label>
                          <input
                            type="text"
                            value={editForm.registration_number}
                            onChange={(e) => setEditForm(prev => ({ ...prev, registration_number: e.target.value }))}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">
                            Make/Model *
                          </label>
                          <input
                            type="text"
                            value={editForm.make_model}
                            onChange={(e) => setEditForm(prev => ({ ...prev, make_model: e.target.value }))}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                            required
                          />
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">
                            Next Service Date
                          </label>
                          <input
                            type="date"
                            value={editForm.next_service_date}
                            onChange={(e) => setEditForm(prev => ({ ...prev, next_service_date: e.target.value }))}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">
                            Next MOT Date
                          </label>
                          <input
                            type="date"
                            value={editForm.next_mot_date}
                            onChange={(e) => setEditForm(prev => ({ ...prev, next_mot_date: e.target.value }))}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">
                            Last Service Date
                          </label>
                          <input
                            type="date"
                            value={editForm.last_service_date}
                            onChange={(e) => setEditForm(prev => ({ ...prev, last_service_date: e.target.value }))}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">
                            Last MOT Date
                          </label>
                          <input
                            type="date"
                            value={editForm.last_mot_date}
                            onChange={(e) => setEditForm(prev => ({ ...prev, last_mot_date: e.target.value }))}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                          />
                        </div>
                      </div>
                      
                      <div className="flex space-x-3">
                        <button
                          type="submit"
                          disabled={loading}
                          className="flex items-center space-x-2 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white px-4 py-2 rounded-lg transition-colors"
                        >
                          <Save className="h-4 w-4" />
                          <span>{loading ? 'Saving...' : 'Save Changes'}</span>
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
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-4">
                          <div className="p-3 bg-orange-100 rounded-lg">
                            <Car className="h-6 w-6 text-orange-600" />
                          </div>
                          <div>
                            <div className="flex items-center space-x-2">
                              <h4 className="text-lg font-semibold text-slate-900">{vehicle.registration_number}</h4>
                              {assignedEmployee && (
                                <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs font-medium">
                                  Assigned
                                </span>
                              )}
                            </div>
                            <p className="text-slate-600">{vehicle.make_model}</p>
                            {assignedEmployee && (
                              <p className="text-sm text-blue-600">
                                Assigned to: {assignedEmployee.full_name}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex space-x-2">
                          {/* Vehicle Assignment Dropdown */}
                          <div className="mr-4">
                            <select
                              value={assignedEmployee?.id || ''}
                              onChange={(e) => handleAssignVehicle(vehicle.id, e.target.value || null)}
                              className="px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent text-sm"
                              disabled={loading}
                            >
                              <option value="">Unassigned</option>
                              {employees.map((emp) => (
                                <option key={emp.id} value={emp.id}>
                                  {emp.full_name} ({emp.role})
                                </option>
                              ))}
                            </select>
                          </div>
                          <button
                            onClick={() => startEdit(vehicle)}
                            className="p-2 text-slate-600 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-colors"
                          >
                            <Edit className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteVehicle(vehicle)}
                            className="p-2 text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                      
                      {/* Service and MOT Status */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="bg-slate-50 rounded-lg p-3">
                          <h5 className="text-sm font-medium text-slate-700 mb-2 flex items-center">
                            <Calendar className="h-4 w-4 mr-1" />
                            Service Status
                          </h5>
                          <div className="space-y-1">
                            {vehicle.next_service_date ? (
                              <div className={`text-sm ${
                                serviceStatus.serviceOverdue ? 'text-red-600' :
                                serviceStatus.serviceDue ? 'text-amber-600' : 'text-green-600'
                              }`}>
                                Next: {new Date(vehicle.next_service_date).toLocaleDateString()}
                                {serviceStatus.serviceOverdue && (
                                  <span className="ml-2 inline-flex items-center">
                                    <AlertTriangle className="h-3 w-3 mr-1" />
                                    Overdue
                                  </span>
                                )}
                                {serviceStatus.serviceDue && !serviceStatus.serviceOverdue && (
                                  <span className="ml-2">Due soon</span>
                                )}
                              </div>
                            ) : (
                              <div className="text-sm text-slate-500">Not scheduled</div>
                            )}
                            {vehicle.last_service_date && (
                              <div className="text-xs text-slate-500">
                                Last: {new Date(vehicle.last_service_date).toLocaleDateString()}
                              </div>
                            )}
                          </div>
                        </div>
                        
                        <div className="bg-slate-50 rounded-lg p-3">
                          <h5 className="text-sm font-medium text-slate-700 mb-2 flex items-center">
                            <Calendar className="h-4 w-4 mr-1" />
                            MOT Status
                          </h5>
                          <div className="space-y-1">
                            {vehicle.next_mot_date ? (
                              <div className={`text-sm ${
                                serviceStatus.motOverdue ? 'text-red-600' :
                                serviceStatus.motDue ? 'text-amber-600' : 'text-green-600'
                              }`}>
                                Next: {new Date(vehicle.next_mot_date).toLocaleDateString()}
                                {serviceStatus.motOverdue && (
                                  <span className="ml-2 inline-flex items-center">
                                    <AlertTriangle className="h-3 w-3 mr-1" />
                                    Overdue
                                  </span>
                                )}
                                {serviceStatus.motDue && !serviceStatus.motOverdue && (
                                  <span className="ml-2">Due soon</span>
                                )}
                              </div>
                            ) : (
                              <div className="text-sm text-slate-500">Not scheduled</div>
                            )}
                            {vehicle.last_mot_date && (
                              <div className="text-xs text-slate-500">
                                Last: {new Date(vehicle.last_mot_date).toLocaleDateString()}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default VehicleManagement;