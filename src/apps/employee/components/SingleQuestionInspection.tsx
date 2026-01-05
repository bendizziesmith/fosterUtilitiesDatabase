import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Car, CheckCircle, XCircle, Camera, ArrowLeft, AlertTriangle, Check, Truck } from 'lucide-react';
import { supabase, Vehicle, Employee, uploadInspectionPhoto } from '../../../lib/supabase';

interface SingleQuestionInspectionProps {
  vehicles: Vehicle[];
  selectedEmployee: Employee;
  onSubmissionSuccess: (vehicle: string, hasDefects: boolean) => void;
  onBack: () => void;
}

type ItemStatus = 'ok' | 'defect' | null;

interface InspectionItem {
  name: string;
  status: ItemStatus;
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
  'All van wheels, tyres, mirrors, windscreen and lights',
  'No damage, dents, scrapes, cracks or defects',
  'All internal instruments, E-Management light',
  'Digger & trailer – wheels, tracks, jockey wheel & electrics',
  'Pecker & buckets, quick hitch, hoses & couplers',
  'Cutting tools – Stihl saw, floor saw & dust suppression',
  'Trench rammer',
  'Cable locator & genny',
  'Petrol breaker, fuel cans & spill kit',
  'All PPE – Fire extinguisher 2kg, first aid kit, eye wash & RAMS',
];

