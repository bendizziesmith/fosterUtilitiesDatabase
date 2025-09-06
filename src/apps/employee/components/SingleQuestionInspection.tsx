import React, { useState } from 'react';
import { Car, CheckCircle, XCircle, Camera, ArrowRight, ArrowLeft, AlertTriangle } from 'lucide-react';
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
  notes: string;
  photo: File | null;
  previousDefectId?: string;
  wasDefectFixed?: boolean;
  hasPreviousDefect?: boolean;
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
  'Fire extinguisher',
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
  const [loadingPreviousDefects, setLoadingPreviousDefects] = useState(false);

  const [formData, setFormData] = useState<FormData>({
    vehicleId: assignedVehicle?.id || '',
    overrideVehicleRegistration: '',
    useAssignedVehicle: !!assignedVehicle,
    odometerReading: '',
    inspectionItems: DEFAULT_CHECKLIST_ITEMS.map((name) => ({
      name,
      status: null,
      notes: '',
      photo: null,
    })),
    additionalItems: [],
  });

  // Load previous defects when component mounts or vehicle changes
  React.useEffect(() => {
    if (formData.vehicleId || formData.overrideVehicleRegistration) {
      loadPreviousDefects();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.vehicleId, formData.overrideVehicleRegistration]);

  const loadPreviousDefects = async () => {
    setLoadingPreviousDefects(true);
    try {
      // Get the last 7 days of inspections for this vehicle
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      let vehicleQuery = supabase
        .from('vehicle_inspections')
        .select(
          `
          *,
          inspection_items(*)
        `
        )
        .gte('submitted_at', sevenDaysAgo.toISOString())
        .order('submitted_at', { ascending: false });

      // Filter by vehicle
      if (formData.useAssignedVehicle && formData.vehicleId) {
        vehicleQuery = vehicleQuery.eq('vehicle_id', formData.vehicleId);
      } else if (formData.overrideVehicleRegistration) {
        vehicleQuery = vehicleQuery.eq('override_vehicle_registration', formData.overrideVehicleRegistration);
      } else if (formData.vehicleId) {
        vehicleQuery = vehicleQuery.eq('vehicle_id', formData.vehicleId);
      }

      const { data: previousInspections, error } = await vehicleQuery;

      if (error) throw error;

      // Find defects from previous inspections
      const previousDefects: { [itemName: string]: any } = {};

      if (previousInspections) {
        previousInspections.forEach((inspection) => {
          if (inspection.inspection_items) {
            inspection.inspection_items.forEach((item: any) => {
              if (item.status === 'defect' && item.defect_status !== 'fixed') {
                // Only track the most recent defect for each item
                if (
                  !previousDefects[item.item_name] ||
                  new Date(inspection.submitted_at) > new Date(previousDefects[item.item_name].submitted_at)
                ) {
                  previousDefects[item.item_name] = {
                    ...item,
                    submitted_at: inspection.submitted_at,
                  };
                }
              }
            });
          }
        });
      }

      // Update inspection items with previous defect information
      setFormData((prev) => ({
        ...prev,
        inspectionItems: prev.inspectionItems.map((item) => ({
          ...item,
          hasPreviousDefect: !!previousDefects[item.name],
          previousDefectId: previousDefects[item.name]?.id,
        })),
      }));
    } catch (error) {
      console.error('Error loading previous defects:', error);
    } finally {
      setLoadingPreviousDefects(false);
    }
  };

  const handleVehicleToggle = (useAssigned: boolean) => {
    setFormData((prev) => ({
      ...prev,
      useAssignedVehicle: useAssigned,
      vehicleId: useAssigned && assignedVehicle ? assignedVehicle.id : '',
      overrideVehicleRegistration: useAssigned ? '' : prev.overrideVehicleRegistration,
    }));
    setErrors((prev) => ({ ...prev, vehicle: '' }));
  };

  const handleVehicleChange = (vehicleId: string) => {
    setFormData((prev) => ({ ...prev, vehicleId }));
    setErrors((prev) => ({ ...prev, vehicle: '' }));
  };

  const handleOverrideRegistrationChange = (registration: string) => {
    setFormData((prev) => ({ ...prev, overrideVehicleRegistration: registration }));
    setErrors((prev) => ({ ...prev, vehicle: '' }));
  };

  const handleOdometerChange = (reading: string) => {
    setFormData((prev) => ({ ...prev, odometerReading: reading }));
    setErrors((prev) => ({ ...prev, odometer: '' }));
  };

  const updateCurrentInspectionItem = (field: keyof InspectionItem, value: any) => {
    setFormData((prev) => ({
      ...prev,
      inspectionItems: prev.inspectionItems.map((item, i) =>
        i === currentQuestionIndex ? { ...item, [field]: value } : item
      ),
    }));
  };

  const handleDefectFixedResponse = (wasFixed: boolean) => {
    updateCurrentInspectionItem('wasDefectFixed', wasFixed);
    if (wasFixed) {
      updateCurrentInspectionItem('status', 'ok');
      updateCurrentInspectionItem('notes', 'Previous defect has been fixed');
    } else {
      updateCurrentInspectionItem('status', 'defect');
    }
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

    if (currentItem.status === 'defect' && !currentItem.notes.trim()) {
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
        has_defects: [...formData.inspectionItems, ...formData.additionalItems].some((item) => item.status === 'defect'),
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
      const itemsToInsert: any[] = [];

      for (const item of allItems) {
        if (item.name.trim() && item.status) {
          let photoUrl = null;

          if (item.photo) {
            photoUrl = await uploadInspectionPhoto(item.photo, inspection.id, item.name);
          }

          const itemData: any = {
            inspection_id: inspection.id,
            item_name: item.name.trim(),
            status: item.status === 'ok' ? 'no_defect' : 'defect',
            notes: item.notes.trim() || null,
            photo_url: photoUrl,
            defect_severity: item.status === 'defect' ? 'medium' : null,
            action_required: item.status === 'defect',
          };

          // Handle defect tracking
          if (item.hasPreviousDefect && item.wasDefectFixed) {
            itemData.defect_fixed = true;
            itemData.previous_defect_id = item.previousDefectId;
            itemData.defect_status = 'fixed';

            // Update the previous defect to mark it as fixed
            if (item.previousDefectId) {
              await supabase.from('inspection_items').update({ defect_status: 'fixed' }).eq('id', item.previousDefectId);
            }
          } else if (item.status === 'defect') {
            itemData.defect_status = 'active';
          }

          itemsToInsert.push(itemData);
        }
      }

      if (itemsToInsert.length > 0) {
        const { error: itemsError } = await supabase.from('inspection_items').insert(itemsToInsert);
        if (itemsError) throw itemsError;
      }

      let vehicleDisplayName = '';
      if (formData.useAssignedVehicle) {
        const selectedVehicle = vehicles.find((v) => v.id === formData.vehicleId) || assignedVehicle;
        vehicleDisplayName = `${selectedVehicle?.registration_number} (${(selectedVehicle as any)?.make_model ?? ''})`;
      } else {
        if (formData.vehicleId) {
          const selectedVehicle = vehicles.find((v) => v.id === formData.vehicleId);
          vehicleDisplayName = `${selectedVehicle?.registration_number} (${(selectedVehicle as any)?.make_model ?? ''})`;
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
    setFormData((prev) => ({
      ...prev,
      additionalItems: [
        ...prev.additionalItems,
        {
          name: '',
          status: null,
          notes: '',
          photo: null,
        },
      ],
    }));
  };

  const removeAdditionalItem = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      additionalItems: prev.additionalItems.filter((_, i) => i !== index),
    }));
  };

  const updateAdditionalItem = (index: number, field: keyof InspectionItem, value: any) => {
    setFormData((prev) => ({
      ...prev,
      additionalItems: prev.additionalItems.map((item, i) => (i === index ? { ...item, [field]: value } : item)),
    }));
  };

  const getProgress = () => {
    switch (currentStep) {
      case 'vehicle':
        return 10;
      case 'odometer':
        return 20;
      case 'inspection':
        return 20 + ((currentQuestionIndex + 1) / formData.inspectionItems.length) * 60;
      case 'additional':
        return 90;
      default:
        return 0;
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
              {currentStep === 'inspection' &&
                `Question ${currentQuestionIndex + 1} of ${formData.inspectionItems.length}`}
              {currentStep === 'additional' && 'Additional Plant Items'}
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-slate-200 rounded-full h-2">
          <div className="bg-blue-600 h-2 rounded-full transition-all duration-300" style={{ width: `${getProgress()}%` }} />
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
                <label
                  className={`block p-6 border-2 rounded-xl cursor-pointer transition-all ${
                    formData.useAssignedVehicle ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-blue-300 hover:bg-blue-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="vehicleOption"
                    checked={formData.useAssignedVehicle}
                    onChange={() => handleVehicleToggle(true)}
                    className="sr-only"
                  />
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <div
                        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                          formData.useAssignedVehicle ? 'border-blue-600 bg-blue-600' : 'border-slate-300'
                        }`}
                      >
                        {formData.useAssignedVehicle && <div className="w-2 h-2 rounded-full bg-white" />}
                      </div>
                      <div className="text-center">
                        <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-3">
                          <Car className="h-8 w-8 text-blue-600" />
                        </div>
                        <div className="text-2xl font-bold text-slate-900">{assignedVehicle.registration_number}</div>
                        <div className="text-slate-600">{(assignedVehicle as any)?.make_model}</div>
                        <div className="text-sm text-slate-500 mt-2">Your assigned vehicle</div>
                      </div>
                    </div>
                  </div>
                </label>
              </div>
            )}

            {/* Use Different Vehicle Option */}
            <div className="mb-6">
              <label
                className={`block p-6 border-2 rounded-xl cursor-pointer transition-all ${
                  !formData.useAssignedVehicle ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50'
                }`}
              >
                <input
                  type="radio"
                  name="vehicleOption"
                  checked={!formData.useAssignedVehicle}
                  onChange={() => handleVehicleToggle(false)}
                  className="sr-only"
                />
                <div className="flex items-center space-x-4">
                  <div
                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                      !formData.useAssignedVehicle ? 'border-blue-600 bg-blue-600' : 'border-slate-300'
                    }`}
                  >
                    {!formData.useAssignedVehicle && <div className="w-2 h-2 rounded-full bg-white" />}
                  </div>
                  <div className="text-center">
                    <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mb-3">
                      <Car className="h-8 w-8 text-orange-600" />
                    </div>
                    <div className="font-medium text-slate-900">Use different vehicle/plant today</div>
                    <div className="text-sm text-slate-600">Select from fleet or enter registration manually</div>
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
                  <label className="block text-sm font-medium text-slate-700 mb-2">Select from Fleet</label>
                  <select
                    value={formData.vehicleId}
                    onChange={(e) => handleVehicleChange(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">Choose a vehicle...</option>
                    {vehicles
                      .filter((v) => v.id !== assignedVehicle?.id)
                      .map((vehicle) => (
                        <option key={vehicle.id} value={vehicle.id}>
                          {vehicle.registration_number} - {(vehicle as any)?.make_model}
                        </option>
                      ))}
                  </select>
                </div>

                {/* Manual Registration Entry */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Or Enter Registration/ID Manually</label>
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

            {errors.vehicle && <p className="text-sm text-red-600">{errors.vehicle}</p>}

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
              <label className="block text-sm font-medium text-slate-700 mb-2">Current Odometer Reading (miles/km)</label>
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
              {errors.odometer && <p className="mt-2 text-sm text-red-600">{errors.odometer}</p>}
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
