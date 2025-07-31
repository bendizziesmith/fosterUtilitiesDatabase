import React, { useState } from 'react';
import { ArrowLeft, X, Clock, CheckCircle } from 'lucide-react';

interface DayRateWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onAddEntry: (entry: DayRateEntry) => void;
  onWorkingDaysUpdate?: (days: string[]) => void;
  employeeRate?: number;
}

export interface DayRateEntry {
  id: string;
  type: 'day_rate';
  day: string;
  hours: number;
  reason: string;
  supervisor: string;
  total: number;
}

interface WizardState {
  step: 1 | 2 | 3;
  selectedDays: string[];
  hours: number;
  reason: string;
  supervisor: string;
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const HOURS_PER_DAY = 10; // 10 hours per day

export const DayRateWizard: React.FC<DayRateWizardProps> = ({
  isOpen,
  onClose,
  onAddEntry,
  onWorkingDaysUpdate,
  employeeRate = 38.00,
}) => {
  const [wizardState, setWizardState] = useState<WizardState>({
    step: 1,
    selectedDays: [],
    hours: 10,
    reason: '',
    supervisor: '',
  });

  const resetWizard = () => {
    setWizardState({
      step: 1,
      selectedDays: [],
      hours: 10,
      reason: '',
      supervisor: '',
    });
  };

  const handleClose = () => {
    resetWizard();
    onClose();
  };

  const nextStep = () => {
    if (wizardState.step < 3) {
      setWizardState(prev => ({ ...prev, step: (prev.step + 1) as any }));
    }
  };

  const prevStep = () => {
    if (wizardState.step > 1) {
      setWizardState(prev => ({ ...prev, step: (prev.step - 1) as any }));
    }
  };

  const handleDayToggle = (day: string) => {
    setWizardState(prev => ({
      ...prev,
      selectedDays: prev.selectedDays.includes(day)
        ? prev.selectedDays.filter(d => d !== day)
        : [...prev.selectedDays, day]
    }));
    
    // Update working days in parent form
    const newSelectedDays = wizardState.selectedDays.includes(day)
      ? wizardState.selectedDays.filter(d => d !== day)
      : [...wizardState.selectedDays, day];
    
    if (onWorkingDaysUpdate) {
      onWorkingDaysUpdate(newSelectedDays);
    }
  };

  const handleDaysConfirm = () => {
    if (wizardState.selectedDays.length === 0) {
      alert('Please select at least one day');
      return;
    }
    // Calculate hours based on selected days (10 hours per day)
    const totalHours = wizardState.selectedDays.length * 10;
    setWizardState(prev => ({ ...prev, hours: totalHours }));
    nextStep();
  };

  const handleHoursChange = (hours: number) => {
    setWizardState(prev => ({ ...prev, hours }));
  };

  const handleReasonChange = (reason: string) => {
    setWizardState(prev => ({ ...prev, reason }));
  };

  const handleSupervisorChange = (supervisor: string) => {
    setWizardState(prev => ({ ...prev, supervisor }));
  };

  const getTotal = () => {
    return wizardState.hours * employeeRate;
  };

  const handleAddToTimesheet = () => {
    // Generate unique ID to prevent duplicates
    const uniqueId = `dayrate-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Create one consolidated entry for all selected days
    const totalHours = wizardState.hours; // Use the actual hours from wizard state
    const entry: DayRateEntry = {
      id: uniqueId,
      type: 'day_rate',
      day: wizardState.selectedDays.join(', '), // "Tuesday, Friday"
      hours: totalHours,
      reason: wizardState.reason,
      supervisor: wizardState.supervisor,
      total: totalHours * employeeRate,
    };
    
    console.log('Adding day rate entry:', entry);
    onAddEntry(entry);
    
    handleClose();
  };

  const canProceedFromStep2 = () => {
    return wizardState.hours > 0;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-xl font-semibold text-slate-900">Add Day Rate</h3>
              <p className="text-sm text-slate-600">Step {wizardState.step} of 3</p>
            </div>
            <button
              onClick={handleClose}
              className="text-slate-400 hover:text-slate-600 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-slate-200 rounded-full h-2 mb-6">
            <div 
              className="bg-orange-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${(wizardState.step / 3) * 100}%` }}
            />
          </div>

