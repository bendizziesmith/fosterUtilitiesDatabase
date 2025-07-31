import React from 'react';
import { FileText, Zap, X } from 'lucide-react';

interface ChooseRateTypeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (mode: 'ipsom' | 'mollsworth') => void;
}

export const ChooseRateTypeModal: React.FC<ChooseRateTypeModalProps> = ({
  isOpen,
  onClose,
  onSelect,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-semibold text-slate-900">Choose Rate Type</h3>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="space-y-4">
            <button
              type="button"
              onClick={() => onSelect('ipsom')}
              className="w-full p-6 border-2 border-blue-200 rounded-xl hover:border-blue-400 hover:bg-blue-50 transition-all group"
            >
              <div className="flex items-center space-x-4">
                <div className="p-3 bg-blue-100 rounded-lg group-hover:bg-blue-200 transition-colors">
                  <FileText className="h-6 w-6 text-blue-600" />
                </div>
                <div className="text-left">
                  <h4 className="text-lg font-semibold text-slate-900">Ipsom Rates</h4>
                  <p className="text-sm text-slate-600">Service & Main LV/HV work rates</p>
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => onSelect('mollsworth')}
              className="w-full p-6 border-2 border-purple-200 rounded-xl hover:border-purple-400 hover:bg-purple-50 transition-all group"
            >
              <div className="flex items-center space-x-4">
                <div className="p-3 bg-purple-100 rounded-lg group-hover:bg-purple-200 transition-colors">
                  <Zap className="h-6 w-6 text-purple-600" />
                </div>
                <div className="text-left">
                  <h4 className="text-lg font-semibold text-slate-900">Mollsworth Rates</h4>
                  <p className="text-sm text-slate-600">11KV & 33KV work rates</p>
                </div>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};