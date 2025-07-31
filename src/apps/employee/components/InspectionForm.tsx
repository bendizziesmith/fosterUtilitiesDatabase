import React from 'react';
import { VehicleInspectionWorkflow } from './VehicleInspectionWorkflow';
import { Vehicle, ChecklistTemplate, Employee } from '../../../lib/supabase';

interface InspectionFormProps {
  vehicles: Vehicle[];
  checklistTemplate: ChecklistTemplate | null;
  selectedEmployee: Employee;
  onSubmissionSuccess: (vehicle: string, hasDefects: boolean) => void;
}

export const InspectionForm: React.FC<InspectionFormProps> = ({
  vehicles,
  checklistTemplate,
  selectedEmployee,
  onSubmissionSuccess,
}) => {
  return (
    <VehicleInspectionWorkflow
      vehicles={vehicles}
      selectedEmployee={selectedEmployee}
      onSubmissionSuccess={onSubmissionSuccess}
    />
  );
};