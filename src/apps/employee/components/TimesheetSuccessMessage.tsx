import React from 'react';
import { CheckCircle, Plus, FileText } from 'lucide-react';

interface TimesheetSuccessMessageProps {
  jobNumber: string;
  totalValue: number;
  onNewTimesheet: () => void;
}

export const TimesheetSuccessMessage: React.FC<TimesheetSuccessMessageProps> = ({
  jobNumber,
  totalValue,
  onNewTimesheet,
}) => {
  return (
    <div className="bg-white rounded-xl shadow-sm p-8 text-center">
      <div className="mb-6">
        <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
          <CheckCircle className="h-8 w-8 text-green-600" />
        </div>
        
        <h2 className="text-2xl font-semibold text-slate-900 mb-2">
          Timesheet Submitted Successfully
        </h2>
        
        <div className="text-slate-600 mb-4">
          <div className="flex items-center justify-center space-x-2 mb-2">
            <FileText className="h-4 w-4" />
            <span className="font-medium">Job Number: {jobNumber}</span>
          </div>
          <div className="text-lg font-semibold text-green-600">
            Total Value: £{totalValue.toFixed(2)}
          </div>
        </div>
        
        <div className="bg-green-50 border border-green-200 rounded-lg p-6 mb-6">
          <p className="text-green-800">
            Your timesheet has been submitted successfully and is now available for supervisor review and payroll processing.
          </p>
          
          <div className="mt-4 pt-4 border-t border-green-200">
            <p className="text-green-700 text-sm">
              The timesheet includes all work items, daily hours, and calculated values as submitted.
            </p>
          </div>
        </div>
      </div>
      
      <button
        onClick={onNewTimesheet}
        className="bg-green-600 hover:bg-green-700 text-white font-medium py-3 px-6 rounded-lg transition-colors flex items-center justify-center mx-auto space-x-2"
      >
        <FileText className="h-4 w-4" />
        <span>Go to My Timesheet</span>
      </button>
    </div>
  );
};