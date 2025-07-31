import React from 'react';
import { CheckCircle, AlertTriangle, Plus } from 'lucide-react';

interface SuccessMessageProps {
  vehicle: string;
  hasDefects: boolean;
  onBackToHome: () => void;
}

export const SuccessMessage: React.FC<SuccessMessageProps> = ({
  vehicle,
  hasDefects,
  onBackToHome,
}) => {
  return (
    <div className="bg-white rounded-xl shadow-sm p-8 text-center">
      <div className="mb-6">
        {hasDefects ? (
          <div className="mx-auto w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mb-4">
            <AlertTriangle className="h-8 w-8 text-amber-600" />
          </div>
        ) : (
          <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
            <CheckCircle className="h-8 w-8 text-green-600" />
          </div>
        )}
        
        <h2 className="text-2xl font-semibold text-slate-900 mb-2">
          Inspection Submitted Successfully
        </h2>
        
        <p className="text-slate-600 mb-4">
          Vehicle: <span className="font-medium">{vehicle}</span>
        </p>
        
        {hasDefects ? (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
            <p className="text-amber-800">
              <strong>Defects were found</strong> during this inspection. 
              The supervisor will be notified and can review the details in the admin dashboard.
            </p>
          </div>
        ) : (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
            <p className="text-green-800">
              <strong>No defects found</strong> - Vehicle passed inspection.
            </p>
          </div>
        )}
      </div>
      
      <button
        onClick={onBackToHome}
        className="bg-green-600 hover:bg-green-700 text-white font-medium py-3 px-6 rounded-lg transition-colors flex items-center justify-center mx-auto space-x-2"
      >
        <span>Go Back to Home</span>
      </button>
    </div>
  );
};