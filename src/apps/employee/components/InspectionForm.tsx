import React from 'react';
import { SingleQuestionInspection } from './SingleQuestionInspection';
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
    <SingleQuestionInspection
      vehicles={vehicles}
      selectedEmployee={selectedEmployee}
      onSubmissionSuccess={onSubmissionSuccess}
      onBack={() => {}} // This will be handled by the parent component
    />
  );
};