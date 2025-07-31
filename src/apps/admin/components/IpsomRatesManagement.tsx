import React, { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, Save, X, RefreshCw, FileText, Search } from 'lucide-react';
import { supabase, IpsomRate } from '../../../lib/supabase';

export const IpsomRatesManagement: React.FC = () => {
  const [ipsomRates, setIpsomRates] = useState<IpsomRate[]>([]);
  const [filteredRates, setFilteredRates] = useState<IpsomRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingRate, setEditingRate] = useState<IpsomRate | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterSheet, setFilterSheet] = useState('');

  const [newRate, setNewRate] = useState({
    sheet_no: 1,
    line_no: 1,
    work_item: '',
    col2: '',
    col3: '',
    col4: '',
    rate_gbp: '',
  });

  const [editForm, setEditForm] = useState({
    sheet_no: 1,
    line_no: 1,
    work_item: '',
    col2: '',
    col3: '',
    col4: '',
    rate_gbp: '',
  });

  useEffect(() => {
    loadIpsomRates();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [ipsomRates, searchTerm, filterSheet]);

  const loadIpsomRates = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('ipsom_rates')
        .select('*')
        .eq('is_active', true)
        .order('sheet_no', { ascending: true })
        .order('line_no', { ascending: true });

      if (error) throw error;
      setIpsomRates(data || []);
    } catch (error) {
      console.error('Error loading Ipsom rates:', error);
    } finally {
      setLoading(false);
    }
  };

  const refreshData = async () => {
    setRefreshing(true);
    await loadIpsomRates();
    setRefreshing(false);
  };

  const applyFilters = () => {
    let filtered = [...ipsomRates];

    if (searchTerm) {
      filtered = filtered.filter(rate =>
        rate.work_item.toLowerCase().includes(searchTerm.toLowerCase()) ||
        rate.col2.toLowerCase().includes(searchTerm.toLowerCase()) ||
        rate.col3.toLowerCase().includes(searchTerm.toLowerCase()) ||
        rate.col4.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (filterSheet) {
      filtered = filtered.filter(rate => rate.sheet_no.toString() === filterSheet);
    }

    setFilteredRates(filtered);
  };

  const handleAddRate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRate.work_item.trim() || !newRate.rate_gbp) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from('ipsom_rates')
        .insert({
          sheet_no: newRate.sheet_no,
          line_no: newRate.line_no,
          work_item: newRate.work_item.trim(),
          col2: newRate.col2.trim(),
          col3: newRate.col3.trim(),
          col4: newRate.col4.trim(),
          rate_gbp: parseFloat(newRate.rate_gbp),
        });

      if (error) throw error;

      setNewRate({
        sheet_no: 1,
        line_no: 1,
        work_item: '',
        col2: '',
        col3: '',
        col4: '',
        rate_gbp: '',
      });
      setShowAddForm(false);
      loadIpsomRates();
    } catch (error) {
      console.error('Error adding Ipsom rate:', error);
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
        .from('ipsom_rates')
        .update({
          sheet_no: editForm.sheet_no,
          line_no: editForm.line_no,
          work_item: editForm.work_item.trim(),
          col2: editForm.col2.trim(),
          col3: editForm.col3.trim(),
          col4: editForm.col4.trim(),
          rate_gbp: parseFloat(editForm.rate_gbp),
          updated_at: new Date().toISOString(),
        })
        .eq('id', editingRate.id);

      if (error) throw error;

      setEditingRate(null);
      loadIpsomRates();
    } catch (error) {
      console.error('Error updating Ipsom rate:', error);
      alert('Failed to update rate. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteRate = async (rate: IpsomRate) => {
    if (!confirm(`Are you sure you want to delete this rate: ${rate.work_item}?`)) {
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase
        .from('ipsom_rates')
        .update({ is_active: false })
        .eq('id', rate.id);

      if (error) throw error;
      loadIpsomRates();
    } catch (error) {
      console.error('Error deleting Ipsom rate:', error);
      alert('Failed to delete rate. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (rate: IpsomRate) => {
    setEditingRate(rate);
    setEditForm({
      sheet_no: rate.sheet_no,
      line_no: rate.line_no,
      work_item: rate.work_item,
      col2: rate.col2,
      col3: rate.col3,
      col4: rate.col4,
      rate_gbp: rate.rate_gbp.toString(),
    });
  };

  const cancelEdit = () => {
    setEditingRate(null);
    setEditForm({
      sheet_no: 1,
      line_no: 1,
      work_item: '',
      col2: '',
      col3: '',
      col4: '',
      rate_gbp: '',
    });
  };

  const getSheetName = (sheetNo: number) => {
    switch (sheetNo) {
      case 1: return 'Service Sheet';
      case 2: return 'Main/LV & HV Sheet';
      default: return `Sheet ${sheetNo}`;
    }
  };

  // Group rates by sheet
  const ratesBySheet = filteredRates.reduce((acc, rate) => {
    if (!acc[rate.sheet_no]) {
      acc[rate.sheet_no] = [];
    }
    acc[rate.sheet_no].push(rate);
    return acc;
  }, {} as Record<number, IpsomRate[]>);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="bg-white rounded-2xl shadow-sm p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <div className="p-3 bg-purple-100 rounded-lg">
              <FileText className="h-6 w-6 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Ipsom Rates Management</h1>
              <p className="text-slate-600">Manage Ipsom work rates and pricing</p>
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
              className="flex items-center space-x-2 bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-lg transition-colors"
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
                className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                placeholder="Search work items..."
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Filter by Sheet</label>
            <select
              value={filterSheet}
              onChange={(e) => setFilterSheet(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            >
              <option value="">All Sheets</option>
              <option value="1">Sheet 1 - Service</option>
              <option value="2">Sheet 2 - Main/LV & HV</option>
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={() => {
                setSearchTerm('');
                setFilterSheet('');
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
        <div className="bg-white rounded-2xl shadow-sm p-6 border border-purple-200">
          <h3 className="text-lg font-semibold text-slate-900 mb-6">Add New Ipsom Rate</h3>
          <form onSubmit={handleAddRate} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Sheet Number *</label>
                <select
                  value={newRate.sheet_no}
                  onChange={(e) => setNewRate(prev => ({ ...prev, sheet_no: parseInt(e.target.value) }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  required
                >
                  <option value={1}>1 - Service Sheet</option>
                  <option value={2}>2 - Main/LV & HV Sheet</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Line Number *</label>
                <input
                  type="number"
                  value={newRate.line_no}
                  onChange={(e) => setNewRate(prev => ({ ...prev, line_no: parseInt(e.target.value) || 1 }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  min="1"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Work Item *</label>
                <input
                  type="text"
                  value={newRate.work_item}
                  onChange={(e) => setNewRate(prev => ({ ...prev, work_item: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  placeholder="e.g., EX/LAY/REIN"
                  required
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Column 2</label>
                <input
                  type="text"
                  value={newRate.col2}
                  onChange={(e) => setNewRate(prev => ({ ...prev, col2: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  placeholder="e.g., LV, HV"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Column 3</label>
                <input
                  type="text"
                  value={newRate.col3}
                  onChange={(e) => setNewRate(prev => ({ ...prev, col3: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  placeholder="e.g., SERVICE"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Column 4</label>
                <input
                  type="text"
                  value={newRate.col4}
                  onChange={(e) => setNewRate(prev => ({ ...prev, col4: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  placeholder="e.g., SITE, AGRI"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Rate (£) *</label>
                <input
                  type="number"
                  step="0.01"
                  value={newRate.rate_gbp}
                  onChange={(e) => setNewRate(prev => ({ ...prev, rate_gbp: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  placeholder="0.00"
                  required
                />
              </div>
            </div>
            
            <div className="flex space-x-3">
              <button
                type="submit"
                disabled={loading}
                className="flex items-center space-x-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 text-white px-6 py-3 rounded-lg transition-colors"
              >
                <Save className="h-4 w-4" />
                <span>{loading ? 'Adding...' : 'Add Rate'}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowAddForm(false);
                  setNewRate({
                    sheet_no: 1,
                    line_no: 1,
                    work_item: '',
                    col2: '',
                    col3: '',
                    col4: '',
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

      {/* Rates Display */}
      {loading ? (
        <div className="bg-white rounded-2xl shadow-sm p-8 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600 mx-auto"></div>
          <p className="mt-2 text-slate-600">Loading Ipsom rates...</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(ratesBySheet).map(([sheetNo, rates]) => (
            <div key={sheetNo} className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <div className="bg-purple-50 px-6 py-4 border-b border-purple-200">
                <h3 className="text-lg font-semibold text-slate-900">
                  {getSheetName(parseInt(sheetNo))} ({rates.length} rates)
                </h3>
              </div>
              
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Line</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Work Item</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Col 2</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Col 3</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Col 4</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Rate</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-slate-200">
                    {rates.map((rate) => (
                      <tr key={rate.id} className="hover:bg-slate-50">
                        {editingRate?.id === rate.id ? (
                          <>
                            <td className="px-6 py-4" colSpan={7}>
                              <form onSubmit={handleEditRate} className="space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
                                  <input
                                    type="number"
                                    value={editForm.line_no}
                                    onChange={(e) => setEditForm(prev => ({ ...prev, line_no: parseInt(e.target.value) || 1 }))}
                                    className="px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                    min="1"
                                    required
                                  />
                                  <input
                                    type="text"
                                    value={editForm.work_item}
                                    onChange={(e) => setEditForm(prev => ({ ...prev, work_item: e.target.value }))}
                                    className="px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                    required
                                  />
                                  <input
                                    type="text"
                                    value={editForm.col2}
                                    onChange={(e) => setEditForm(prev => ({ ...prev, col2: e.target.value }))}
                                    className="px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                  />
                                  <input
                                    type="text"
                                    value={editForm.col3}
                                    onChange={(e) => setEditForm(prev => ({ ...prev, col3: e.target.value }))}
                                    className="px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                  />
                                  <input
                                    type="text"
                                    value={editForm.col4}
                                    onChange={(e) => setEditForm(prev => ({ ...prev, col4: e.target.value }))}
                                    className="px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                  />
                                  <input
                                    type="number"
                                    step="0.01"
                                    value={editForm.rate_gbp}
                                    onChange={(e) => setEditForm(prev => ({ ...prev, rate_gbp: e.target.value }))}
                                    className="px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                    required
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
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">{rate.line_no}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">{rate.work_item}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">{rate.col2 || '-'}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">{rate.col3 || '-'}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">{rate.col4 || '-'}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-green-600">£{rate.rate_gbp.toFixed(2)}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                              <div className="flex space-x-2">
                                <button
                                  onClick={() => startEdit(rate)}
                                  className="p-2 text-slate-600 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
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
            </div>
          ))}
        </div>
      )}
    </div>
  );
};