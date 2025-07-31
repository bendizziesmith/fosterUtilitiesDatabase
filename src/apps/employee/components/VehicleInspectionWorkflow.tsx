import React, { useState, useEffect } from 'react';
import { Car, Camera, CheckCircle, AlertTriangle, Upload, X, Save, Calendar, Gauge, ArrowRight, ArrowLeft } from 'lucide-react';
import { supabase, Vehicle, Employee, uploadInspectionPhoto } from '../../../lib/supabase';

interface VehicleInspectionWorkflowProps {
  vehicles: Vehicle[];
  selectedEmployee: Employee;
  onSubmissionSuccess: (vehicle: string, hasDefects: boolean) => void;
}

interface DailyCheckItem {
  id: string;
  name: string;
  status: 'unchecked' | 'ok' | 'defect';
  comments: string;
  photo: File | null;
}

interface PlantRequirement {
  id: string;
  name: string;
  status: 'unchecked' | 'serviceable' | 'defect';
  comments: string;
  photo: File | null;
}

const INSPECTION_ITEMS = [
  'All van wheels, tyres, mirrors, w/screen and lights',
  'No damage, Dents, Scrapes, Cracks or Defects',
  'All internal instruments, E/Management light',
  'Digger and Trailer, Wheels, Tracks, J/Wheel and Electrics',
  'Pecker and buckets, Quick Hitch, Hoses and couplers',
  'Cutting tools, Stihl Saw, Floor Saw and Dust Suppression',
  'Trench Rammer',
  'Cable locator and Genny',
  'Petrol Breaker, Fuel Cans and Spill Kit',
  'All PPE, Fire Ext 2kg, First Aid Kit, Eye Wash and RAMS'
];