          {/* Step 1: Pick Days */}
          {wizardState.step === 1 && (
            <div className="space-y-4">
              <h4 className="text-lg font-medium text-slate-900">Select Working Days</h4>
              <p className="text-sm text-slate-600">Choose one or more days (10 hours per day)</p>
              
              <div className="grid grid-cols-1 gap-2">
                {DAYS.map((day) => (
                  <button
                    key={day}
                    type="button"
                    onClick={() => handleDayToggle(day)}
                    className={`p-3 text-left border-2 rounded-lg transition-colors flex items-center justify-between ${
                      wizardState.selectedDays.includes(day)
                        ? 'border-orange-500 bg-orange-50 text-orange-700'
                        : 'border-orange-200 hover:border-orange-400 hover:bg-orange-50'
                    }`}
                  >
                    <div>
                      <span className="font-medium">{day}</span>
                      <div className="text-xs text-orange-600">10 hours × £{employeeRate.toFixed(2)} = £{(10 * employeeRate).toFixed(2)}</div>
                    </div>
                    {wizardState.selectedDays.includes(day) && (
                      <CheckCircle className="h-5 w-5 text-orange-600" />
                    )}
                  </button>
                ))}
              </div>

              {wizardState.selectedDays.length > 0 && (
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                  <div className="text-orange-800">
                    <strong>Selected:</strong> {wizardState.selectedDays.join(', ')}<br />
                    <strong>Total Hours:</strong> {wizardState.selectedDays.length * 10}h<br />
                    <strong>Total Value:</strong> £{(wizardState.selectedDays.length * 10 * employeeRate).toFixed(2)}
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={handleDaysConfirm}
                disabled={wizardState.selectedDays.length === 0}
                className="w-full px-4 py-2 bg-orange-600 hover:bg-orange-700 disabled:bg-slate-400 text-white rounded-lg transition-colors"
              >
                Continue with Selected Days
              </button>
            </div>
          )}

          {/* Step 2: Enter Hours */}
          {wizardState.step === 2 && (
            <div className="space-y-6">
              <h4 className="text-lg font-medium text-slate-900">Confirm Hours</h4>
              
              <div className="bg-slate-50 rounded-lg p-4">
                <div className="text-sm space-y-1">
                  <div><strong>Days:</strong> {wizardState.selectedDays.join(', ')}</div>
                  <div><strong>Days Selected:</strong> {wizardState.selectedDays.length}</div>
                  <div><strong>Hours per Day:</strong> 10</div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Total Hours (automatically calculated)
                </label>
                <input
                  type="number"
                  value={wizardState.hours}
                  onChange={(e) => handleHoursChange(parseFloat(e.target.value) || 0)}
                  className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  placeholder="Total hours..."
                  min="0"
                  step="0.5"
                  readOnly
                />
                <p className="mt-1 text-xs text-slate-500">
                  Based on {wizardState.selectedDays.length} day(s) × 10 hours each
                </p>
              </div>

              {wizardState.hours > 0 && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="text-green-800">
                    <strong>Rate:</strong> £{employeeRate.toFixed(2)} per hour<br />
                    <strong>Total:</strong> {wizardState.hours}h × £{employeeRate.toFixed(2)} = £{getTotal().toFixed(2)}
                  </div>
                </div>
              )}

              <div className="flex space-x-3">
                <button
                  type="button"
                  onClick={prevStep}
                  className="flex items-center space-x-2 px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg transition-colors"
                >
                  <ArrowLeft className="h-4 w-4" />
                  <span>Back</span>
                </button>
                <button
                  type="button"
                  onClick={nextStep}
                  disabled={!canProceedFromStep2()}
                  className="flex-1 px-4 py-2 bg-orange-600 hover:bg-orange-700 disabled:bg-slate-400 text-white rounded-lg transition-colors"
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Reason & Supervisor */}
          {wizardState.step === 3 && (
            <div className="space-y-6">
              <h4 className="text-lg font-medium text-slate-900">Additional Details</h4>
              
              <div className="bg-slate-50 rounded-lg p-4">
                <div className="space-y-1 text-sm">
                  <div><strong>Days:</strong> {wizardState.selectedDays.join(', ')}</div>
                  <div><strong>Hours:</strong> {wizardState.hours}</div>
                  <div><strong>Total:</strong> £{getTotal().toFixed(2)}</div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Reason (Optional)
                </label>
                <textarea
                  value={wizardState.reason}
                  onChange={(e) => handleReasonChange(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  rows={3}
                  placeholder="Enter reason for day rate..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Supervisor Name (Optional)
                </label>
                <input
                  type="text"
                  value={wizardState.supervisor}
                  onChange={(e) => handleSupervisorChange(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  placeholder="Enter supervisor name..."
                />
              </div>

              <div className="flex space-x-3">
                <button
                  type="button"
                  onClick={prevStep}
                  className="flex items-center space-x-2 px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg transition-colors"
                >
                  <ArrowLeft className="h-4 w-4" />
                  <span>Back</span>
                </button>
                <button
                  type="button"
                  onClick={handleAddToTimesheet}
                  className="flex-1 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg transition-colors"
                >
                  Add {wizardState.selectedDays.length} Day{wizardState.selectedDays.length !== 1 ? 's' : ''} to Timesheet
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};