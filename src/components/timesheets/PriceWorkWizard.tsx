import React, { useState, useEffect } from 'react';
import { ArrowLeft, ArrowRight, X } from 'lucide-react';
import { supabase, IpsomRate, MollsworthWorkRate } from '../../lib/supabase';

interface PriceWorkWizardProps {
  isOpen: boolean;
  onClose: () => void;
  mode: 'ipsom' | 'mollsworth';
  onAddEntry: (entry: PriceWorkEntry) => void;
}

export interface PriceWorkEntry {
  id: string;
  type: 'ipsom' | 'mollsworth';
  workItem: string;
  col2: string;
  col3: string;
  col4: string;
  rate: number;
  quantity: number;
  total: number;
  rateId: string;
}

interface WizardState {
  step: 1 | 2 | 3 | 4 | 5;
  workItem: string;
  col2: string;
  col3: string;
  col4: string;
  quantity: number;
  selectedRate: IpsomRate | MollsworthWorkRate | null;
}

export const PriceWorkWizard: React.FC<PriceWorkWizardProps> = ({
  isOpen,
  onClose,
  mode,
  onAddEntry,
}) => {
  const [rates, setRates] = useState<(IpsomRate | MollsworthWorkRate)[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [wizardState, setWizardState] = useState<WizardState>({
    step: 1,
    workItem: '',
    col2: '',
    col3: '',
    col4: '',
    quantity: 0,
    selectedRate: null,
  });

  useEffect(() => {
    if (isOpen) {
      loadRates();
      resetWizard();
    }
  }, [isOpen, mode]);

  const resetWizard = () => {
    setWizardState({
      step: 1,
      workItem: '',
      col2: '',
      col3: '',
      col4: '',
      quantity: 0,
      selectedRate: null,
    });
  };

  const loadRates = async () => {
    try {
      setLoading(true);
      setError(null);

      if (mode === 'ipsom') {
        const { data, error } = await supabase
          .from('ipsom_rates')
          .select('*')
          .eq('is_active', true)
          .order('work_item');

        if (error) throw error;
        setRates(data || []);
      } else {
        const { data, error } = await supabase
          .from('mollsworth_work_rates')
          .select('*')
          .eq('is_active', true)
          .order('col1_work_item');

        if (error) throw error;
        setRates(data || []);
      }
    } catch (err) {
      console.error('Error loading rates:', err);
      setError('Failed to load rates. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const getStepLabel = (step: number) => {
    if (mode === 'ipsom') {
      switch (step) {
        case 1: return 'Work Item';
        case 2: return 'Column 2';
        case 3: return 'Column 3';
        case 4: return 'Column 4';
        case 5: return 'Quantity & Review';
        default: return '';
      }
    } else {
      switch (step) {
        case 1: return 'Work Item';
        case 2: return 'Voltage';
        case 3: return 'Excavation';
        case 4: return 'Site';
        case 5: return 'Quantity & Review';
        default: return '';
      }
    }
  };

  const getFilteredOptions = (step: number): string[] => {
    let filteredRates = [...rates];

    // Apply previous selections as filters
    if (wizardState.workItem) {
      filteredRates = filteredRates.filter(rate => {
        const workItem = mode === 'ipsom' 
          ? (rate as IpsomRate).work_item 
          : (rate as MollsworthWorkRate).col1_work_item;
        return workItem === wizardState.workItem;
      });
    }

    if (wizardState.col2) {
      filteredRates = filteredRates.filter(rate => {
        const col2 = mode === 'ipsom' 
          ? (rate as IpsomRate).col2 
          : (rate as MollsworthWorkRate).col2_param;
        // Simple matching - if N/A selected, include all rates for this step
        if (wizardState.col2 === 'N/A') {
          return true; // Don't filter on this column
        }
        return col2 && col2.trim() === wizardState.col2;
      });
    }

    if (wizardState.col3) {
      filteredRates = filteredRates.filter(rate => {
        const col3 = mode === 'ipsom' 
          ? (rate as IpsomRate).col3 
          : (rate as MollsworthWorkRate).col3_param;
        // Simple matching - if N/A selected, include all rates for this step
        if (wizardState.col3 === 'N/A') {
          return true; // Don't filter on this column
        }
        return col3 && col3.trim() === wizardState.col3;
      });
    }

    // Get distinct values for current step
    const values = new Set<string>();
    filteredRates.forEach(rate => {
      let value = '';
      if (step === 1) {
        value = mode === 'ipsom' 
          ? (rate as IpsomRate).work_item 
          : (rate as MollsworthWorkRate).col1_work_item;
      } else if (step === 2) {
        value = mode === 'ipsom' 
          ? (rate as IpsomRate).col2 
          : (rate as MollsworthWorkRate).col2_param;
      } else if (step === 3) {
        value = mode === 'ipsom' 
          ? (rate as IpsomRate).col3 
          : (rate as MollsworthWorkRate).col3_param;
      } else if (step === 4) {
        value = mode === 'ipsom' 
          ? (rate as IpsomRate).col4 
          : (rate as MollsworthWorkRate).col4_param;
      }
      
      if (value && value.trim()) {
        values.add(value);
      } else {
        // Always add N/A option when there are empty values
        values.add('N/A');
      }
    });

    // Ensure N/A is always available if there are any empty values
    const hasEmptyValues = filteredRates.some(rate => {
      let value = '';
      if (step === 2) {
        value = mode === 'ipsom' ? (rate as IpsomRate).col2 : (rate as MollsworthWorkRate).col2_param;
      } else if (step === 3) {
        value = mode === 'ipsom' ? (rate as IpsomRate).col3 : (rate as MollsworthWorkRate).col3_param;
      } else if (step === 4) {
        value = mode === 'ipsom' ? (rate as IpsomRate).col4 : (rate as MollsworthWorkRate).col4_param;
      }
      return !value || value.trim() === '';
    });

    if (hasEmptyValues && step > 1) {
      values.add('N/A');
    }

    return Array.from(values).sort();
  };

  const handleStepSelection = (value: string) => {
    const newState = { ...wizardState };
    
    switch (wizardState.step) {
      case 1:
        newState.workItem = value;
        newState.col2 = '';
        newState.col3 = '';
        newState.col4 = '';
        break;
      case 2:
        newState.col2 = value;
        newState.col3 = '';
        newState.col4 = '';
        break;
      case 3:
        newState.col3 = value;
        newState.col4 = '';
        break;
      case 4:
        newState.col4 = value;
        break;
    }

    setWizardState(newState);

    // Auto-advance to next step
    if (wizardState.step < 4) {
      setTimeout(() => {
        setWizardState(prev => ({ ...prev, step: (prev.step + 1) as any }));
      }, 200);
    } else {
      // Step 4 completed, find the matching rate and go to step 5
      findMatchingRate(newState);
    }
  };

  const findMatchingRate = (state: WizardState) => {
    // Find the best matching rate - prioritize exact matches, then partial matches
    let matchingRate = rates.find(rate => {
      if (mode === 'ipsom') {
        const ipsomRate = rate as IpsomRate;
        
        // Work item must match exactly
        if (ipsomRate.work_item !== state.workItem) return false;
        
        // For other columns, handle N/A selections
        const col2Match = state.col2 === 'N/A' || 
                         !ipsomRate.col2 || 
                         ipsomRate.col2.trim() === '' || 
                         ipsomRate.col2 === state.col2;
                         
        const col3Match = state.col3 === 'N/A' || 
                         !ipsomRate.col3 || 
                         ipsomRate.col3.trim() === '' || 
                         ipsomRate.col3 === state.col3;
                         
        const col4Match = state.col4 === 'N/A' || 
                         !ipsomRate.col4 || 
                         ipsomRate.col4.trim() === '' || 
                         ipsomRate.col4 === state.col4;
        
        return col2Match && col3Match && col4Match;
      } else {
        const mollsworthRate = rate as MollsworthWorkRate;
        
        // Work item must match exactly
        if (mollsworthRate.col1_work_item !== state.workItem) return false;
        
        // For other columns, handle N/A selections
        const col2Match = state.col2 === 'N/A' || 
                         !mollsworthRate.col2_param || 
                         mollsworthRate.col2_param.trim() === '' || 
                         mollsworthRate.col2_param === state.col2;
                         
        const col3Match = state.col3 === 'N/A' || 
                         !mollsworthRate.col3_param || 
                         mollsworthRate.col3_param.trim() === '' || 
                         mollsworthRate.col3_param === state.col3;
                         
        const col4Match = state.col4 === 'N/A' || 
                         !mollsworthRate.col4_param || 
                         mollsworthRate.col4_param.trim() === '' || 
                         mollsworthRate.col4_param === state.col4;
        
        return col2Match && col3Match && col4Match;
      }
    });

    // If no exact match found, try to find any rate with the same work item
    if (!matchingRate) {
      matchingRate = rates.find(rate => {
        const workItem = mode === 'ipsom' 
          ? (rate as IpsomRate).work_item 
          : (rate as MollsworthWorkRate).col1_work_item;
        return workItem === state.workItem;
      });
    }

    setWizardState(prev => ({
      ...prev,
      selectedRate: matchingRate || null,
      step: 5
    }));
  };

  const handleQuantityChange = (quantity: number) => {
    setWizardState(prev => ({ ...prev, quantity }));
  };

  const getTotal = () => {
    if (!wizardState.selectedRate || !wizardState.quantity) return 0;
    const rate = wizardState.selectedRate.rate_gbp || 0;
    return wizardState.quantity * rate;
  };

  const handleAddToTimesheet = () => {
    if (!wizardState.selectedRate || !wizardState.quantity) return;

    const entry: PriceWorkEntry = {
      id: `${mode}-${Date.now()}`,
      type: mode,
      workItem: wizardState.workItem,
      col2: wizardState.col2,
      col3: wizardState.col3,
      col4: wizardState.col4,
      rate: wizardState.selectedRate.rate_gbp || 0,
      quantity: wizardState.quantity,
      total: getTotal(),
      rateId: wizardState.selectedRate.id,
    };

    onAddEntry(entry);
    onClose();
  };

  const goBack = () => {
    if (wizardState.step > 1) {
      setWizardState(prev => ({ ...prev, step: (prev.step - 1) as any }));
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-xl font-semibold text-slate-900">
                Add {mode === 'ipsom' ? 'Ipsom' : 'Mollsworth'} Rate
              </h3>
              <p className="text-sm text-slate-600">
                Step {wizardState.step} of 5: {getStepLabel(wizardState.step)}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-slate-200 rounded-full h-2 mb-6">
            <div 
              className={`h-2 rounded-full transition-all duration-300 ${
                mode === 'ipsom' ? 'bg-blue-600' : 'bg-purple-600'
              }`}
              style={{ width: `${(wizardState.step / 5) * 100}%` }}
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <p className="text-red-800 text-sm">{error}</p>
            </div>
          )}

          {loading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-2 text-slate-600">Loading rates...</p>
            </div>
          ) : (
            <>
              {/* Steps 1-4: Selection */}
              {wizardState.step <= 4 && (
                <div className="space-y-4">
                  <h4 className="text-lg font-medium text-slate-900">
                    Select {getStepLabel(wizardState.step)}
                  </h4>
                  
                  <div className="grid grid-cols-1 gap-2 max-h-60 overflow-y-auto">
                    {getFilteredOptions(wizardState.step).map((option) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => handleStepSelection(option)}
                        className={`p-3 text-left border rounded-lg hover:bg-slate-50 transition-colors ${
                          mode === 'ipsom' 
                            ? 'border-blue-200 hover:border-blue-400' 
                            : 'border-purple-200 hover:border-purple-400'
                        }`}
                      >
                        {option || '-'}
                      </button>
                    ))}
                  </div>

                  {wizardState.step > 1 && (
                    <button
                      type="button"
                      onClick={goBack}
                      className="flex items-center space-x-2 text-slate-600 hover:text-slate-900 transition-colors"
                    >
                      <ArrowLeft className="h-4 w-4" />
                      <span>Back</span>
                    </button>
                  )}
                </div>
              )}

              {/* Step 5: Quantity & Review */}
              {wizardState.step === 5 && (
                <div className="space-y-6">
                  <h4 className="text-lg font-medium text-slate-900">Quantity & Review</h4>
                  
                  {/* Selection Summary */}
                  <div className="bg-slate-50 rounded-lg p-6">
                    <h5 className="text-lg font-semibold text-slate-900 mb-4 flex items-center space-x-2">
                      <span>Selected Rate Details</span>
                      <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                        mode === 'ipsom' ? 'bg-purple-100 text-purple-800' : 'bg-indigo-100 text-indigo-800'
                      }`}>
                        {mode === 'ipsom' ? 'Ipsom Rate' : 'Mollsworth Rate'}
                      </span>
                    </h5>
                    <div className="space-y-3">
                      <div className="text-xl font-bold text-slate-900">{wizardState.workItem}</div>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="font-medium text-slate-700">
                            {mode === 'ipsom' ? 'Column 2:' : 'Voltage:'}
                          </span>
                          <span className="ml-2 text-slate-900">{wizardState.col2 || 'N/A'}</span>
                        </div>
                        <div>
                          <span className="font-medium text-slate-700">
                            {mode === 'ipsom' ? 'Column 3:' : 'Excavation:'}
                          </span>
                          <span className="ml-2 text-slate-900">{wizardState.col3 || 'N/A'}</span>
                        </div>
                        <div>
                          <span className="font-medium text-slate-700">
                            {mode === 'ipsom' ? 'Column 4:' : 'Site:'}
                          </span>
                          <span className="ml-2 text-slate-900">{wizardState.col4 || 'N/A'}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Quantity Input */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Quantity (metres)
                    </label>
                    <input
                      type="number"
                      value={wizardState.quantity || ''}
                      onChange={(e) => handleQuantityChange(parseFloat(e.target.value) || 0)}
                      className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Enter quantity..."
                      min="0"
                      step="0.01"
                    />
                  </div>

                  {/* Rate & Total */}
                  {wizardState.selectedRate && wizardState.quantity > 0 && (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                      <div className="space-y-1">
                        <div className="text-green-800">
                          <strong>Rate:</strong> £{(wizardState.selectedRate.rate_gbp || 0).toFixed(2)} per metre
                        </div>
                        <div className="text-green-800">
                          <strong>Total:</strong> {wizardState.quantity}m × £{(wizardState.selectedRate.rate_gbp || 0).toFixed(2)} = £{getTotal().toFixed(2)}
                        </div>
                      </div>
                    </div>
                  )}

                  {!wizardState.selectedRate && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                      <p className="text-amber-800">No rate found for this combination.</p>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex space-x-3">
                    <button
                      type="button"
                      onClick={goBack}
                      className="flex-1 px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg transition-colors"
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      onClick={handleAddToTimesheet}
                      disabled={!wizardState.selectedRate || !wizardState.quantity || wizardState.quantity <= 0}
                      className={`flex-1 px-4 py-2 text-white rounded-lg transition-colors disabled:bg-slate-400 disabled:cursor-not-allowed ${
                        mode === 'ipsom' 
                          ? 'bg-blue-600 hover:bg-blue-700' 
                          : 'bg-purple-600 hover:bg-purple-700'
                      }`}
                    >
                      Add to Timesheet
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};