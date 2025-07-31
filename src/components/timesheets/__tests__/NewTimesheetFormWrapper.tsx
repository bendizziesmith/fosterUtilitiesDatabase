// File: NewTimesheetFormWrapper.tsx

import React from 'react';
import { NewTimesheetForm } from '../../pages/employee/NewTimesheetForm';
import { Employee } from '../../lib/supabase';

interface WrapperProps {
  selectedEmployee: Employee | null;
  onSubmissionSuccess: (jobNumber: string, totalValue: number) => void;
  onBack?: () => void;
}

export const NewTimesheetFormWrapper: React.FC<WrapperProps> = ({
  selectedEmployee,
  onSubmissionSuccess,
  onBack,
}) => {
  return (
    <NewTimesheetForm
      selectedEmployee={selectedEmployee}
      onSubmissionSuccess={onSubmissionSuccess}
      onBack={onBack}
    />
  );
};
