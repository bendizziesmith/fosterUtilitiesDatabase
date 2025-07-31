import React, { useState, useEffect } from 'react';
import { Upload, CheckCircle, Wrench, Car } from 'lucide-react';
import { supabase, Vehicle, Employee, uploadPlantPhoto } from '../../../lib/supabase';

interface PlantRecordFormProps {
  vehicles: Vehicle[];
  selectedEmployee: Employee;
  onSubmissionSuccess: (vehicle: string) => void;
}

interface FormData {
  vehicleId: string;
  overrideVehicleRegistration: string;
  useAssignedVehicle: boolean;
  description: string;
  photo: File | null;
}

export const PlantRecordForm: React.FC<PlantRecordFormProps> = ({
  vehicles,
  selectedEmployee,
  onSubmissionSuccess,
}) => {
  const assignedVehicle = selectedEmployee.assigned_vehicle;
  
  const [formData, setFormData] = useState<FormData>({
    vehicleId: assignedVehicle?.id || '',
    overrideVehicleRegistration: '',
    useAssignedVehicle: !!assignedVehicle,
    description: '',
    photo: null,
  });
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

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

  const handleDescriptionChange = (description: string) => {
    setFormData(prev => ({ ...prev, description }));
    setErrors(prev => ({ ...prev, description: '' }));
  };

  const handlePhotoChange = (file: File | null) => {
    setFormData(prev => ({ ...prev, photo: file }));
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (formData.useAssignedVehicle) {
      if (!formData.vehicleId) {
        newErrors.vehicle = 'Please select a vehicle';
      }
    } else {
      if (!formData.overrideVehicleRegistration.trim()) {
        newErrors.vehicle = 'Please enter vehicle registration';
      }
    }

    if (!formData.description.trim()) {
      newErrors.description = 'Please enter a description of usage';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) return;

    setSubmitting(true);
    
    try {
      // Create plant record
      const recordData: any = {
        employee_id: selectedEmployee.id,
        description: formData.description.trim(),
      };

      if (formData.useAssignedVehicle) {
        recordData.vehicle_id = formData.vehicleId;
      } else {
        // For override, we still need a vehicle_id, so use the first available vehicle
        // but store the override registration
        recordData.vehicle_id = vehicles[0]?.id || formData.vehicleId;
        recordData.override_vehicle_registration = formData.overrideVehicleRegistration.trim();
      }

      const { data: record, error: recordError } = await supabase
        .from('plant_records')
        .insert(recordData)
        .select()
        .single();

      if (recordError) throw recordError;

      // Upload photo if provided
      let photoUrl = null;
      if (formData.photo) {
        photoUrl = await uploadPlantPhoto(formData.photo, record.id);
        
        // Update record with photo URL
        const { error: updateError } = await supabase
          .from('plant_records')
          .update({ photo_url: photoUrl })
          .eq('id', record.id);

        if (updateError) throw updateError;
      }

      let vehicleDisplayName = '';
      if (formData.useAssignedVehicle) {
        const selectedVehicle = vehicles.find(v => v.id === formData.vehicleId);
        vehicleDisplayName = `${selectedVehicle?.registration_number} (${selectedVehicle?.make} ${selectedVehicle?.model})`;
      } else {
        vehicleDisplayName = formData.overrideVehicleRegistration;
      }

      onSubmissionSuccess(vehicleDisplayName);
    } catch (error) {
      console.error('Error submitting plant record:', error);
      alert('Failed to submit plant record. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setFormData({
      vehicleId: assignedVehicle?.id || '',
      overrideVehicleRegistration: '',
      useAssignedVehicle: !!assignedVehicle,
      description: '',
      photo: null,
    });
    setErrors({});
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Vehicle Selection */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center">
          <Car className="h-5 w-5 mr-2 text-blue-600" />
          Vehicle/Plant Selection
        </h2>

        {/* Assigned Vehicle Option */}
        {assignedVehicle && (
          <div className="mb-4">
            <label className="flex items-center p-4 border-2 border-blue-200 rounded-lg bg-blue-50 cursor-pointer">
              <input
                type="radio"
                name="vehicleOption"
                checked={formData.useAssignedVehicle}
                onChange={() => handleVehicleToggle(true)}
                className="sr-only"
              />
              <div className={`w-4 h-4 rounded-full border-2 mr-3 flex items-center justify-center ${
                formData.useAssignedVehicle
                  ? 'border-blue-600 bg-blue-600'
                  : 'border-slate-300'
              }`}>
                {formData.useAssignedVehicle && (
                  <div className="w-2 h-2 rounded-full bg-white"></div>
                )}
              </div>
              <div className="flex-1">
                <div className="font-medium text-slate-900">
                  Use My Assigned Vehicle
                </div>
                <div className="text-sm text-slate-600">
                  {assignedVehicle.registration_number} - {assignedVehicle.make} {assignedVehicle.model} ({assignedVehicle.year})
                </div>
              </div>
            </label>
          </div>
        )}

        {/* Other Vehicle Options */}
        <div className="space-y-3">
          <label className="flex items-center p-4 border-2 border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50">
            <input
              type="radio"
              name="vehicleOption"
              checked={!formData.useAssignedVehicle}
              onChange={() => handleVehicleToggle(false)}
              className="sr-only"
            />
            <div className={`w-4 h-4 rounded-full border-2 mr-3 flex items-center justify-center ${
              !formData.useAssignedVehicle
                ? 'border-blue-600 bg-blue-600'
                : 'border-slate-300'
            }`}>
              {!formData.useAssignedVehicle && (
                <div className="w-2 h-2 rounded-full bg-white"></div>
              )}
            </div>
            <div className="flex-1">
              <div className="font-medium text-slate-900">
                Use Different Vehicle/Plant
              </div>
              <div className="text-sm text-slate-600">
                Select from fleet or enter registration manually
              </div>
            </div>
          </label>

          {/* Different Vehicle Options */}
          {!formData.useAssignedVehicle && (
            <div className="ml-7 space-y-3">
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
        </div>

        {errors.vehicle && (
          <p className="mt-2 text-sm text-red-600">{errors.vehicle}</p>
        )}
      </div>

      {/* Usage Description */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Usage Description</h2>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Describe how the vehicle/plant was used today
          </label>
          <textarea
            value={formData.description}
            onChange={(e) => handleDescriptionChange(e.target.value)}
            rows={4}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="e.g., Delivered materials to site A, transported equipment to warehouse..."
          />
          {errors.description && (
            <p className="mt-2 text-sm text-red-600">{errors.description}</p>
          )}
        </div>
      </div>

      {/* Photo Upload */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Photo (Optional)</h2>
        <div className="flex items-center space-x-3">
          <label className="flex items-center px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer">
            <Upload className="h-4 w-4 mr-2" />
            {formData.photo ? 'Change Photo' : 'Upload Photo'}
            <input
              type="file"
              accept="image/*"
              onChange={(e) => handlePhotoChange(e.target.files?.[0] || null)}
              className="sr-only"
            />
          </label>
          {formData.photo && (
            <span className="text-sm text-slate-600">
              {formData.photo.name}
            </span>
          )}
        </div>
      </div>

      {/* Submit Button */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center"
        >
          {submitting ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
              Submitting Record...
            </>
          ) : (
            'Submit Plant Record'
          )}
        </button>
      </div>
    </form>
  );
};