export const VehicleInspectionWorkflow: React.FC<VehicleInspectionWorkflowProps> = ({
  vehicles,
  selectedEmployee,
  onSubmissionSuccess,
}) => {
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [useAssignedVehicle, setUseAssignedVehicle] = useState(true);
  const [overrideRegistration, setOverrideRegistration] = useState('');
  const [vehicleMileage, setVehicleMileage] = useState('');
  const [inspectionItems, setInspectionItems] = useState<DailyCheckItem[]>([]);
  const [plantRequirements, setPlantRequirements] = useState<PlantRequirement[]>([]);
  const [showPlantPopup, setShowPlantPopup] = useState(false);
  const [plantText, setPlantText] = useState('');
  const [currentPlantIndex, setCurrentPlantIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [currentStep, setCurrentStep] = useState<'vehicle' | 'mileage' | 'defect-check' | 'popup' | 'plant' | 'complete'>('vehicle');
  const [showPopup, setShowPopup] = useState(false);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [previousDefects, setPreviousDefects] = useState<any[]>([]);
  const [showDefectCheck, setShowDefectCheck] = useState(false);
  const [defectCheckComplete, setDefectCheckComplete] = useState(false);
  const [stillDefectiveItems, setStillDefectiveItems] = useState<Set<string>>(new Set());

  // Get the assigned vehicle from the employee data
  const assignedVehicle = selectedEmployee?.assigned_vehicle;
  const today = new Date();
  const todayFormatted = today.toLocaleDateString('en-GB', { 
    weekday: 'long', 
    day: 'numeric',
    month: 'long', 
    year: 'numeric' 
  });

  useEffect(() => {
    // Initialize inspection items
    const items: DailyCheckItem[] = INSPECTION_ITEMS.map((item, index) => ({
      id: `item-${index}`,
      name: item,
      status: 'unchecked',
      comments: '',
      photo: null,
    }));
    setInspectionItems(items);

    if (assignedVehicle) {
      setSelectedVehicle(assignedVehicle);
      setUseAssignedVehicle(true);
    } else {
      setUseAssignedVehicle(false);
    }
  }, [selectedEmployee, assignedVehicle]);

  const handleVehicleSelection = () => {
    if (useAssignedVehicle && !selectedVehicle) {
      alert('No assigned vehicle found');
      return;
    }
    if (!useAssignedVehicle && !overrideRegistration.trim()) {
      alert('Please enter a vehicle registration');
      return;
    }
    setCurrentStep('mileage');
  };

  const handleMileageNext = () => {
    if (!vehicleMileage.trim()) {
      alert('Please enter the vehicle mileage/odometer reading.');
      return;
    }
    
    // Check for previous defects before starting inspection
    checkForPreviousDefects();
  };

  const checkForPreviousDefects = async () => {
    try {
      // Get the vehicle ID to check for defects
      let vehicleIdToCheck = null;
      if (useAssignedVehicle && selectedVehicle) {
        vehicleIdToCheck = selectedVehicle.id;
      } else {
        // For override registrations, try to find matching vehicle
        const matchingVehicle = vehicles.find(v => 
          v.registration_number.toLowerCase() === overrideRegistration.toLowerCase().trim()
        );
        vehicleIdToCheck = matchingVehicle?.id;
      }

      if (!vehicleIdToCheck) {
        // No vehicle ID found, proceed directly to inspection
        setCurrentStep('popup');
        setShowPopup(true);
        setCurrentQuestionIndex(0);
        return;
      }

      // Check for UNRESOLVED defects in the last 7 days for this vehicle
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const { data: recentInspections, error } = await supabase
        .from('vehicle_inspections')
        .select(`
          *,
          inspection_items(*)
        `)
        .eq('vehicle_id', vehicleIdToCheck)
        .gte('submitted_at', sevenDaysAgo.toISOString())
        .order('submitted_at', { ascending: false })
        .limit(10);

      if (error) {
        console.error('Error checking previous defects:', error);
        // Proceed with normal inspection if error
        setCurrentStep('popup');
        setShowPopup(true);
        setCurrentQuestionIndex(0);
        return;
      }

      if (!recentInspections || recentInspections.length === 0) {
        // No recent inspections, proceed with normal inspection
        setCurrentStep('popup');
        setShowPopup(true);
        setCurrentQuestionIndex(0);
        return;
      }

      // Find unresolved defects - defects that haven't been marked as OK in subsequent inspections
      const unresolvedDefects = [];
      
      // Get all defect items from recent inspections
      for (const inspection of recentInspections) {
        if (!inspection.has_defects || !inspection.inspection_items) continue;
        
        const defectItems = inspection.inspection_items.filter(
          item => item.status === 'defect' && !item.item_name.startsWith('Plant Required:')
        );
        
        for (const defectItem of defectItems) {
          // Check if this defect was fixed in a later inspection
          const wasFixed = recentInspections.some(laterInspection => {
            const laterDate = new Date(laterInspection.submitted_at);
            const currentDate = new Date(inspection.submitted_at);
            
            return laterDate > currentDate &&
                   laterInspection.inspection_items?.some(laterItem =>
                     laterItem.item_name === defectItem.item_name &&
                     laterItem.status === 'no_defect'
                   );
          });
          
          // Only include if not fixed and not already in the list
          if (!wasFixed && !unresolvedDefects.some(existing => existing.item_name === defectItem.item_name)) {
            unresolvedDefects.push(defectItem);
          }
        }
      }

      if (unresolvedDefects.length > 0) {
        // Show defect check popup
        setPreviousDefects(unresolvedDefects);
        setCurrentStep('defect-check');
        setShowDefectCheck(true);
      } else {
        // No unresolved defects, proceed with normal inspection
        setCurrentStep('popup');
        setShowPopup(true);
        setCurrentQuestionIndex(0);
      }
    } catch (error) {
      console.error('Error checking previous defects:', error);
      // Proceed with normal inspection if error
      setCurrentStep('popup');
      setShowPopup(true);
      setCurrentQuestionIndex(0);
    }
  };

  const handleDefectStatusUpdate = (defectItem: any, isStillDefective: boolean) => {
    const newStillDefective = new Set(stillDefectiveItems);
    
    if (isStillDefective) {
      newStillDefective.add(defectItem.item_name);
      
      // Pre-populate the inspection item with defect status and previous comments
      setInspectionItems(prev => 
        prev.map(item => 
          item.name === defectItem.item_name 
            ? { ...item, status: 'defect', comments: defectItem.comments || '' }
            : item
        )
      );
    } else {
      newStillDefective.delete(defectItem.item_name);
      
      // Reset the inspection item to unchecked
      setInspectionItems(prev => 
        prev.map(item => 
          item.name === defectItem.item_name 
            ? { ...item, status: 'unchecked', comments: '' }
            : item
        )
      );
    }
    
    setStillDefectiveItems(newStillDefective);
  };

  const updatePreviousInspectionsStatus = async () => {
    try {
      // For each defect that was marked as fixed, create a new inspection item
      for (const defectItem of previousDefects) {
        if (!stillDefectiveItems.has(defectItem.item_name)) {
          // This defect was marked as fixed, create a "no_defect" entry
          const { error } = await supabase
            .from('inspection_items')
            .insert({
              inspection_id: defectItem.inspection_id,
              item_name: defectItem.item_name,
              status: 'no_defect',
              notes: `Fixed: Previously reported defect has been resolved`,
              created_at: new Date().toISOString()
            });

          if (error) {
            console.error('Error updating fixed defect status:', error);
          }
        }
      }

      // Update the inspection status if all defects are now fixed
      const inspectionIds = [...new Set(previousDefects.map(d => d.inspection_id))];
      
      for (const inspectionId of inspectionIds) {
        // Check if all defects for this inspection are now fixed
        const inspectionDefects = previousDefects.filter(d => d.inspection_id === inspectionId);
        const stillDefectiveForInspection = inspectionDefects.filter(d => 
          stillDefectiveItems.has(d.item_name)
        );

        if (stillDefectiveForInspection.length === 0) {
          // All defects for this inspection are fixed, update the inspection
          const { error } = await supabase
            .from('vehicle_inspections')
            .update({ 
              has_defects: false,
              updated_at: new Date().toISOString()
            })
            .eq('id', inspectionId);

          if (error) {
            console.error('Error updating inspection status:', error);
          }
        }
      }
    } catch (error) {
      console.error('Error updating previous inspection status:', error);
    }
  };

  const handleDefectCheckComplete = () => {
    setShowDefectCheck(false);
    setCurrentStep('popup');
    setShowPopup(true);
    setCurrentQuestionIndex(0);
  };

  const updateCurrentItem = (updates: Partial<DailyCheckItem>) => {
    setInspectionItems(prev => 
      prev.map((item, index) => 
        index === currentQuestionIndex ? { ...item, ...updates } : item
      )
    );
  };

  const updateCurrentPlantItem = (updates: Partial<PlantRequirement>) => {
    setPlantRequirements(prev => 
      prev.map((item, index) => 
        index === currentPlantIndex ? { ...item, ...updates } : item
      )
    );
  };

  const handleStatusChange = (status: 'ok' | 'defect' | 'na') => {
    updateCurrentItem({ status });
    
    // Auto-advance to next question if OK is selected, but NOT on the last item
    if ((status === 'ok' || status === 'na') && currentQuestionIndex < inspectionItems.length - 1) {
      setTimeout(() => {
        setCurrentQuestionIndex(currentQuestionIndex + 1);
      }, 300); // Small delay for visual feedback
    }
  };

  const handlePlantStatusChange = (status: 'serviceable' | 'defect') => {
    updateCurrentPlantItem({ status });
    
    // Auto-advance to next plant item if serviceable is selected
    if (status === 'serviceable') {
      setTimeout(() => {
        if (currentPlantIndex < plantRequirements.length - 1) {
          setCurrentPlantIndex(currentPlantIndex + 1);
        } else {
          // Last plant item - submit automatically
          handleSubmit();
        }
      }, 300);
    }
  };

  const handlePhotoUpload = (file: File) => {
    updateCurrentItem({ photo: file });
  };

  const handlePlantPhotoUpload = (file: File) => {
    updateCurrentPlantItem({ photo: file });
  };

  const removePhoto = () => {
    updateCurrentItem({ photo: null });
  };

  const removePlantPhoto = () => {
    updateCurrentPlantItem({ photo: null });
  };

  const canProceedToNext = () => {
    const currentItem = inspectionItems[currentQuestionIndex];
    if (currentItem.status === 'unchecked') return false;
    
    // For defects, allow proceeding if:
    // 1. Comments are provided, OR
    // 2. This item was pre-populated from previous defects (has previous comments)
    if (currentItem.status === 'defect') {
      const hasComments = currentItem.comments.trim().length > 0;
      const isPrePopulated = stillDefectiveItems.has(currentItem.name);
      if (!hasComments && !isPrePopulated) return false;
    }
    
    return true;
  };

  const canProceedToNextPlant = () => {
    const currentItem = plantRequirements[currentPlantIndex];
    if (currentItem.status === 'unchecked') return false;
    if (currentItem.status === 'defect' && !currentItem.comments.trim()) return false;
    return true;
  };

  const handleNext = () => {
    if (!canProceedToNext()) {
      if (inspectionItems[currentQuestionIndex].status === 'defect') {
        alert('Please add comments for the defect before proceeding.');
      } else {
        alert('Please select OK or Defect for this item.');
      }
      return;
    }

    if (currentQuestionIndex < inspectionItems.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
    } else {
      // Last item completed - go to plant requirements
      setShowPopup(false);
      setCurrentStep('plant');
    }
  };

  const handleNextPlant = () => {
    if (!canProceedToNextPlant()) {
      if (plantRequirements[currentPlantIndex].status === 'defect') {
        alert('Please add comments for the defect before proceeding.');
      } else {
        alert('Please select Serviceable or Defect for this plant item.');
      }
      return;
    }

    if (currentPlantIndex < plantRequirements.length - 1) {
      setCurrentPlantIndex(currentPlantIndex + 1);
    } else {
      handleSubmit();
    }
  };

  const handlePrevious = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(currentQuestionIndex - 1);
    }
  };

  const handlePreviousPlant = () => {
    if (currentPlantIndex > 0) {
      setCurrentPlantIndex(currentPlantIndex - 1);
    }
  };

  const handleAddPlantRequirement = () => {
    if (!plantText.trim()) {
      alert('Please enter plant requirement');
      return;
    }

    const newPlant: PlantRequirement = {
      id: `plant-${Date.now()}`,
      name: plantText.trim(),
      status: 'unchecked',
      comments: '',
      photo: null,
    };

    setPlantRequirements(prev => [...prev, newPlant]);
    setPlantText('');
    setShowPlantPopup(true);
    setCurrentPlantIndex(plantRequirements.length);
  };

  const handleSkipPlant = () => {
    handleSubmit();
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    
    try {
      // Create inspection record
      const hasDefects = inspectionItems.some(item => item.status === 'defect') ||
                        plantRequirements.some(item => item.status === 'defect');
      
      const inspectionData: any = {
        employee_id: selectedEmployee.id,
        has_defects: hasDefects,
        odometer_reading: parseFloat(vehicleMileage),
      };

      if (useAssignedVehicle && selectedVehicle) {
        inspectionData.vehicle_id = selectedVehicle.id;
      } else {
        inspectionData.vehicle_id = vehicles[0]?.id || selectedVehicle?.id;
        inspectionData.override_vehicle_registration = overrideRegistration.trim();
      }

      const { data: inspection, error: inspectionError } = await supabase
        .from('vehicle_inspections')
        .insert(inspectionData)
        .select()
        .single();

      if (inspectionError) throw inspectionError;

      // Create inspection items (vehicle checks first)
      for (const item of inspectionItems) {
        // Only save items that are not N/A and not unchecked
        if (item.status !== 'unchecked' && item.status !== 'na') {
          let photoUrl = null;
          
          // Upload photo if exists
          if (item.photo) {
            photoUrl = await uploadInspectionPhoto(item.photo, inspection.id, item.name);
          }

          const itemData = {
            inspection_id: inspection.id,
            item_name: item.name,
            status: (item.status === 'defect') ? 'defect' : 'no_defect',
            notes: item.comments || null,
            photo_url: photoUrl,
          };

          const { error: itemError } = await supabase
            .from('inspection_items')
            .insert(itemData);

          if (itemError) throw itemError;
        }
      }

      // Create plant requirement items (these will be the 11th+ items)
      for (const plantItem of plantRequirements) {
        // Always save plant items that have been added, regardless of status
        if (plantItem.name && plantItem.name.trim()) {
          let photoUrl = null;
          
          // Upload photo if exists
          if (plantItem.photo) {
            photoUrl = await uploadInspectionPhoto(plantItem.photo, inspection.id, `Plant: ${plantItem.name}`);
          }

          const plantItemData = {
            inspection_id: inspection.id,
            item_name: `Plant Required: ${plantItem.name}`,
            status: plantItem.status === 'defect' ? 'defect' : 'no_defect',
            notes: plantItem.comments || null,
            photo_url: photoUrl,
          };

          const { error: plantItemError } = await supabase
            .from('inspection_items')
            .insert(plantItemData);

          if (plantItemError) throw plantItemError;
        }
      }

      // Get vehicle display name
      let vehicleDisplayName = '';
      if (useAssignedVehicle && selectedVehicle) {
        vehicleDisplayName = `${selectedVehicle.registration_number} (${selectedVehicle.make} ${selectedVehicle.model})`;
      } else {
        vehicleDisplayName = overrideRegistration;
      }

      setShowPopup(false);
      setShowPlantPopup(false);
      onSubmissionSuccess(vehicleDisplayName, hasDefects);
    } catch (error) {
      console.error('Error submitting inspection:', error);
      alert('Failed to submit inspection. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const currentItem = inspectionItems[currentQuestionIndex];
  const currentPlantItem = plantRequirements[currentPlantIndex];
  const progress = ((currentQuestionIndex + 1) / inspectionItems.length) * 100;
  const plantProgress = plantRequirements.length > 0 ? ((currentPlantIndex + 1) / plantRequirements.length) * 100 : 0;

  // Vehicle Selection Step
  if (currentStep === 'vehicle') {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-xl shadow-sm p-8">
          {/* Employee Name Header */}
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-slate-900 mb-2">Daily Vehicle & Plant Check</h1>
            <p className="text-lg text-blue-600 font-medium">
              Welcome, {selectedEmployee.full_name}
            </p>
            <p className="text-sm text-slate-500">{selectedEmployee.role}</p>
          </div>

          {/* Assigned Vehicle Display */}
          {assignedVehicle ? (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-slate-900 mb-6 flex items-center">
                <Car className="h-6 w-6 mr-3 text-blue-600" />
                Your Assigned Vehicle
              </h2>
              
              {/* Assigned Vehicle Card */}
              <div className="p-6 border-2 border-blue-200 rounded-xl bg-blue-50">
                <div className="text-center">
                  <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Car className="h-8 w-8 text-blue-600" />
                  </div>
                  <h3 className="text-2xl font-bold text-slate-900 mb-2">
                    {assignedVehicle.registration_number}
                  </h3>
                  <p className="text-lg text-slate-600 mb-4">
                    {assignedVehicle.make_model}
                  </p>
                  <div className="bg-white rounded-lg p-3 inline-block">
                    <p className="text-sm text-slate-500">Vehicle assigned by employer</p>
                  </div>
                </div>
              </div>
              
              {/* Manual Entry Option (Small) */}
              <div className="border border-slate-200 rounded-lg p-4 bg-slate-50">
                <div className="flex items-center justify-between mb-3">
                  <label className="flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!useAssignedVehicle}
                      onChange={(e) => setUseAssignedVehicle(!e.target.checked)}
                      className="w-4 h-4 text-blue-600 mr-3"
                    />
                    <span className="text-sm font-medium text-slate-700">
                      Use different vehicle/plant today
                    </span>
                  </label>
                </div>
                
                {!useAssignedVehicle && (
                  <div>
                    <input
                      type="text"
                      value={overrideRegistration}
                      onChange={(e) => setOverrideRegistration(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Enter registration (e.g., ABC123)"
                    />
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-slate-900 mb-6 flex items-center">
                <Car className="h-6 w-6 mr-3 text-orange-600" />
                No Assigned Vehicle
              </h2>
              
              <div className="p-6 border-2 border-orange-200 rounded-xl bg-orange-50">
                <div className="text-center mb-4">
                  <AlertTriangle className="h-12 w-12 text-orange-600 mx-auto mb-3" />
                  <h3 className="text-lg font-semibold text-slate-900 mb-2">
                    No Vehicle Assigned
                  </h3>
                  <p className="text-slate-600 mb-4">
                    You don't have an assigned vehicle. Please enter the registration of the vehicle/plant you're using today.
                  </p>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Vehicle/Plant Registration *
                  </label>
                  <input
                    type="text"
                    value={overrideRegistration}
                    onChange={(e) => setOverrideRegistration(e.target.value)}
                    className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Enter registration (e.g., ABC123)"
                    required
                  />
                </div>
              </div>
            </div>
          )}

          <button
            onClick={handleVehicleSelection}
            className="w-full mt-8 bg-blue-600 hover:bg-blue-700 text-white font-medium py-4 px-6 rounded-lg transition-colors text-lg"
          >
            Continue to Daily Check
          </button>
        </div>
      </div>
    );
  }

  // Mileage Step
  if (currentStep === 'mileage') {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-xl shadow-sm p-8">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-slate-900 mb-2">Daily Vehicle Check</h2>
            <p className="text-slate-600">{todayFormatted}</p>
            <div className="mt-4 p-4 bg-blue-50 rounded-lg">
              <p className="text-blue-800 font-medium">
                Vehicle: {useAssignedVehicle && selectedVehicle 
                  ? `${selectedVehicle.registration_number} - ${selectedVehicle.make_model}`
                  : overrideRegistration}
              </p>
            </div>
          </div>

          <div className="space-y-6">
            <div>
              <label className="block text-lg font-medium text-slate-700 mb-3 flex items-center">
                <Gauge className="h-6 w-6 mr-3 text-blue-600" />
                Vehicle Mileage/Odometer Reading *
              </label>
              <input
                type="number"
                value={vehicleMileage}
                onChange={(e) => setVehicleMileage(e.target.value)}
                className="w-full px-4 py-4 text-lg border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter current mileage (e.g., 45678)"
                required
              />
            </div>

            <button
              onClick={handleMileageNext}
              className="w-full bg-green-600 hover:bg-green-700 text-white font-medium py-4 px-6 rounded-lg transition-colors text-lg flex items-center justify-center"
            >
              Start Daily Safety Check
              <ArrowRight className="h-5 w-5 ml-2" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Plant Requirements Step
  if (currentStep === 'plant') {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-xl shadow-sm p-8">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-slate-900 mb-2">Additional Plant Required</h2>
            <p className="text-slate-600">Add any additional plant or equipment needed for this job</p>
          </div>

          <div className="space-y-6">
            <div>
              <label className="block text-lg font-medium text-slate-700 mb-3">
                Plant/Equipment Description
              </label>
              <input
                type="text"
                value={plantText}
                onChange={(e) => setPlantText(e.target.value)}
                className="w-full px-4 py-4 text-lg border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="e.g., Generator, Compressor, Additional Tools..."
              />
            </div>

            <div className="flex space-x-4">
              <button
                onClick={handleAddPlantRequirement}
                disabled={!plantText.trim()}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 text-white font-medium py-4 px-6 rounded-lg transition-colors text-lg"
              >
                Add Plant Item
              </button>
              <button
                onClick={handleSkipPlant}
                className="flex-1 bg-slate-600 hover:bg-slate-700 text-white font-medium py-4 px-6 rounded-lg transition-colors text-lg"
              >
                Skip - No Additional Plant
              </button>
            </div>

            {plantRequirements.length > 0 && (
              <div className="bg-slate-50 rounded-lg p-4">
                <h3 className="font-medium text-slate-900 mb-2">Added Plant Items:</h3>
                <div className="space-y-2">
                  {plantRequirements.map((plant, index) => (
                    <div key={plant.id} className="text-sm text-slate-600">
                      {index + 1}. {plant.name}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Plant Inspection Popup */}
        {showPlantPopup && currentPlantItem && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              {/* Header */}
              <div className="p-6 border-b border-slate-200">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-bold text-slate-900">Plant Inspection</h3>
                  <div className="flex items-center space-x-4">
                    <div className="text-sm text-slate-600">
                      Plant {currentPlantIndex + 1} of {plantRequirements.length}
                    </div>
                    <button
                      onClick={() => {
                        if (confirm('Are you sure you want to exit the plant inspection? Your progress will be lost.')) {
                          setShowPlantPopup(false);
                          setCurrentStep('plant');
                          // Reset plant requirements
                          setPlantRequirements([]);
                          setCurrentPlantIndex(0);
                        }
                      }}
                      className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                      title="Exit plant inspection"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                </div>
                
                {/* Progress Bar */}
                <div className="w-full bg-slate-200 rounded-full h-2">
                  <div 
                    className="bg-orange-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${plantProgress}%` }}
                  ></div>
                </div>
              </div>

              {/* Question Content */}
              <div className="p-8">
                <div className="text-center mb-8">
                  <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <span className="text-2xl font-bold text-orange-600">{currentPlantIndex + 1}</span>
                  </div>
                  <h4 className="text-xl font-semibold text-slate-900 mb-4">
                    {currentPlantItem.name}
                  </h4>
                  <p className="text-slate-600">
                    Check this plant/equipment and select the appropriate status
                  </p>
                </div>

                {/* Status Buttons */}
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <button
                    onClick={() => handlePlantStatusChange('serviceable')}
                    className={`p-6 rounded-xl border-2 transition-all ${
                      currentPlantItem.status === 'serviceable'
                        ? 'border-green-500 bg-green-50 text-green-700'
                        : 'border-slate-300 hover:border-green-400 hover:bg-green-50'
                    }`}
                  >
                    <CheckCircle className="h-8 w-8 mx-auto mb-2" />
                    <div className="font-semibold">Serviceable</div>
                    <div className="text-sm opacity-75">Plant is ready for use</div>
                  </button>

                  <button
                    onClick={() => handlePlantStatusChange('defect')}
                    className={`p-6 rounded-xl border-2 transition-all ${
                      currentPlantItem.status === 'defect'
                        ? 'border-red-500 bg-red-50 text-red-700'
                        : 'border-slate-300 hover:border-red-400 hover:bg-red-50'
                    }`}
                  >
                    <AlertTriangle className="h-8 w-8 mx-auto mb-2" />
                    <div className="font-semibold">Defect Found</div>
                    <div className="text-sm opacity-75">Issue found</div>
                  </button>
                </div>

                {/* Comments for Defects */}
                {currentPlantItem.status === 'defect' && (
                  <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
                    <label className="block text-sm font-medium text-red-800 mb-2">
                      Describe the defect (required):
                    </label>
                    <textarea
                      value={currentPlantItem.comments}
                      onChange={(e) => updateCurrentPlantItem({ comments: e.target.value })}
                      className="w-full px-3 py-2 border border-red-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent resize-none"
                      rows={3}
                      placeholder="Describe what's wrong with this plant/equipment..."
                      required
                    />
                  </div>
                )}

                {/* Photo Upload */}
                {currentPlantItem.status !== 'unchecked' && (
                  <div className="mb-6">
                    <div className="flex items-center space-x-3">
                      <label className="flex items-center px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer transition-colors">
                        <Camera className="h-4 w-4 mr-2" />
                        {currentPlantItem.photo ? 'Change Photo' : 'Add Photo (Optional)'}
                        <input
                          type="file"
                          accept="image/*"
                          multiple={false}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handlePlantPhotoUpload(file);
                          }}
                          className="sr-only"
                        />
                      </label>
                      {currentPlantItem.photo && (
                        <button
                          onClick={removePlantPhoto}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Remove photo"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                    {currentPlantItem.photo && (
                      <div className="mt-2 text-sm text-slate-600">
                        📷 {currentPlantItem.photo.name}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="p-6 border-t border-slate-200 flex justify-between">
                <button
                  onClick={handlePreviousPlant}
                  disabled={currentPlantIndex === 0}
                  className="flex items-center px-4 py-2 text-slate-600 hover:text-slate-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Previous
                </button>

                <button
                  onClick={handleNextPlant}
                  disabled={!canProceedToNextPlant() || submitting}
                  className="flex items-center px-6 py-3 bg-orange-600 hover:bg-orange-700 disabled:bg-slate-400 text-white font-medium rounded-lg transition-colors"
                >
                  {submitting ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Submitting...
                    </>
                  ) : currentPlantIndex === plantRequirements.length - 1 ? (
                    <>
                      Complete Check
                      <Save className="h-4 w-4 ml-2" />
                    </>
                  ) : (
                    <>
                      Next Plant
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Defect Status Check Step
  if (currentStep === 'defect-check') {
    return (
      <div className="max-w-2xl mx-auto">
        {showDefectCheck && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              {/* Header */}
              <div className="p-6 border-b border-slate-200">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-bold text-slate-900">Previous Defects Found</h3>
                  <button
                    onClick={() => {
                      if (confirm('Are you sure you want to exit? You will return to vehicle selection.')) {
                        setShowDefectCheck(false);
                        setCurrentStep('vehicle');
                        setPreviousDefects([]);
                        setStillDefectiveItems(new Set());
                      }
                    }}
                    className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                    title="Exit defect check"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <p className="text-slate-600">
                  Previous defects were found for this vehicle in the last 7 days. Please check if these issues are still present.
                </p>
              </div>

              {/* Defect List */}
              <div className="p-6">
                <div className="space-y-4">
                  {previousDefects.map((defectItem, index) => (
                    <div key={index} className="border border-amber-200 rounded-lg p-4 bg-amber-50">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <h4 className="font-semibold text-slate-900 mb-2">
                            {defectItem.item_name}
                          </h4>
                          {defectItem.comments && (
                            <p className="text-sm text-slate-600 mb-3 bg-white p-2 rounded border">
                              Previous issue: {defectItem.comments}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center space-x-3">
                        <span className="text-sm font-medium text-slate-700">
                          Is this defect still present?
                        </span>
                        <div className="flex space-x-2">
                          <button
                            onClick={() => handleDefectStatusUpdate(defectItem, true)}
                            className={`px-4 py-2 rounded-lg border-2 transition-all ${
                              stillDefectiveItems.has(defectItem.item_name)
                                ? 'border-red-500 bg-red-50 text-red-700'
                                : 'border-slate-300 hover:border-red-400 hover:bg-red-50'
                            }`}
                          >
                            Yes, Still Defective
                          </button>
                          <button
                            onClick={() => handleDefectStatusUpdate(defectItem, false)}
                            className={`px-4 py-2 rounded-lg border-2 transition-all ${
                              !stillDefectiveItems.has(defectItem.item_name) && previousDefects.some(d => d.item_name === defectItem.item_name)
                                ? 'border-green-500 bg-green-50 text-green-700'
                                : 'border-slate-300 hover:border-green-400 hover:bg-green-50'
                            }`}
                          >
                            Fixed
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-6 pt-6 border-t border-slate-200">
                  <button
                    onClick={handleDefectCheckComplete}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-4 px-6 rounded-lg transition-colors text-lg"
                  >
                    Continue with Daily Safety Check
                  </button>
                  <p className="text-sm text-slate-500 mt-2 text-center">
                    Items marked as "Still Defective" will automatically be recorded as defects
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Daily Check Popup
  return (
    <div className="max-w-2xl mx-auto">
      {showPopup && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="p-6 border-b border-slate-200">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold text-slate-900">Daily Safety Check</h3>
                <div className="text-sm text-slate-600">
                  Question {currentQuestionIndex + 1} of {inspectionItems.length}
                </div>
              </div>
              
              {/* Progress Bar */}
              <div className="w-full bg-slate-200 rounded-full h-2">
                <div 
                  className="bg-green-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                ></div>
              </div>
            </div>

            {/* Question Content */}
            <div className="p-8">
              <div className="text-center mb-8">
                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-2xl font-bold text-blue-600">{currentQuestionIndex + 1}</span>
                </div>
                <h4 className="text-xl font-semibold text-slate-900 mb-4">
                  {currentItem?.name}
                </h4>
                {stillDefectiveItems.has(currentItem?.name || '') && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
                    <p className="text-red-800 text-sm font-medium">
                      ⚠️ This item was marked as still defective from previous inspection
                    </p>
                  </div>
                )}
                <p className="text-slate-600">
                  Check this item and select the appropriate status
                </p>
              </div>

              {/* Status Buttons */}
              <div className="grid grid-cols-3 gap-4 mb-6">
                <button
                  onClick={() => handleStatusChange('ok')}
                  disabled={stillDefectiveItems.has(currentItem?.name || '')}
                  className={`p-6 rounded-xl border-2 transition-all ${
                    stillDefectiveItems.has(currentItem?.name || '')
                      ? 'border-slate-300 bg-slate-100 text-slate-400 cursor-not-allowed'
                      :
                    currentItem?.status === 'ok'
                      ? 'border-green-500 bg-green-50 text-green-700'
                      : 'border-slate-300 hover:border-green-400 hover:bg-green-50'
                  }`}
                >
                  <CheckCircle className="h-8 w-8 mx-auto mb-2" />
                  <div className="font-semibold">OK</div>
                  <div className="text-sm opacity-75">Item is serviceable</div>
                </button>

                <button
                  onClick={() => handleStatusChange('defect')}
                  disabled={stillDefectiveItems.has(currentItem?.name || '')}
                  className={`p-6 rounded-xl border-2 transition-all ${
                    stillDefectiveItems.has(currentItem?.name || '')
                      ? 'border-red-500 bg-red-50 text-red-700'
                      :
                    currentItem?.status === 'defect'
                      ? 'border-red-500 bg-red-50 text-red-700'
                      : 'border-slate-300 hover:border-red-400 hover:bg-red-50'
                  }`}
                >
                  <AlertTriangle className="h-8 w-8 mx-auto mb-2" />
                  <div className="font-semibold">Defect</div>
                  <div className="text-sm opacity-75">Issue found</div>
                </button>

                <button
                  onClick={() => handleStatusChange('na')}
                  disabled={stillDefectiveItems.has(currentItem?.name || '')}
                  className={`p-6 rounded-xl border-2 transition-all ${
                    stillDefectiveItems.has(currentItem?.name || '')
                      ? 'border-slate-300 bg-slate-100 text-slate-400 cursor-not-allowed'
                      :
                    currentItem?.status === 'na'
                      ? 'border-slate-500 bg-slate-50 text-slate-700'
                      : 'border-slate-300 hover:border-slate-400 hover:bg-slate-50'
                  }`}
                >
                  <X className="h-8 w-8 mx-auto mb-2" />
                  <div className="font-semibold">N/A</div>
                  <div className="text-sm opacity-75">Not applicable</div>
                </button>
              </div>

              {/* Comments for Defects */}
              {currentItem?.status === 'defect' && (
                <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
                  <label className="block text-sm font-medium text-red-800 mb-2">
                    Describe the defect (required):
                  </label>
                  <textarea
                    value={currentItem.comments}
                    onChange={(e) => updateCurrentItem({ comments: e.target.value })}
                    disabled={stillDefectiveItems.has(currentItem?.name || '')}
                    className="w-full px-3 py-2 border border-red-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent resize-none"
                    rows={3}
                    placeholder="Describe what's wrong with this item..."
                    required
                  />
                  {stillDefectiveItems.has(currentItem?.name || '') && (
                    <p className="text-xs text-red-600 mt-1">
                      Using previous defect description
                    </p>
                  )}
                </div>
              )}

              {/* Photo Upload */}
              {currentItem?.status !== 'unchecked' && (
                <div className="mb-6">
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="flex items-center px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer transition-colors">
                      <Camera className="h-4 w-4 mr-2" />
                      {currentItem.photo ? 'Change Photo' : 'Choose Photo'}
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handlePhotoUpload(file);
                        }}
                        className="sr-only"
                      />
                    </label>
                    <label className="flex items-center px-4 py-2 border border-blue-300 bg-blue-50 rounded-lg hover:bg-blue-100 cursor-pointer transition-colors">
                      <Camera className="h-4 w-4 mr-2" />
                      Take Picture
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handlePhotoUpload(file);
                        }}
                        className="sr-only"
                      />
                    </label>
                    {currentItem.photo && (
                      <button
                        onClick={removePhoto}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Remove photo"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  {currentItem.photo && (
                    <div className="mt-2 text-sm text-slate-600">
                      📷 {currentItem.photo.name}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-slate-200 flex justify-between">
              <button
                onClick={handlePrevious}
                disabled={currentQuestionIndex === 0}
                className="flex items-center px-4 py-2 text-slate-600 hover:text-slate-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Previous
              </button>

              <button
                onClick={handleNext}
                disabled={!canProceedToNext() || submitting}
                className="flex items-center px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 text-white font-medium rounded-lg transition-colors"
              >
                {submitting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Submitting...
                  </>
                ) : currentQuestionIndex === inspectionItems.length - 1 ? (
                  <>
                    Next: Plant Requirements
                    <Save className="h-4 w-4 ml-2" />
                  </>
                ) : (
                  <>
                    Next
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};