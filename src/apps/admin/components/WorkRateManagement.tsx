import React, { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, Save, X, DollarSign, RefreshCw } from 'lucide-react';
import { supabase, WorkRate } from '../../../lib/supabase';

export const WorkRateManagement: React.FC = () => {
  const [workRates, setWorkRates] = useState<WorkRate[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingRate, setEditingRate] = useState<WorkRate | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterVoltage, setFilterVoltage] = useState('');
  const [filterRateType, setFilterRateType] = useState('');

  const [newRate, setNewRate] = useState({
    work_type: '',
    voltage_type: 'LV' as 'LV' | 'HV' | 'ANY',
    site_type: '',
    rate_type: 'price_work' as 'price_work' | 'day_rate',
    rate_value: '',
    unit: 'm',
  });

  const [editForm, setEditForm] = useState({
    work_type: '',
    voltage_type: 'LV' as 'LV' | 'HV' | 'ANY',
    site_type: '',
    rate_type: 'price_work' as 'price_work' | 'day_rate',
    rate_value: '',
    unit: 'm',
  });

  useEffect(() => {
    loadWorkRates();
  }, []);

  const loadWorkRates = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('work_rates')
        .select('*')
        .eq('is_active', true)
        .order('work_type', { ascending: true });

      if (error) throw error;
      setWorkRates(data || []);
    } catch (error) {
      console.error('Error loading work rates:', error);
    } finally {
      setLoading(false);
    }
  };

  const refreshData = async () => {
    setRefreshing(true);
    await loadWorkRates();
    setRefreshing(false);
  };

  const handleAddRate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRate.work_type.trim() || !newRate.rate_value) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from('work_rates')
        .insert({
          work_type: newRate.work_type.trim(),
          voltage_type: newRate.voltage_type,
          site_type: newRate.site_type.trim() || null,
          rate_type: newRate.rate_type,
          rate_value: parseFloat(newRate.rate_value),
          unit: newRate.unit.trim() || null,
        });

      if (error) throw error;

      setNewRate({
        work_type: '',
        voltage_type: 'LV',
        site_type: '',
        rate_type: 'price_work',
        rate_value: '',
        unit: 'm',
      });
      setShowAddForm(false);
      loadWorkRates();
    } catch (error) {
      console.error('Error adding work rate:', error);
      alert('Failed to add work rate. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleEditRate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRate) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from('work_rates')
        .update({
          work_type: editForm.work_type.trim(),
          voltage_type: editForm.voltage_type,
          site_type: editForm.site_type.trim() || null,
          rate_type: editForm.rate_type,
          rate_value: parseFloat(editForm.rate_value),
          unit: editForm.unit.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', editingRate.id);

      if (error) throw error;

      setEditingRate(null);
      loadWorkRates();
    } catch (error) {
      console.error('Error updating work rate:', error);
      alert('Failed to update work rate. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteRate = async (rate: WorkRate) => {
    if (!confirm(`Are you sure you want to delete this work rate: ${rate.work_type}?`)) {
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase
        .from('work_rates')
        .update({ is_active: false })
        .eq('id', rate.id);

      if (error) throw error;
      loadWorkRates();
    } catch (error) {
      console.error('Error deleting work rate:', error);
      alert('Failed to delete work rate. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (rate: WorkRate) => {
    setEditingRate(rate);
    setEditForm({
      work_type: rate.work_type,
      voltage_type: rate.voltage_type,
      site_type: rate.site_type || '',
      rate_type: rate.rate_type,
      rate_value: rate.rate_value.toString(),
      unit: rate.unit || '',
    });
  };

  const cancelEdit = () => {
    setEditingRate(null);
    setEditForm({
      work_type: '',
      voltage_type: 'LV',
      site_type: '',
      rate_type: 'price_work',
      rate_value: '',
      unit: 'm',
    });
  };

  // Filter work rates
  const filteredRates = workRates.filter(rate => {
    const matchesSearch = rate.work_type.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (rate.site_type && rate.site_type.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesVoltage = !filterVoltage || rate.voltage_type === filterVoltage;
    const matchesRateType = !filterRateType || rate.rate_type === filterRateType;
    
    return matchesSearch && matchesVoltage && matchesRateType;
  });

  const workTypeOptions = [
    'EX/LAY/REIN',
    'EX/DIG',
    'ADD/DUCT/CABLE',
    'CABLE PULL/NO EXC',
    'EX/HOLE',
    'B/FILL/JH',
    'EX/JOIN BAY',
    'B/FILL J/BAY',
    'ADD/SERV/CABLE',
    'PULL/CABLE IN DUCT',
    'PULL/CABLE/O-TRE',
    'MOLE<35MM',
    'LAY/EARTH/CABLE',
    'EX/DD-PIT/BFILL',
  ];

  const siteTypeOptions = [
    'SITE',
    'AGRI',
    'U/MADE',
    'UM/CW',
    'FWAY',
    'CWAY',
    'SURFACED',
    'SOFT',
    'IN/TREN',
    'SERVICE',
    'O/EXC',
    'DUCT',
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="bg-white rounded-2xl shadow-sm p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <div className="p-3 bg-green-100 rounded-lg">
              <DollarSign className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Work Rate Management</h1>
              <p className="text-slate-600">Manage price work and day rates for timesheets</p>
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
              className="flex items-center space-x-2 bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg transition-colors"
            >
              <Plus className="h-5 w-5" />
              <span>Add Work Rate</span>
            </button>
          </div>
        </div>

        {/* Search and Filters */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Search</label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              placeholder="Search work types..."
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Voltage</label>
            <select
              value={filterVoltage}
              onChange={(e) => setFilterVoltage(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
            >
              <option value="">All Voltages</option>
              <option value="LV">LV</option>
              <option value="HV">HV</option>
              <option value="ANY">ANY</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Rate Type</label>
            <select
              value={filterRateType}
              onChange={(e) => setFilterRateType(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
            >
              <option value="">All Types</option>
              <option value="price_work">Price Work</option>
              <option value="day_rate">Day Rate</option>
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={() => {
                setSearchTerm('');
                setFilterVoltage('');
                setFilterRateType('');
              }}
              className="w-full px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors"
            >
              Clear Filters
            </button>
          </div>
        </div>
      </div>

      {/* Add Form */}
      {showAddForm && (
        <div className="bg-white rounded-2xl shadow-sm p-6 border border-green-200">
          <h3 className="text-lg font-semibold text-slate-900 mb-6">Add New Work Rate</h3>
          <form onSubmit={handleAddRate} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Work Type *
                </label>
                <select
                  value={newRate.work_type}
                  onChange={(e) => setNewRate(prev => ({ ...prev, work_type: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  required
                >
                  <option value="">Select work type...</option>
                  {workTypeOptions.map(type => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Voltage Type *
                </label>
                <select
                  value={newRate.voltage_type}
                  onChange={(e) => setNewRate(prev => ({ ...prev, voltage_type: e.target.value as 'LV' | 'HV' | 'ANY' }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  required
                >
                  <option value="LV">LV</option>
                  <option value="HV">HV</option>
                  <option value="ANY">ANY</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Site Type
                </label>
                <select
                  value={newRate.site_type}
                  onChange={(e) => setNewRate(prev => ({ ...prev, site_type: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                >
                  <option value="">Select site type...</option>
                  {siteTypeOptions.map(type => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Rate Type *
                </label>
                <select
                  value={newRate.rate_type}
                  onChange={(e) => setNewRate(prev => ({ ...prev, rate_type: e.target.value as 'price_work' | 'day_rate' }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  required
                >
                  <option value="price_work">Price Work</option>
                  <option value="day_rate">Day Rate</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Rate Value (£) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={newRate.rate_value}
                  onChange={(e) => setNewRate(prev => ({ ...prev, rate_value: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="0.00"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Unit
                </label>
                <select
                  value={newRate.unit}
                  onChange={(e) => setNewRate(prev => ({ ...prev, unit: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                >
                  <option value="m">m (metres)</option>
                  <option value="each">each</option>
                  <option value="day">day</option>
                  <option value="hour">hour</option>
                </select>
              </div>
            </div>
            
            <div className="flex space-x-3">
              <button
                type="submit"
                disabled={loading}
                className="flex items-center space-x-2 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white px-6 py-3 rounded-lg transition-colors"
              >
                <Save className="h-4 w-4" />
                <span>{loading ? 'Adding...' : 'Add Rate'}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowAddForm(false);
                  setNewRate({
                    work_type: '',
                    voltage_type: 'LV',
                    site_type: '',
                    rate_type: 'price_work',
                    rate_value: '',
                    unit: 'm',
                  });
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

      {/* Work Rates List */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-200">
          <h3 className="text-lg font-semibold text-slate-900">
            Work Rates ({filteredRates.length})
          </h3>
        </div>
        
        {loading ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600 mx-auto"></div>
            <p className="mt-2 text-slate-600">Loading work rates...</p>
          </div>
        ) : filteredRates.length === 0 ? (
          <div className="p-8 text-center">
            <DollarSign className="h-12 w-12 text-slate-400 mx-auto mb-4" />
            <p className="text-slate-600">No work rates found matching your criteria.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Work Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Voltage
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Site Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Rate Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Rate
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-200">
                {filteredRates.map((rate) => (
                  <tr key={rate.id} className="hover:bg-slate-50">
                    {editingRate?.id === rate.id ? (
                      <>
                        <td className="px-6 py-4" colSpan={6}>
                          <form onSubmit={handleEditRate} className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                              <select
                                value={editForm.work_type}
                                onChange={(e) => setEditForm(prev => ({ ...prev, work_type: e.target.value }))}
                                className="px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                                required
                              >
                                {workTypeOptions.map(type => (
                                  <option key={type} value={type}>{type}</option>
                                ))}
                              </select>
                              <select
                                value={editForm.voltage_type}
                                onChange={(e) => setEditForm(prev => ({ ...prev, voltage_type: e.target.value as 'LV' | 'HV' | 'ANY' }))}
                                className="px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                              >
                                <option value="LV">LV</option>
                                <option value="HV">HV</option>
                                <option value="ANY">ANY</option>
                              </select>
                              <select
                                value={editForm.site_type}
                                onChange={(e) => setEditForm(prev => ({ ...prev, site_type: e.target.value }))}
                                className="px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                              >
                                <option value="">Select...</option>
                                {siteTypeOptions.map(type => (
                                  <option key={type} value={type}>{type}</option>
                                ))}
                              </select>
                              <input
                                type="number"
                                step="0.01"
                                value={editForm.rate_value}
                                onChange={(e) => setEditForm(prev => ({ ...prev, rate_value: e.target.value }))}
                                className="px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                                required
                              />
                              <select
                                value={editForm.unit}
                                onChange={(e) => setEditForm(prev => ({ ...prev, unit: e.target.value }))}
                                className="px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                              >
                                <option value="m">m</option>
                                <option value="each">each</option>
                                <option value="day">day</option>
                                <option value="hour">hour</option>
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
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-slate-900">{rate.work_type}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            rate.voltage_type === 'LV' ? 'bg-blue-100 text-blue-800' :
                            rate.voltage_type === 'HV' ? 'bg-red-100 text-red-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {rate.voltage_type}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">
                          {rate.site_type || '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            rate.rate_type === 'price_work' ? 'bg-green-100 text-green-800' : 'bg-orange-100 text-orange-800'
                          }`}>
                            {rate.rate_type === 'price_work' ? 'Price Work' : 'Day Rate'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">
                          <div className="font-medium">£{rate.rate_value.toFixed(2)}</div>
                          <div className="text-xs text-slate-500">per {rate.unit}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <div className="flex space-x-2">
                            <button
                              onClick={() => startEdit(rate)}
                              className="p-2 text-slate-600 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                            >
                              <Edit className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteRate(rate)}
                              className="p-2 text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};