export const SingleQuestionInspection: React.FC<SingleQuestionInspectionProps> = ({
  vehicles,
  selectedEmployee,
  onSubmissionSuccess,
  onBack,
}) => {
  const assignedVehicle = (selectedEmployee.assigned_vehicle || null) as Vehicle | null;

  const [currentStep, setCurrentStep] = useState<'vehicle' | 'odometer' | 'inspection' | 'additional'>('vehicle');
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [loadingPreviousDefects, setLoadingPreviousDefects] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [slideDirection, setSlideDirection] = useState<'left' | 'right'>('left');
  const [showDefectInput, setShowDefectInput] = useState(false);
  const notesInputRef = useRef<HTMLTextAreaElement>(null);

  const [errors, setErrors] = useState<Record<string, string>>({});

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

  useEffect(() => {
    setFormData((prev) => ({
      ...prev,
      vehicleId: assignedVehicle?.id || '',
      useAssignedVehicle: !!assignedVehicle,
      overrideVehicleRegistration: '',
    }));
  }, [selectedEmployee.id, assignedVehicle]);

  useEffect(() => {
    if (formData.vehicleId || formData.overrideVehicleRegistration) {
      loadPreviousDefects();
    }
  }, [formData.vehicleId, formData.overrideVehicleRegistration]);

  useEffect(() => {
    setShowDefectInput(false);
  }, [currentQuestionIndex]);

  const loadPreviousDefects = async () => {
    setLoadingPreviousDefects(true);
    try {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      let q = supabase
        .from('vehicle_inspections')
        .select(`
          id,
          submitted_at,
          override_vehicle_registration,
          vehicle_id,
          inspection_items(id,item_name,status,defect_status)
        `)
        .gte('submitted_at', sevenDaysAgo.toISOString())
        .order('submitted_at', { ascending: false });

      if (formData.useAssignedVehicle && formData.vehicleId) {
        q = q.eq('vehicle_id', formData.vehicleId);
      } else if (formData.overrideVehicleRegistration) {
        q = q.eq('override_vehicle_registration', formData.overrideVehicleRegistration);
      } else if (formData.vehicleId) {
        q = q.eq('vehicle_id', formData.vehicleId);
      }

      const { data, error } = await q;
      if (error) throw error;

      const previousDefects: Record<string, { id: string; submitted_at: string }> = {};
      (data || []).forEach((ins: any) => {
        (ins.inspection_items || []).forEach((it: any) => {
          if (it.status === 'defect' && it.defect_status !== 'fixed') {
            const existing = previousDefects[it.item_name];
            if (!existing || new Date(ins.submitted_at) > new Date(existing.submitted_at)) {
              previousDefects[it.item_name] = { id: it.id, submitted_at: ins.submitted_at };
            }
          }
        });
      });

      setFormData((prev) => ({
        ...prev,
        inspectionItems: prev.inspectionItems.map((item) => ({
          ...item,
          hasPreviousDefect: !!previousDefects[item.name],
          previousDefectId: previousDefects[item.name]?.id,
        })),
      }));
    } catch (err) {
      console.error('Error loading previous defects:', err);
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
    setErrors((e) => ({ ...e, vehicle: '' }));
  };

  const handleVehicleChange = (vehicleId: string) => {
    setFormData((prev) => ({ ...prev, vehicleId }));
    setErrors((e) => ({ ...e, vehicle: '' }));
  };

  const handleOverrideRegistrationChange = (val: string) => {
    setFormData((prev) => ({ ...prev, overrideVehicleRegistration: val }));
    setErrors((e) => ({ ...e, vehicle: '' }));
  };

  const handleOdometerChange = (reading: string) => {
    setFormData((prev) => ({ ...prev, odometerReading: reading }));
    setErrors((e) => ({ ...e, odometer: '' }));
  };

  const updateCurrentInspectionItem = useCallback((field: keyof InspectionItem, value: any) => {
    setFormData((prev) => ({
      ...prev,
      inspectionItems: prev.inspectionItems.map((item, i) =>
        i === currentQuestionIndex ? { ...item, [field]: value } : item
      ),
    }));
  }, [currentQuestionIndex]);

  const advanceToNextQuestion = useCallback(() => {
    if (isTransitioning) return;

    setIsTransitioning(true);
    setSlideDirection('left');

    setTimeout(() => {
      if (currentQuestionIndex < formData.inspectionItems.length - 1) {
        setCurrentQuestionIndex((i) => i + 1);
      } else {
        setCurrentStep('additional');
      }
      setIsTransitioning(false);
    }, 200);
  }, [currentQuestionIndex, formData.inspectionItems.length, isTransitioning]);

  const handleOkClick = useCallback(() => {
    if (isTransitioning) return;

    const item = formData.inspectionItems[currentQuestionIndex];
    if (item.hasPreviousDefect && item.wasDefectFixed === false) return;

    updateCurrentInspectionItem('status', 'ok');
    setErrors({});

    setTimeout(() => {
      advanceToNextQuestion();
    }, 150);
  }, [currentQuestionIndex, formData.inspectionItems, isTransitioning, updateCurrentInspectionItem, advanceToNextQuestion]);

  const handleDefectClick = useCallback(() => {
    if (isTransitioning) return;

    const item = formData.inspectionItems[currentQuestionIndex];
    if (item.hasPreviousDefect && item.wasDefectFixed === true) return;

    updateCurrentInspectionItem('status', 'defect');
    setShowDefectInput(true);
    setErrors({});

    setTimeout(() => {
      notesInputRef.current?.focus();
    }, 100);
  }, [currentQuestionIndex, formData.inspectionItems, isTransitioning, updateCurrentInspectionItem]);

  const handleDefectNotesChange = useCallback((notes: string) => {
    updateCurrentInspectionItem('notes', notes);
  }, [updateCurrentInspectionItem]);

  const handleDefectContinue = useCallback(() => {
    const item = formData.inspectionItems[currentQuestionIndex];
    const isContinuingDefect = item.hasPreviousDefect === true && item.wasDefectFixed === false;

    if (!isContinuingDefect && !item.notes.trim()) {
      setErrors({ question: 'Please add comments for this defect' });
      return;
    }

    setErrors({});
    advanceToNextQuestion();
  }, [currentQuestionIndex, formData.inspectionItems, advanceToNextQuestion]);

  const handleDefectFixedResponse = (wasFixed: boolean) => {
    updateCurrentInspectionItem('wasDefectFixed', wasFixed);
    if (wasFixed) {
      updateCurrentInspectionItem('status', 'ok');
      updateCurrentInspectionItem('notes', 'Previous defect has been fixed');
      setTimeout(() => advanceToNextQuestion(), 200);
    } else {
      updateCurrentInspectionItem('status', 'defect');
      setShowDefectInput(true);
    }
  };

  const validateVehicleStep = () => {
    const errs: Record<string, string> = {};
    if (formData.useAssignedVehicle) {
      if (!formData.vehicleId) errs.vehicle = 'Please select a vehicle';
    } else if (!formData.vehicleId && !formData.overrideVehicleRegistration.trim()) {
      errs.vehicle = 'Please select a vehicle or enter registration';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const validateOdometerStep = () => {
    const errs: Record<string, string> = {};
    if (!formData.odometerReading.trim()) {
      errs.odometer = 'Odometer reading is required';
    } else if (isNaN(parseFloat(formData.odometerReading))) {
      errs.odometer = 'Please enter a valid number';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handlePreviousQuestion = () => {
    if (isTransitioning) return;

    setIsTransitioning(true);
    setSlideDirection('right');

    setTimeout(() => {
      if (currentQuestionIndex > 0) {
        setCurrentQuestionIndex((i) => i - 1);
      } else {
        setCurrentStep('odometer');
      }
      setIsTransitioning(false);
    }, 200);
  };

  const handleSubmit = async () => {
    for (const ai of formData.additionalItems) {
      if (ai.name.trim() && ai.status === 'defect' && !ai.notes.trim()) {
        setErrors({ additional: 'Please add comments for all additional items marked as defect.' });
        return;
      }
    }

    setSubmitting(true);
    try {
      const hasAnyDefect = [...formData.inspectionItems, ...formData.additionalItems].some((i) => i.status === 'defect');

      const inspectionData: any = {
        employee_id: selectedEmployee.id,
        odometer_reading: parseFloat(formData.odometerReading),
        has_defects: hasAnyDefect,
      };

      if (formData.useAssignedVehicle) {
        inspectionData.vehicle_id = formData.vehicleId || null;
      } else if (formData.vehicleId) {
        inspectionData.vehicle_id = formData.vehicleId;
      } else {
        inspectionData.vehicle_id = null;
        inspectionData.override_vehicle_registration = formData.overrideVehicleRegistration.trim();
      }

      const { data: inspection, error: inspectionError } = await supabase
        .from('vehicle_inspections')
        .insert(inspectionData)
        .select()
        .single();
      if (inspectionError) throw inspectionError;

      const rows: any[] = [];
      const allItems = [...formData.inspectionItems, ...formData.additionalItems];

      for (const it of allItems) {
        if (!it.name.trim() || !it.status) continue;

        let photoUrl: string | null = null;
        if (it.photo) {
          try {
            photoUrl = await uploadInspectionPhoto(it.photo, inspection.id, it.name);
          } catch (e) {
            console.warn('Photo upload failed:', e);
          }
        }

        const row: any = {
          inspection_id: inspection.id,
          item_name: it.name.trim(),
          status: it.status === 'ok' ? 'no_defect' : 'defect',
          notes: it.notes.trim() || null,
          photo_url: photoUrl,
          defect_severity: it.status === 'defect' ? 'medium' : null,
          action_required: it.status === 'defect',
        };

        if (it.hasPreviousDefect && it.wasDefectFixed) {
          row.defect_fixed = true;
          row.previous_defect_id = it.previousDefectId;
          row.defect_status = 'fixed';
          if (it.previousDefectId) {
            await supabase.from('inspection_items').update({ defect_status: 'fixed' }).eq('id', it.previousDefectId);
          }
        } else if (it.status === 'defect') {
          row.defect_status = 'active';
        }

        rows.push(row);
      }

      if (rows.length) {
        const { error: itemsErr } = await supabase.from('inspection_items').insert(rows);
        if (itemsErr) throw itemsErr;
      }

      let vehicleLabel = '';
      if (formData.useAssignedVehicle || formData.vehicleId) {
        const v = vehicles.find((x) => x.id === formData.vehicleId) || assignedVehicle || null;
        vehicleLabel = v ? `${v.registration_number} (${(v as any).make_model ?? ''})` : 'Vehicle';
      } else {
        vehicleLabel = formData.overrideVehicleRegistration || 'Vehicle/Plant';
      }

      onSubmissionSuccess(vehicleLabel, hasAnyDefect);
    } catch (err) {
      console.error('Error submitting inspection:', err);
      alert('Failed to submit inspection. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const addAdditionalItem = () =>
    setFormData((prev) => ({
      ...prev,
      additionalItems: [...prev.additionalItems, { name: '', status: null, notes: '', photo: null }],
    }));

  const removeAdditionalItem = (index: number) =>
    setFormData((prev) => ({
      ...prev,
      additionalItems: prev.additionalItems.filter((_, i) => i !== index),
    }));

  const updateAdditionalItem = (index: number, field: keyof InspectionItem, value: any) =>
    setFormData((prev) => ({
      ...prev,
      additionalItems: prev.additionalItems.map((it, i) => (i === index ? { ...it, [field]: value } : it)),
    }));

  const getProgress = () => {
    switch (currentStep) {
      case 'vehicle': return 5;
      case 'odometer': return 15;
      case 'inspection': return 15 + ((currentQuestionIndex + 1) / formData.inspectionItems.length) * 75;
      case 'additional': return 95;
      default: return 0;
    }
  };

  const currentItem = formData.inspectionItems[currentQuestionIndex];

  return (
    <div className="space-y-4">
      {/* Compact Progress Header */}
      <div className="bg-white rounded-xl shadow-sm p-4">
        <div className="flex items-center justify-between mb-3">
          <button
            type="button"
            onClick={currentStep === 'vehicle' ? onBack :
              currentStep === 'odometer' ? () => setCurrentStep('vehicle') :
              currentStep === 'inspection' && currentQuestionIndex === 0 ? () => setCurrentStep('odometer') :
              currentStep === 'inspection' ? handlePreviousQuestion :
              () => setCurrentStep('inspection')}
            className="flex items-center space-x-1 text-slate-600 hover:text-slate-900 transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
            <span className="text-sm font-medium">Back</span>
          </button>

          <div className="text-center">
            <div className="text-xs text-slate-500 uppercase tracking-wide">
              {currentStep === 'vehicle' && 'Step 1 of 4'}
              {currentStep === 'odometer' && 'Step 2 of 4'}
              {currentStep === 'inspection' && `${currentQuestionIndex + 1} of ${formData.inspectionItems.length}`}
              {currentStep === 'additional' && 'Final Step'}
            </div>
          </div>

          <div className="w-16" />
        </div>

        <div className="w-full bg-slate-100 rounded-full h-1.5">
          <div
            className="bg-blue-600 h-1.5 rounded-full transition-all duration-300 ease-out"
            style={{ width: `${getProgress()}%` }}
          />
        </div>
      </div>

      {/* Main Content */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        {/* Vehicle Selection */}
        {currentStep === 'vehicle' && (
          <div className="p-6 space-y-6">
            <div className="text-center mb-2">
              <h2 className="text-xl font-bold text-slate-900">Select Vehicle</h2>
              <p className="text-slate-500 text-sm mt-1">Which vehicle are you checking today?</p>
            </div>

            {assignedVehicle && (
              <button
                type="button"
                onClick={() => {
                  handleVehicleToggle(true);
                  if (validateVehicleStep()) {
                    setTimeout(() => setCurrentStep('odometer'), 100);
                  }
                }}
                className={`w-full p-5 rounded-2xl border-2 transition-all duration-200 text-left ${
                  formData.useAssignedVehicle
                    ? 'border-blue-500 bg-blue-50 shadow-md'
                    : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center space-x-4">
                  <div className="w-14 h-14 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Car className="h-7 w-7 text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2">
                      <span className="text-xl font-bold text-slate-900">{assignedVehicle.registration_number}</span>
                      <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded-full">Assigned</span>
                    </div>
                    <div className="text-slate-600 text-sm truncate">{(assignedVehicle as any)?.make_model}</div>
                  </div>
                  <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                    formData.useAssignedVehicle ? 'border-blue-600 bg-blue-600' : 'border-slate-300'
                  }`}>
                    {formData.useAssignedVehicle && <Check className="h-4 w-4 text-white" />}
                  </div>
                </div>
              </button>
            )}

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200" />
              </div>
              <div className="relative flex justify-center">
                <span className="px-3 bg-white text-sm text-slate-500">or</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => handleVehicleToggle(false)}
              className={`w-full p-5 rounded-2xl border-2 transition-all duration-200 text-left ${
                !formData.useAssignedVehicle
                  ? 'border-orange-500 bg-orange-50 shadow-md'
                  : 'border-slate-200 hover:border-orange-300 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center space-x-4">
                <div className="w-14 h-14 bg-orange-100 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Truck className="h-7 w-7 text-orange-600" />
                </div>
                <div className="flex-1">
                  <div className="font-semibold text-slate-900">Different Vehicle / Plant</div>
                  <div className="text-slate-500 text-sm">Select from fleet or enter manually</div>
                </div>
                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                  !formData.useAssignedVehicle ? 'border-orange-600 bg-orange-600' : 'border-slate-300'
                }`}>
                  {!formData.useAssignedVehicle && <Check className="h-4 w-4 text-white" />}
                </div>
              </div>
            </button>

            {!formData.useAssignedVehicle && (
              <div className="space-y-4 bg-slate-50 rounded-xl p-5 animate-in slide-in-from-top-2 duration-200">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Select from Fleet</label>
                  <select
                    value={formData.vehicleId}
                    onChange={(e) => handleVehicleChange(e.target.value)}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent text-base"
                  >
                    <option value="">Choose a vehicle...</option>
                    {vehicles
                      .filter((v) => v.id !== assignedVehicle?.id)
                      .map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.registration_number} {(v as any)?.make_model ? `- ${(v as any).make_model}` : ''}
                        </option>
                      ))}
                  </select>
                </div>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-slate-300" />
                  </div>
                  <div className="relative flex justify-center">
                    <span className="px-2 bg-slate-50 text-xs text-slate-500">OR ENTER MANUALLY</span>
                  </div>
                </div>

                <div>
                  <input
                    type="text"
                    value={formData.overrideVehicleRegistration}
                    onChange={(e) => handleOverrideRegistrationChange(e.target.value.toUpperCase())}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent text-base font-mono"
                    placeholder="e.g., ABC 123 or PLANT-001"
                  />
                </div>

                <button
                  onClick={() => validateVehicleStep() && setCurrentStep('odometer')}
                  disabled={!formData.vehicleId && !formData.overrideVehicleRegistration.trim()}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-semibold py-3.5 px-4 rounded-xl transition-colors"
                >
                  Continue
                </button>
              </div>
            )}

            {errors.vehicle && (
              <p className="text-sm text-red-600 text-center">{errors.vehicle}</p>
            )}
          </div>
        )}

        {/* Odometer Reading */}
        {currentStep === 'odometer' && (
          <div className="p-6 space-y-6">
            <div className="text-center">
              <h2 className="text-xl font-bold text-slate-900">Odometer Reading</h2>
              <p className="text-slate-500 text-sm mt-1">Enter current mileage</p>
            </div>

            <div>
              <input
                type="number"
                inputMode="decimal"
                value={formData.odometerReading}
                onChange={(e) => handleOdometerChange(e.target.value)}
                className={`w-full px-4 py-4 border-2 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-2xl text-center font-semibold ${
                  errors.odometer ? 'border-red-300' : 'border-slate-200'
                }`}
                placeholder="0"
                step="1"
              />
              {errors.odometer && <p className="mt-2 text-sm text-red-600 text-center">{errors.odometer}</p>}
            </div>

            <button
              onClick={() => validateOdometerStep() && setCurrentStep('inspection')}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-4 px-4 rounded-xl transition-colors text-lg"
            >
              Start Inspection
            </button>
          </div>
        )}

        {/* Inspection Questions */}
        {currentStep === 'inspection' && (
          <div
            className={`transition-all duration-200 ease-out ${
              isTransitioning
                ? slideDirection === 'left'
                  ? 'opacity-0 -translate-x-4'
                  : 'opacity-0 translate-x-4'
                : 'opacity-100 translate-x-0'
            }`}
          >
            {/* Previous defect notice */}
            {currentItem.hasPreviousDefect && currentItem.wasDefectFixed === undefined && (
              <div className="bg-amber-50 border-b border-amber-200 p-5">
                <div className="flex items-start space-x-3">
                  <div className="p-2 bg-amber-100 rounded-lg flex-shrink-0">
                    <AlertTriangle className="h-5 w-5 text-amber-600" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-amber-800">Previous Defect</h3>
                    <p className="text-amber-700 text-sm mt-0.5">This item had a defect recently. Has it been fixed?</p>

                    <div className="flex space-x-3 mt-4">
                      <button
                        type="button"
                        onClick={() => handleDefectFixedResponse(true)}
                        className="flex-1 flex items-center justify-center space-x-2 px-4 py-3 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-xl transition-all active:scale-95"
                      >
                        <CheckCircle className="h-5 w-5" />
                        <span>Yes, Fixed</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDefectFixedResponse(false)}
                        className="flex-1 flex items-center justify-center space-x-2 px-4 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl transition-all active:scale-95"
                      >
                        <XCircle className="h-5 w-5" />
                        <span>Still Defective</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Question display - only show if no previous defect or defect status is determined */}
            {(!currentItem.hasPreviousDefect || currentItem.wasDefectFixed !== undefined) && (
              <div className="p-6">
                <div className="text-center mb-8">
                  <h2 className="text-2xl font-bold text-slate-900 mb-2">
                    {currentItem.name}
                  </h2>
                  {loadingPreviousDefects && (
                    <div className="flex items-center justify-center space-x-2 text-slate-500">
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-slate-300 border-t-blue-600" />
                      <span className="text-sm">Checking history...</span>
                    </div>
                  )}
                </div>

                {errors.question && (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-6 text-center">
                    <p className="text-red-700 text-sm font-medium">{errors.question}</p>
                  </div>
                )}

                {/* OK / Defect buttons - full width, stacked on mobile */}
                {!showDefectInput ? (
                  <div className="space-y-4">
                    <button
                      type="button"
                      onClick={handleOkClick}
                      disabled={isTransitioning || (currentItem.hasPreviousDefect && currentItem.wasDefectFixed === false)}
                      className={`w-full p-6 rounded-2xl border-2 transition-all duration-150 active:scale-[0.98] ${
                        currentItem.status === 'ok'
                          ? 'border-green-500 bg-green-50 shadow-lg'
                          : currentItem.hasPreviousDefect && currentItem.wasDefectFixed === false
                          ? 'border-slate-200 bg-slate-100 opacity-50 cursor-not-allowed'
                          : 'border-slate-200 hover:border-green-400 hover:bg-green-50 active:bg-green-100'
                      }`}
                    >
                      <div className="flex items-center justify-center space-x-4">
                        <div className={`w-14 h-14 rounded-full flex items-center justify-center ${
                          currentItem.status === 'ok' ? 'bg-green-500' : 'bg-green-100'
                        }`}>
                          <CheckCircle className={`h-8 w-8 ${currentItem.status === 'ok' ? 'text-white' : 'text-green-600'}`} />
                        </div>
                        <div className="text-left">
                          <div className={`text-xl font-bold ${currentItem.status === 'ok' ? 'text-green-700' : 'text-slate-900'}`}>
                            OK
                          </div>
                          <div className={`text-sm ${currentItem.status === 'ok' ? 'text-green-600' : 'text-slate-500'}`}>
                            Item is in good condition
                          </div>
                        </div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={handleDefectClick}
                      disabled={isTransitioning || (currentItem.hasPreviousDefect && currentItem.wasDefectFixed === true)}
                      className={`w-full p-6 rounded-2xl border-2 transition-all duration-150 active:scale-[0.98] ${
                        currentItem.status === 'defect'
                          ? 'border-red-500 bg-red-50 shadow-lg'
                          : currentItem.hasPreviousDefect && currentItem.wasDefectFixed === true
                          ? 'border-slate-200 bg-slate-100 opacity-50 cursor-not-allowed'
                          : 'border-slate-200 hover:border-red-400 hover:bg-red-50 active:bg-red-100'
                      }`}
                    >
                      <div className="flex items-center justify-center space-x-4">
                        <div className={`w-14 h-14 rounded-full flex items-center justify-center ${
                          currentItem.status === 'defect' ? 'bg-red-500' : 'bg-red-100'
                        }`}>
                          <XCircle className={`h-8 w-8 ${currentItem.status === 'defect' ? 'text-white' : 'text-red-600'}`} />
                        </div>
                        <div className="text-left">
                          <div className={`text-xl font-bold ${currentItem.status === 'defect' ? 'text-red-700' : 'text-slate-900'}`}>
                            Defect
                          </div>
                          <div className={`text-sm ${currentItem.status === 'defect' ? 'text-red-600' : 'text-slate-500'}`}>
                            Item has issues
                          </div>
                        </div>
                      </div>
                    </button>
                  </div>
                ) : (
                  /* Defect details input */
                  <div className="space-y-4 animate-in slide-in-from-bottom-4 duration-200">
                    <div className="bg-red-50 border border-red-200 rounded-xl p-5">
                      <div className="flex items-center space-x-2 mb-4">
                        <XCircle className="h-5 w-5 text-red-600" />
                        <span className="font-semibold text-red-800">Defect Selected</span>
                      </div>

                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-red-700 mb-2">
                            {currentItem.hasPreviousDefect ? 'Additional Comments (Optional)' : 'Describe the defect *'}
                          </label>
                          <textarea
                            ref={notesInputRef}
                            value={currentItem.notes}
                            onChange={(e) => handleDefectNotesChange(e.target.value)}
                            className="w-full px-4 py-3 border border-red-300 rounded-xl focus:ring-2 focus:ring-red-500 focus:border-transparent resize-none"
                            rows={3}
                            placeholder={currentItem.hasPreviousDefect ? 'Add any updates...' : 'What is wrong with this item?'}
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-red-700 mb-2">Photo (Optional)</label>
                          <label className="flex items-center justify-center px-4 py-3 border-2 border-dashed border-red-300 rounded-xl hover:bg-red-50 cursor-pointer transition-colors">
                            <Camera className="h-5 w-5 text-red-500 mr-2" />
                            <span className="text-red-700 font-medium">
                              {currentItem.photo ? currentItem.photo.name : 'Add Photo'}
                            </span>
                            <input
                              type="file"
                              accept="image/*"
                              capture="environment"
                              onChange={(e) => updateCurrentInspectionItem('photo', e.target.files?.[0] || null)}
                              className="sr-only"
                            />
                          </label>
                        </div>
                      </div>
                    </div>

                    <div className="flex space-x-3">
                      <button
                        type="button"
                        onClick={() => {
                          setShowDefectInput(false);
                          updateCurrentInspectionItem('status', null);
                          updateCurrentInspectionItem('notes', '');
                        }}
                        className="flex-1 py-3.5 px-4 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold rounded-xl transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleDefectContinue}
                        className="flex-1 py-3.5 px-4 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl transition-colors"
                      >
                        Continue
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Additional Plant Items */}
        {currentStep === 'additional' && (
          <div className="p-6 space-y-6">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Additional Plant</h2>
              <p className="text-slate-500 text-sm mt-1">Optional - Add any extra equipment checks for this job</p>
            </div>

            {errors.additional && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">
                {errors.additional}
              </div>
            )}

            {formData.additionalItems.length === 0 ? (
              <div className="border-2 border-dashed border-slate-200 rounded-xl p-8">
                <div className="text-center text-slate-500">
                  <Truck className="h-10 w-10 mx-auto mb-3 text-slate-300" />
                  <p className="font-medium text-slate-600">No additional plant added</p>
                  <p className="text-sm mt-1 mb-4">This is optional - only add if needed for today's job</p>
                  <button
                    onClick={addAdditionalItem}
                    className="inline-flex items-center space-x-2 bg-orange-600 hover:bg-orange-700 text-white px-4 py-2.5 rounded-lg transition-colors text-sm font-medium"
                  >
                    <span>+ Add Plant Item</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {formData.additionalItems.map((item, index) => (
                  <div key={index} className="border border-slate-200 rounded-xl overflow-hidden">
                    <div className="bg-slate-50 px-4 py-3 border-b border-slate-200">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                          Plant Item {index + 1}
                        </span>
                        <button
                          onClick={() => removeAdditionalItem(index)}
                          className="text-red-600 hover:text-red-800 text-xs font-medium px-2 py-1 hover:bg-red-50 rounded transition-colors"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                    <div className="p-4">
                      <div className="mb-3">
                        <label className="block text-sm font-medium text-slate-700 mb-1">Equipment Name</label>
                        <input
                          type="text"
                          value={item.name}
                          onChange={(e) => updateAdditionalItem(index, 'name', e.target.value)}
                          className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          placeholder="e.g., Wacker Plate, Generator, Pump..."
                        />
                      </div>

                      {item.name.trim() && (
                        <>
                          <div className="mb-3">
                            <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
                            <div className="flex space-x-2">
                              <button
                                type="button"
                                onClick={() => updateAdditionalItem(index, 'status', 'ok')}
                                className={`flex-1 flex items-center justify-center space-x-2 px-3 py-2.5 rounded-lg transition-colors ${
                                  item.status === 'ok'
                                    ? 'bg-green-100 text-green-700 border-2 border-green-400'
                                    : 'bg-slate-100 hover:bg-green-50 text-slate-700 border-2 border-transparent'
                                }`}
                              >
                                <CheckCircle className="h-4 w-4" />
                                <span className="font-medium">OK</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => updateAdditionalItem(index, 'status', 'defect')}
                                className={`flex-1 flex items-center justify-center space-x-2 px-3 py-2.5 rounded-lg transition-colors ${
                                  item.status === 'defect'
                                    ? 'bg-red-100 text-red-700 border-2 border-red-400'
                                    : 'bg-slate-100 hover:bg-red-50 text-slate-700 border-2 border-transparent'
                                }`}
                              >
                                <XCircle className="h-4 w-4" />
                                <span className="font-medium">Defect</span>
                              </button>
                            </div>
                          </div>

                          {item.status === 'defect' && (
                            <div className="space-y-3 p-3 bg-red-50 rounded-lg">
                              <div>
                                <label className="block text-sm font-medium text-red-700 mb-1">Defect Description</label>
                                <textarea
                                  value={item.notes}
                                  onChange={(e) => updateAdditionalItem(index, 'notes', e.target.value)}
                                  className="w-full px-3 py-2 border border-red-300 rounded-lg focus:ring-2 focus:ring-red-500"
                                  rows={2}
                                  placeholder="Describe the defect..."
                                />
                              </div>
                              <label className="flex items-center px-3 py-2 border border-red-300 rounded-lg hover:bg-red-100 cursor-pointer transition-colors">
                                <Camera className="h-4 w-4 mr-2 text-red-500" />
                                <span className="text-sm text-red-700">{item.photo ? item.photo.name : 'Add Photo (optional)'}</span>
                                <input
                                  type="file"
                                  accept="image/*"
                                  capture="environment"
                                  onChange={(e) => updateAdditionalItem(index, 'photo', e.target.files?.[0] || null)}
                                  className="sr-only"
                                />
                              </label>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                ))}

                <button
                  onClick={addAdditionalItem}
                  className="w-full flex items-center justify-center space-x-2 border-2 border-dashed border-slate-300 hover:border-orange-400 text-slate-600 hover:text-orange-600 px-4 py-3 rounded-xl transition-colors text-sm font-medium"
                >
                  <span>+ Add Another Plant Item</span>
                </button>
              </div>
            )}

            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white font-semibold py-4 px-4 rounded-xl transition-colors flex items-center justify-center text-lg"
            >
              {submitting ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent mr-2" />
                  Submitting...
                </>
              ) : (
                <>
                  <CheckCircle className="h-5 w-5 mr-2" />
                  Submit Inspection
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
