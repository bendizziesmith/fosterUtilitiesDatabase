import React from 'react';
import { CheckCircle, Plus } from 'lucide-react';

interface PlantSuccessMessageProps {
  vehicle: string;
  onNewRecord: () => void;
}

export const PlantSuccessMessage: React.FC<PlantSuccessMessageProps> = ({
  vehicle,
  onNewRecord,
}) => {
  return (
    <div className="bg-white rounded-xl shadow-sm p-8 text-center">
      <div className="mb-6">
        <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
          <CheckCircle className="h-8 w-8 text-green-600" />
        </div>
        
        <h2 className="text-2xl font-semibold text-slate-900 mb-2">
          Plant Record Submitted Successfully
        </h2>
        
        <p className="text-slate-600 mb-4">
          Vehicle: <span className="font-medium">{vehicle}</span>
        </p>
        
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
          <p className="text-green-800">
            Your plant usage record has been saved and is now available for review.
          </p>
        </div>
      </div>
      
      <button
        onClick={onNewRecord}
        className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-6 rounded-lg transition-colors flex items-center justify-center mx-auto space-x-2"
      >
        <Plus className="h-4 w-4" />
        <span>New Plant Record</span>
      </button>
    </div>
  );
};