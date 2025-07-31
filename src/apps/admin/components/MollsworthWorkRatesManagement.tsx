import React, { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, Save, X, RefreshCw, FileText, Search } from 'lucide-react';
import { supabase, MollsworthWorkRate } from '../../../lib/supabase';

export const MollsworthWorkRatesManagement: React.FC = () => {
  const [mollsworthRates, setMollsworthRates] = useState<MollsworthWorkRate[]>([]);
  const [filteredRates, setFilteredRates] = useState<MollsworthWorkRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingRate, setEditingRate] = useState<MollsworthWorkRate | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterVoltage, setFilterVoltage] = useState('');

  const [newRate, setNewRate] = useState({
    col1_work_item: '',
    col2_param: '11KV',
    col3_param: '-',
    col4_param: '-',
    rate_gbp: '',
  });

  const [editForm, setEditForm] = useState({
    col1_work_item: '',
    col2_param: '11KV',
    col3_param: '-',
    col4_param: '-',
    rate_gbp: '',
  });

  useEffect(() => {
    loadMollsworthRates();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [mollsworthRates, searchTerm, filterVoltage]);

  const loadMollsworthRates = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('mollsworth_work_rates')
        .select('*')
        .eq('is_active', true)
        .order('col1_work_item', { ascending: true })
        .order('col2_param', { ascending: true });

      if (error) throw error;
      setMollsworthRates(data || []);
    } catch (error) {
      console.error('Error loading Mollsworth rates:', error);
    } finally {
      setLoading(false);
    }
  };

  const refreshData = async () => {
    setRefreshing(true);
    await loadMollsworthRates();
    setRefreshing(false);
  };

  const applyFilters = () => {
    let filtered = [...mollsworthRates];

    if (searchTerm) {
      filtered = filtered.filter(rate =>
        rate.col1_work_item.toLowerCase().includes(searchTerm.toLowerCase()) ||
        rate.col2_param.toLowerCase().includes(searchTerm.toLowerCase()) ||
        rate.col3_param.toLowerCase().includes(searchTerm.toLowerCase()) ||
        rate.col4_param.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (filterVoltage) {
      filtered = filtered.filter(rate => rate.col2_param === filterVoltage);
    }

    setFilteredRates(filtered);
  };

  const handleAddRate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRate.col1_work_item.trim()) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from('mollsworth_work_rates')
        .insert({
          col1_work_item: newRate.col1_work_item.trim(),
          col2_param: newRate.col2_param.trim(),
          col3_param: newRate.col3_param.trim(),
          col4_param: newRate.col4_param.trim(),
          rate_gbp: newRate.rate_gbp ? parseFloat(newRate.rate_gbp) : null,
        });

      if (error) throw error;

      setNewRate({
        col1_work_item: '',
        col2_param: '11KV',
        col3_param: '-',
        col4_param: '-',
        rate_gbp: '',
      });
      setShowAddForm(false);
      loadMollsworthRates();
    } catch (error) {
      console.error('Error adding Mollsworth rate:', error);
      alert('Failed to add rate. Please try again.');
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
        .from('mollsworth_work_rates')
        .update({
          col1_work_item: editForm.col1_work_item.trim(),
          col2_param: editForm.col2_param.trim(),
          col3_param: editForm.col3_param.trim(),
          col4_param: editForm.col4_param.trim(),
          rate_gbp: editForm.rate_gbp ? parseFloat(editForm.rate_gbp) : null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', editingRate.id);

      if (error) throw error;

      setEditingRate(null);
      loadMollsworthRates();
    } catch (error) {
      console.error('Error updating Mollsworth rate:', error);
      alert('Failed to update rate. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteRate = async (rate: MollsworthWorkRate) => {
    if (!confirm(`Are you sure you want to delete this rate: ${rate.col1_work_item}?`)) {
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase
        .from('mollsworth_work_rates')
        .update({ is_active: false })
        .eq('id', rate.id);

      if (error) throw error;
      loadMollsworthRates();
    } catch (error) {
      console.error('Error deleting Mollsworth rate:', error);
      alert('Failed to delete rate. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (rate: MollsworthWorkRate) => {
    setEditingRate(rate);
    setEditForm({
      col1_work_item: rate.col1_work_item,
      col2_param: rate.col2_param,
      col3_param: rate.col3_param,
      col4_param: rate.col4_param,
      rate_gbp: rate.rate_gbp?.toString() || '',
    });
  };

  const cancelEdit = () => {
    setEditingRate(null);
    setEditForm({
      col1_work_item: '',
      col2_param: '11KV',
      col3_param: '-',
      col4_param: '-',
      rate_gbp: '',
    });
  };

  const workItemOptions = [
    'EX/LAY/REIN',
    'EX/DIG (FW/CW)',
    'EX/DIG',
    'EX/DIG/S (FW/CW)',
    'ADD/DUCT/CABLE',
    'CABLE PULL/NO EXC',
    'EX/JHOLE',
    'B/FILL/JH',
  ];

  const voltageOptions = ['11KV', '33KV'];
  
  const excavationOptions = ['-', 'NO/EXC', 'O/EXC'];
  
  const siteOptions = ['-', 'SITE', 'AGRI', 'U/MADE', 'UM/CW', 'FWAY', 'CWAY', 'SURFACED', 'SOFT', 'IN/TREN', 'SERVICE', 'DUCT'];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="bg-white rounded-2xl shadow-sm p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <div className="p-3 bg-indigo-100 rounded-lg">
              <FileText className="h-6 w-6 text-indigo-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Mollsworth Work Rates Management</h1>
              <p className="text-slate-600">Manage Mollsworth 11KV & 33KV work rates and pricing</p>
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
              className="flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-lg transition-colors"
            >
              <Plus className="h-5 w-5" />
              <span>Add Rate</span>
            </button>
          </div>
        </div>

        {/* Search and Filters */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Search</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="Search work items..."
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Filter by Voltage</label>
            <select
              value={filterVoltage}
              onChange={(e) => setFilterVoltage(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            >
              <option value="">All Voltages</option>
              <option value="11KV">11KV</option>
              <option value="33KV">33KV</option>
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={() => {
                setSearchTerm('');
                setFilterVoltage('');
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
        <div className="bg-white rounded-2xl shadow-sm p-6 border border-indigo-200">
          <h3 className="text-lg font-semibold text-slate-900 mb-6">Add New Mollsworth Rate</h3>
          <form onSubmit={handleAddRate} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Work Item *</label>
                <input
                  type="text"
                  value={newRate.col1_work_item}
                  onChange={(e) => setNewRate(prev => ({ ...prev, col1_work_item: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  placeholder="e.g., EX/LAY/REIN"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Voltage *</label>
                <input
                  type="text"
                  value={newRate.col2_param}
                  onChange={(e) => setNewRate(prev => ({ ...prev, col2_param: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  placeholder="e.g., 11KV, 33KV"
                  required
                />
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Excavation</label>
                <input
                  type="text"
                  value={newRate.col3_param}
                  onChange={(e) => setNewRate(prev => ({ ...prev, col3_param: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  placeholder="e.g., NO/EXC, O/EXC, -"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Site/Surface</label>
                <input
                  type="text"
                  value={newRate.col4_param}
                  onChange={(e) => setNewRate(prev => ({ ...prev, col4_param: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  placeholder="e.g., SITE, AGRI, FWAY, CWAY"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Rate (£)</label>
                <input
                  type="number"
                  step="0.01"
                  value={newRate.rate_gbp}
                  onChange={(e) => setNewRate(prev => ({ ...prev, rate_gbp: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  placeholder="0.00"
                />
              </div>
            </div>
            
            <div className="flex space-x-3">
              <button
                type="submit"
                disabled={loading}
                className="flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white px-6 py-3 rounded-lg transition-colors"
              >
                <Save className="h-4 w-4" />
                <span>{loading ? 'Adding...' : 'Add Rate'}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowAddForm(false);
                  setNewRate({
                    col1_work_item: '',
                    col2_param: '11KV',
                    col3_param: '-',
                    col4_param: '-',
                    rate_gbp: '',
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

      {/* Rates Table */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-200">
          <h3 className="text-lg font-semibold text-slate-900">
            Mollsworth Work Rates ({filteredRates.length})
          </h3>
        </div>
        
        {loading ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto"></div>
            <p className="mt-2 text-slate-600">Loading Mollsworth rates...</p>
          </div>
        ) : filteredRates.length === 0 ? (
          <div className="p-8 text-center">
            <FileText className="h-12 w-12 text-slate-400 mx-auto mb-4" />
            <p className="text-slate-600">No Mollsworth rates found matching your criteria.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Work Item</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Voltage</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Excavation</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Site/Surface</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Rate</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Actions</th>
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
                              <input
                                type="text"
                                value={editForm.col1_work_item}
                                onChange={(e) => setEditForm(prev => ({ ...prev, col1_work_item: e.target.value }))}
                                className="px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                placeholder="Work item"
                                required
                              />
                              <input
                                type="text"
                                value={editForm.col2_param}
                                onChange={(e) => setEditForm(prev => ({ ...prev, col2_param: e.target.value }))}
                                className="px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                placeholder="Voltage"
                                required
                              />
                              <input
                                type="text"
                                value={editForm.col3_param}
                                onChange={(e) => setEditForm(prev => ({ ...prev, col3_param: e.target.value }))}
                                className="px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                placeholder="Excavation"
                              />
                              <input
                                type="text"
                                value={editForm.col4_param}
                                onChange={(e) => setEditForm(prev => ({ ...prev, col4_param: e.target.value }))}
                                className="px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                placeholder="Site/Surface"
                              />
                              <input
                                type="number"
                                step="0.01"
                                value={editForm.rate_gbp}
                                onChange={(e) => setEditForm(prev => ({ ...prev, rate_gbp: e.target.value }))}
                                className="px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                              />
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
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">{rate.col1_work_item}</td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            rate.col2_param === '11KV' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'
                          }`}>
                            {rate.col2_param}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">{rate.col3_param}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">{rate.col4_param}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-green-600">
                          {rate.rate_gbp ? `£${rate.rate_gbp.toFixed(2)}` : 'N/A'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <div className="flex space-x-2">
                            <button
                              onClick={() => startEdit(rate)}
                              className="p-2 text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
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