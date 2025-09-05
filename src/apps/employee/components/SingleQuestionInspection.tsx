import React, { useState } from 'react';
import { Car, CheckCircle, XCircle, Camera, ArrowRight, ArrowLeft } from 'lucide-react';
import { supabase, Vehicle, Employee, uploadInspectionPhoto } from '../../../lib/supabase';

interface SingleQuestionInspectionProps {
  vehicles: Vehicle[];
  selectedEmployee: Employee;
  onSubmissionSuccess: (vehicle: string, hasDefects: boolean) => void;
  onBack: () => void;
}

interface InspectionItem {
  name: string;
  status: 'ok' | 'defect' | null;
  comments: string;
  photo: File | null;
}

interface FormData {
  vehicleId: string;
  overrideVehicleRegistration: string;
  useAssignedVehicle: boolean;
  odometerReading: string;
  inspectionItems: InspectionItem[];
  additionalItems: InspectionItem[];
}

const DEFAULT_CHECKLIST_ITEMS = [
  'Tyres and wheels',
  'Brakes',
  'Steering',
  'Lights and indicators',
  'Horn',
  'Mirrors',
  'Windscreen and windows',
  'Seat belts',
  'First aid kit',
  'Fire extinguisher'
];

export const SingleQuestionInspection: React.FC<SingleQuestionInspectionProps> = ({
  vehicles,
  selectedEmployee,
  onSubmissionSuccess,
  onBack,
}) => {
  const assignedVehicle = selectedEmployee.assigned_vehicle;
  
  const [currentStep, setCurrentStep] = useState<'vehicle' | 'odometer' | 'inspection' | 'additional'>('vehicle');
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [formData, setFormData] = useState<FormData>({
    vehicleId: assignedVehicle?.id || '',
    overrideVehicleRegistration: '',
    useAssignedVehicle: !!assignedVehicle,
    odometerReading: '',
    inspectionItems: DEFAULT_CHECKLIST_ITEMS.map(name => ({
      name,
      status: null,
      comments: '',
      photo: null,
    })),
    additionalItems: [],
  });

  const handleVehicleToggle = (useAssigned: boolean) => {
    setFormData(prev => ({ 
      ...prev, 
      useAssignedVehicle: useAssigned,
      vehicleId: useAssigned && assignedVehicle ? assignedVehicle.id : '',
      overrideVehicleRegistration: useAssigned ? '' : prev.overrideVehicleRegistration
    }));
    setErrors(prev => ({ ...prev, vehicle: '' }));
  };

  const handleVehicleChange = (vehicleId: string) => {
    setFormData(prev => ({ ...prev, vehicleId }));
    setErrors(prev => ({ ...prev, vehicle: '' }));
  };

  const handleOverrideRegistrationChange = (registration: string) => {
    setFormData(prev => ({ ...prev, overrideVehicleRegistration: registration }));
    setErrors(prev => ({ ...prev, vehicle: '' }));
  };

  const handleOdometerChange = (reading: string) => {
    setFormData(prev => ({ ...prev, odometerReading: reading }));
    setErrors(prev => ({ ...prev, odometer: '' }));
  };

  const updateCurrentInspectionItem = (field: keyof InspectionItem, value: any) => {
    setFormData(prev => ({
      ...prev,
      inspectionItems: prev.inspectionItems.map((item, i) =>
        i === currentQuestionIndex ? { ...item, [field]: value } : item
      )
    }));
  };

  const validateVehicleStep = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (formData.useAssignedVehicle) {
      if (!formData.vehicleId) {
        newErrors.vehicle = 'Please select a vehicle';
      }
    } else {
      if (!formData.vehicleId && !formData.overrideVehicleRegistration.trim()) {
        newErrors.vehicle = 'Please select a vehicle or enter registration';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateOdometerStep = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.odometerReading.trim()) {
      newErrors.odometer = 'Odometer reading is required';
    } else if (isNaN(parseFloat(formData.odometerReading))) {
      newErrors.odometer = 'Please enter a valid number';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNextQuestion = () => {
    const currentItem = formData.inspectionItems[currentQuestionIndex];
    
    if (!currentItem.status) {
      setErrors({ question: 'Please select OK or Defect before continuing' });
      return;
    }

    if (currentItem.status === 'defect' && !currentItem.comments.trim()) {
      setErrors({ question: 'Please add comments for defects before continuing' });
      return;
    }

    setErrors({});

    if (currentQuestionIndex < formData.inspectionItems.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
    } else {
      setCurrentStep('additional');
    }
  };

  const handlePreviousQuestion = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(currentQuestionIndex - 1);
    } else {
      setCurrentStep('odometer');
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    
    try {
      // Create inspection record
      const inspectionData: any = {
        employee_id: selectedEmployee.id,
        odometer_reading: parseFloat(formData.odometerReading),
        has_defects: [...formData.inspectionItems, ...formData.additionalItems].some(item => item.status === 'defect'),
      };

      if (formData.useAssignedVehicle) {
        inspectionData.vehicle_id = formData.vehicleId;
      } else {
        if (formData.vehicleId) {
          inspectionData.vehicle_id = formData.vehicleId;
        } else {
          inspectionData.vehicle_id = vehicles[0]?.id || null;
          inspectionData.override_vehicle_registration = formData.overrideVehicleRegistration.trim();
        }
      }

      const { data: inspection, error: inspectionError } = await supabase
        .from('vehicle_inspections')
        .insert(inspectionData)
        .select()
        .single();

      if (inspectionError) throw inspectionError;

      // Create inspection items
      const allItems = [...formData.inspectionItems, ...formData.additionalItems];
      const itemsToInsert = [];

      for (const item of allItems) {
        if (item.name.trim() && item.status) {
          let photoUrl = null;
          
          if (item.photo) {
            photoUrl = await uploadInspectionPhoto(item.photo, inspection.id, item.name);
          }

          itemsToInsert.push({
            inspection_id: inspection.id,
            item_name: item.name.trim(),
            status: item.status === 'ok' ? 'no_defect' : 'defect',
            notes: item.comments.trim() || null,
            photo_url: photoUrl,
            defect_severity: item.status === 'defect' ? 'medium' : null,
            action_required: item.status === 'defect',
          });
        }
      }

      if (itemsToInsert.length > 0) {
        const { error: itemsError } = await supabase
          .from('inspection_items')
          .insert(itemsToInsert);

        if (itemsError) throw itemsError;
      }

      let vehicleDisplayName = '';
      if (formData.useAssignedVehicle) {
        const selectedVehicle = vehicles.find(v => v.id === formData.vehicleId) || assignedVehicle;
        vehicleDisplayName = `${selectedVehicle?.registration_number} (${selectedVehicle?.make_model})`;
      } else {
        if (formData.vehicleId) {
          const selectedVehicle = vehicles.find(v => v.id === formData.vehicleId);
          vehicleDisplayName = `${selectedVehicle?.registration_number} (${selectedVehicle?.make_model})`;
        } else {
          vehicleDisplayName = formData.overrideVehicleRegistration;
        }
      }

      onSubmissionSuccess(vehicleDisplayName, inspectionData.has_defects);
    } catch (error) {
      console.error('Error submitting inspection:', error);
      alert('Failed to submit inspection. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const addAdditionalItem = () => {
    setFormData(prev => ({
      ...prev,
      additionalItems: [...prev.additionalItems, {
        name: '',
        status: null,
        comments: '',
        photo: null,
      }]
    }));
  };

  const removeAdditionalItem = (index: number) => {
    setFormData(prev => ({
      ...prev,
      additionalItems: prev.additionalItems.filter((_, i) => i !== index)
    }));
  };

  const updateAdditionalItem = (index: number, field: keyof InspectionItem, value: any) => {
    setFormData(prev => ({
      ...prev,
      additionalItems: prev.additionalItems.map((item, i) =>
        i === index ? { ...item, [field]: value } : item
      )
    }));
  };

  const getProgress = () => {
    switch (currentStep) {
      case 'vehicle': return 10;
      case 'odometer': return 20;
      case 'inspection': return 20 + ((currentQuestionIndex + 1) / formData.inspectionItems.length) * 60;
      case 'additional': return 90;
      default: return 0;
    }
  };

  return (
    <div className="space-y-6">
      {/* Progress Header */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Daily Vehicle & Plant Check</h1>
            <p className="text-blue-600 font-medium">Welcome, {selectedEmployee.full_name}</p>
            <p className="text-slate-600">{selectedEmployee.role}</p>
          </div>
          <div className="text-right">
            <div className="text-sm text-slate-500 mb-1">
              {currentStep === 'vehicle' && 'Step 1: Vehicle Selection'}
              {currentStep === 'odometer' && 'Step 2: Odometer Reading'}
              {currentStep === 'inspection' && `Question ${currentQuestionIndex + 1} of ${formData.inspectionItems.length}`}
              {currentStep === 'additional' && 'Additional Plant Items'}
            </div>
          </div>
        </div>
        
        {/* Progress Bar */}
        <div className="w-full bg-slate-200 rounded-full h-2">
          <div 
            className="bg-blue-600 h-2 rounded-full transition-all duration-300"
            style={{ width: `${getProgress()}%` }}
          />
        </div>
      </div>

      {/* Step Content */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        {/* Step 1: Vehicle Selection */}
        {currentStep === 'vehicle' && (
          <div className="space-y-6">
            <div className="flex items-center space-x-3 mb-6">
              <Car className="h-6 w-6 text-blue-600" />
              <h2 className="text-xl font-semibold text-slate-900">Vehicle Selection</h2>
            </div>

            {/* Assigned Vehicle Option */}
            {assignedVehicle && (
              <div className="mb-4">
                <label className={`block p-6 border-2 rounded-xl cursor-pointer transition-all ${
                  formData.useAssignedVehicle
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-slate-200 hover:border-blue-300 hover:bg-blue-50'
                }`}>
                  <input
                    type="radio"
                    name="vehicleOption"
                    checked={formData.useAssignedVehicle}
                    onChange={() => handleVehicleToggle(true)}
                    className="sr-only"
                  />
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                        formData.useAssignedVehicle
                          ? 'border-blue-600 bg-blue-600'
                          : 'border-slate-300'
                      }`}>
                        {formData.useAssignedVehicle && (
                          <div className="w-2 h-2 rounded-full bg-white"></div>
                        )}
                      </div>
                      <div className="text-center">
                        <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-3">
                          <Car className="h-8 w-8 text-blue-600" />
                        </div>
                        <div className="text-2xl font-bold text-slate-900">{assignedVehicle.registration_number}</div>
                        <div className="text-slate-600">{assignedVehicle.make_model}</div>
                        <div className="text-sm text-slate-500 mt-2">Your assigned vehicle</div>
                      </div>
                    </div>
                  </div>
                </label>
              </div>
            )}

            {/* Use Different Vehicle Option */}
            <div className="mb-6">
              <label className={`block p-6 border-2 rounded-xl cursor-pointer transition-all ${
                !formData.useAssignedVehicle
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50'
              }`}>
                <input
                  type="radio"
                  name="vehicleOption"
                  checked={!formData.useAssignedVehicle}
                  onChange={() => handleVehicleToggle(false)}
                  className="sr-only"
                />
                <div className="flex items-center space-x-4">
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                    !formData.useAssignedVehicle
                      ? 'border-blue-600 bg-blue-600'
                      : 'border-slate-300'
                  }`}>
                    {!formData.useAssignedVehicle && (
                      <div className="w-2 h-2 rounded-full bg-white"></div>
                    )}
                  </div>
                  <div className="text-center">
                    <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mb-3">
                      <Car className="h-8 w-8 text-orange-600" />
                    </div>
                    <div className="font-medium text-slate-900">
                      Use different vehicle/plant today
                    </div>
                    <div className="text-sm text-slate-600">
                      Select from fleet or enter registration manually
                    </div>
                  </div>
                </div>
              </label>
            </div>

            {/* Different Vehicle Options */}
            {!formData.useAssignedVehicle && (
              <div className="space-y-4 bg-slate-50 rounded-xl p-6">
                <h3 className="text-lg font-semibold text-slate-900 mb-4">Alternative Vehicle Options</h3>
                
                {/* Fleet Vehicle Selection */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Select from Fleet
                  </label>
                  <select
                    value={formData.vehicleId}
                    onChange={(e) => handleVehicleChange(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">Choose a vehicle...</option>
                    {vehicles.filter(v => v.id !== assignedVehicle?.id).map((vehicle) => (
                      <option key={vehicle.id} value={vehicle.id}>
                        {vehicle.registration_number} - {vehicle.make_model}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Manual Registration Entry */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Or Enter Registration/ID Manually
                  </label>
                  <input
                    type="text"
                    value={formData.overrideVehicleRegistration}
                    onChange={(e) => handleOverrideRegistrationChange(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="e.g., ABC123 or Plant-ID-001"
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    Use this for vehicles/plant not in the fleet or temporary equipment
                  </p>
                </div>
              </div>
            )}

            {errors.vehicle && (
              <p className="text-sm text-red-600">{errors.vehicle}</p>
            )}

            <button
              onClick={() => {
                if (validateVehicleStep()) {
                  setCurrentStep('odometer');
                }
              }}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center space-x-2"
            >
              <span>Continue to Odometer Reading</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Step 2: Odometer Reading */}
        {currentStep === 'odometer' && (
          <div className="space-y-6">
            <h2 className="text-xl font-semibold text-slate-900">Odometer Reading</h2>
            
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Current Odometer Reading (miles/km)
              </label>
              <input
                type="number"
                value={formData.odometerReading}
                onChange={(e) => handleOdometerChange(e.target.value)}
                className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg ${
                  errors.odometer ? 'border-red-300' : 'border-slate-300'
                }`}
                placeholder="Enter current reading..."
                step="0.1"
              />
              {errors.odometer && (
                <p className="mt-2 text-sm text-red-600">{errors.odometer}</p>
              )}
            </div>

            <div className="flex space-x-3">
              <button
                onClick={() => setCurrentStep('vehicle')}
                className="flex items-center space-x-2 px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
                <span>Back</span>
              </button>
              <button
                onClick={() => {
                  if (validateOdometerStep()) {
                    setCurrentStep('inspection');
                  }
                }}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center space-x-2"
              >
                <span>Start Daily Check</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Single Question Format */}
        {currentStep === 'inspection' && (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <div className="text-sm text-slate-500 mb-2">
                Question {currentQuestionIndex + 1} of {formData.inspectionItems.length}
              </div>
              <h2 className="text-3xl font-bold text-slate-900 mb-4">
                {formData.inspectionItems[currentQuestionIndex].name}
              </h2>
              <p className="text-slate-600">
                Check this item and select the appropriate status
              </p>
            </div>

            {errors.question && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
                <p className="text-red-800 text-sm">{errors.question}</p>
              </div>
            )}

            {/* Large Action Buttons */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <button
                type="button"
                onClick={() => updateCurrentInspectionItem('status', 'ok')}
                className={`p-8 rounded-2xl border-2 transition-all duration-200 ${
                  formData.inspectionItems[currentQuestionIndex].status === 'ok'
                    ? 'border-green-500 bg-green-50 shadow-lg scale-105'
                    : 'border-slate-200 hover:border-green-300 hover:bg-green-50 hover:scale-102'
                }`}
              >
                <div className="text-center">
                  <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <CheckCircle className="h-8 w-8 text-green-600" />
                  </div>
                  <div className="text-2xl font-bold text-green-700 mb-2">OK</div>
                  <div className="text-sm text-green-600">Item is in good condition</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => updateCurrentInspectionItem('status', 'defect')}
                className={`p-8 rounded-2xl border-2 transition-all duration-200 ${
                  formData.inspectionItems[currentQuestionIndex].status === 'defect'
                    ? 'border-red-500 bg-red-50 shadow-lg scale-105'
                    : 'border-slate-200 hover:border-red-300 hover:bg-red-50 hover:scale-102'
                }`}
              >
                <div className="text-center">
                  <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <XCircle className="h-8 w-8 text-red-600" />
                  </div>
                  <div className="text-2xl font-bold text-red-700 mb-2">Defect</div>
                  <div className="text-sm text-red-600">Item has issues or defects</div>
                </div>
              </button>
            </div>

            {/* Defect Details */}
            {formData.inspectionItems[currentQuestionIndex].status === 'defect' && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-6">
                <h3 className="text-lg font-semibold text-red-800 mb-4">Defect Details</h3>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-red-700 mb-2">
                      Comments (Required)
                    </label>
                    <textarea
                      value={formData.inspectionItems[currentQuestionIndex].comments}
                      onChange={(e) => updateCurrentInspectionItem('comments', e.target.value)}
                      className="w-full px-3 py-2 border border-red-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                      rows={3}
                      placeholder="Describe the defect in detail..."
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-red-700 mb-2">
                      Photo Evidence (Optional)
                    </label>
                    <div className="flex items-center space-x-3">
                      <label className="flex items-center px-4 py-2 border border-red-300 rounded-lg hover:bg-red-50 cursor-pointer">
                        <Camera className="h-4 w-4 mr-2" />
                        {formData.inspectionItems[currentQuestionIndex].photo ? 'Change Photo' : 'Add Photo'}
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => updateCurrentInspectionItem('photo', e.target.files?.[0] || null)}
                          className="sr-only"
                        />
                      </label>
                      {formData.inspectionItems[currentQuestionIndex].photo && (
                        <span className="text-sm text-red-700">
                          {formData.inspectionItems[currentQuestionIndex].photo.name}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Navigation */}
            <div className="flex space-x-3">
              <button
                onClick={handlePreviousQuestion}
                disabled={currentQuestionIndex === 0}
                className="flex items-center space-x-2 px-4 py-2 bg-slate-200 hover:bg-slate-300 disabled:bg-slate-100 disabled:text-slate-400 text-slate-700 rounded-lg transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
                <span>Previous</span>
              </button>
              <button
                onClick={handleNextQuestion}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center space-x-2"
              >
                <span>
                  {currentQuestionIndex === formData.inspectionItems.length - 1 
                    ? 'Continue to Additional Plant' 
                    : 'Next Question'
                  }
                </span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Additional Plant Requirements */}
        {currentStep === 'additional' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-slate-900">Additional Plant Requirements</h2>
              <button
                onClick={addAdditionalItem}
                className="flex items-center space-x-2 bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-lg transition-colors"
              >
                <span>Add Plant Item</span>
              </button>
            </div>

            <p className="text-slate-600">
              Add any additional plant or equipment that requires checking beyond the standard 10 vehicle items.
            </p>

            {formData.additionalItems.length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                <Car className="h-12 w-12 mx-auto mb-4 text-slate-400" />
                <p>No additional plant items added</p>
                <p className="text-sm">Click "Add Plant Item" to add equipment checks</p>
              </div>
            ) : (
              <div className="space-y-4">
                {formData.additionalItems.map((item, index) => (
                  <div key={index} className="border border-slate-200 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <input
                        type="text"
                        value={item.name}
                        onChange={(e) => updateAdditionalItem(index, 'name', e.target.value)}
                        className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent mr-3"
                        placeholder="Enter plant/equipment name..."
                      />
                      <button
                        onClick={() => removeAdditionalItem(index)}
                        className="text-red-600 hover:text-red-800 transition-colors"
                      >
                        Remove
                      </button>
                    </div>

                    {item.name.trim() && (
                      <>
                        <div className="flex space-x-2 mb-3">
                          <button
                            type="button"
                            onClick={() => updateAdditionalItem(index, 'status', 'ok')}
                            className={`flex items-center space-x-2 px-3 py-2 rounded-lg transition-colors ${
                              item.status === 'ok'
                                ? 'bg-green-100 text-green-700 border-2 border-green-300'
                                : 'bg-slate-100 hover:bg-green-50 text-slate-700 border-2 border-transparent hover:border-green-200'
                            }`}
                          >
                            <CheckCircle className="h-4 w-4" />
                            <span>Serviceable</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => updateAdditionalItem(index, 'status', 'defect')}
                            className={`flex items-center space-x-2 px-3 py-2 rounded-lg transition-colors ${
                              item.status === 'defect'
                                ? 'bg-red-100 text-red-700 border-2 border-red-300'
                                : 'bg-slate-100 hover:bg-red-50 text-slate-700 border-2 border-transparent hover:border-red-200'
                            }`}
                          >
                            <XCircle className="h-4 w-4" />
                            <span>Defect</span>
                          </button>
                        </div>

                        {item.status === 'defect' && (
                          <div className="space-y-3 p-3 bg-red-50 rounded-lg">
                            <div>
                              <label className="block text-sm font-medium text-red-700 mb-1">
                                Comments (Required for defects)
                              </label>
                              <textarea
                                value={item.comments}
                                onChange={(e) => updateAdditionalItem(index, 'comments', e.target.value)}
                                className="w-full px-3 py-2 border border-red-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                                rows={2}
                                placeholder="Describe the defect..."
                              />
                            </div>
                            
                            <div>
                              <label className="block text-sm font-medium text-red-700 mb-2">
                                Photo Evidence (Optional)
                              </label>
                              <div className="flex items-center space-x-3">
                                <label className="flex items-center px-3 py-2 border border-red-300 rounded-lg hover:bg-red-50 cursor-pointer">
                                  <Camera className="h-4 w-4 mr-2" />
                                  {item.photo ? 'Change Photo' : 'Add Photo'}
                                  <input
                                    type="file"
                                    accept="image/*"
                                    onChange={(e) => updateAdditionalItem(index, 'photo', e.target.files?.[0] || null)}
                                    className="sr-only"
                                  />
                                </label>
                                {item.photo && (
                                  <span className="text-sm text-red-700">
                                    {item.photo.name}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="flex space-x-3">
              <button
                onClick={() => setCurrentStep('inspection')}
                className="flex items-center space-x-2 px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
                <span>Back to Questions</span>
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center"
              >
                {submitting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Submitting Inspection...
                  </>
                ) : (
                  'Submit Daily Check'
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};