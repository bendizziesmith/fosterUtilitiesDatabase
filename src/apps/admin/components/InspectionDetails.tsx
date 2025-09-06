import React from 'react';
import { CheckCircle, XCircle, Camera, Calendar, Car, User, Wrench, Download } from 'lucide-react';
import { VehicleInspection } from '../../../lib/supabase';

interface InspectionDetailsProps {
  inspection: VehicleInspection;
}

export const InspectionDetails: React.FC<InspectionDetailsProps> = ({ inspection }) => {
  const defectItems = inspection.inspection_items?.filter(item => item.status === 'defect') || [];
  const passedItems = inspection.inspection_items?.filter(item => item.status === 'no_defect') || [];
  const fixedDefectItems = inspection.inspection_items?.filter(item => item.defect_fixed) || [];
  
  // Separate vehicle checks from plant requirements
  const vehicleDefects = defectItems.filter(item => !item.item_name.startsWith('Plant Required:'));
  const plantDefects = defectItems.filter(item => item.item_name.startsWith('Plant Required:'));
  const vehiclePassed = passedItems.filter(item => !item.item_name.startsWith('Plant Required:'));
  const plantPassed = passedItems.filter(item => item.item_name.startsWith('Plant Required:'));

  const exportInspectionToCSV = () => {
    const headers = [
      'Inspection Date',
      'Employee Name',
      'Employee Role',
      'Vehicle Registration',
      'Vehicle Make/Model',
      'Overall Status',
      'Item Name',
      'Item Status',
      'Comments',
      'Defect Severity',
      'Action Required',
      'Photo Available'
    ];

    const rows: string[][] = [];

    // Add all inspection items
    const allItems = [...(inspection.inspection_items || [])];
    
    if (allItems.length === 0) {
      // If no items, add a summary row
      rows.push([
        new Date(inspection.submitted_at).toLocaleDateString('en-GB'),
        inspection.employee?.full_name || 'Unknown',
        inspection.employee?.role || '',
        inspection.override_vehicle_registration || inspection.vehicle?.registration_number || 'Unknown',
        inspection.vehicle?.make_model || 'Unknown',
        inspection.has_defects ? 'HAS DEFECTS' : 'ALL CLEAR',
        'No items recorded',
        'N/A',
        '',
        '',
        '',
        'No'
      ]);
    } else {
      allItems.forEach(item => {
        rows.push([
          new Date(inspection.submitted_at).toLocaleDateString('en-GB'),
          inspection.employee?.full_name || 'Unknown',
          inspection.employee?.role || '',
          inspection.override_vehicle_registration || inspection.vehicle?.registration_number || 'Unknown',
          inspection.vehicle?.make_model || 'Unknown',
          inspection.has_defects ? 'HAS DEFECTS' : 'ALL CLEAR',
          item.item_name,
          item.status === 'defect' ? 'DEFECT' : 'OK',
          item.comments || '',
          item.defect_severity || '',
          item.action_required ? 'Yes' : 'No',
          item.photo_url ? 'Yes' : 'No'
        ]);
      });
    }

    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    
    const employeeName = (inspection.employee?.full_name || 'Unknown').replace(/\s+/g, '-');
    const vehicleReg = (inspection.override_vehicle_registration || inspection.vehicle?.registration_number || 'Unknown').replace(/\s+/g, '-');
    const date = new Date(inspection.submitted_at).toISOString().split('T')[0];
    
    a.download = `Vehicle-Check_${employeeName}_${vehicleReg}_${date}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };
  return (
    <div className="space-y-6">
      {/* Download Button */}
      <div className="bg-white rounded-xl shadow-sm p-4">
        <button
          onClick={exportInspectionToCSV}
          className="flex items-center space-x-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
        >
          <Download className="h-4 w-4" />
          <span>Download Inspection Details CSV</span>
        </button>
      </div>

      {/* Header Information */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Car className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">Vehicle</p>
              <p className="text-lg font-semibold text-slate-900">
                {inspection.override_vehicle_registration || inspection.vehicle?.registration_number}
              </p>
              <p className="text-sm text-slate-600">
                {inspection.vehicle ? `${inspection.vehicle.make_model}` : 'Manual Entry'}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <User className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">Inspector</p>
              <p className="text-lg font-semibold text-slate-900">
                {inspection.employee?.full_name || 'Unknown'}
              </p>
              <p className="text-sm text-slate-600">
                {inspection.employee?.role || ''}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <div className="p-2 bg-slate-100 rounded-lg">
              <Calendar className="h-6 w-6 text-slate-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">Check Date</p>
              <p className="text-lg font-semibold text-slate-900">
                {new Date(inspection.submitted_at).toLocaleDateString()}
              </p>
              <p className="text-sm text-slate-600">
                {new Date(inspection.submitted_at).toLocaleTimeString()}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <div className={`p-2 rounded-lg ${
              inspection.has_defects ? 'bg-amber-100' : 'bg-green-100'
            }`}>
              {inspection.has_defects ? (
                <XCircle className="h-6 w-6 text-amber-600" />
              ) : (
                <CheckCircle className="h-6 w-6 text-green-600" />
              )}
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">Status</p>
              <p className={`text-lg font-semibold ${
                inspection.has_defects ? 'text-amber-700' : 'text-green-700'
              }`}>
                {inspection.has_defects ? 'Has Defects' : 'No Defects'}
              </p>
              <p className="text-sm text-slate-600">
                {defectItems.length} issue{defectItems.length !== 1 ? 's' : ''} found
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Vehicle Check Results */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center">
          <Car className="h-5 w-5 text-blue-600 mr-2" />
          Vehicle Daily Check Results (Items 1-10)
        </h3>
        
        {/* Vehicle Defects */}
        {vehicleDefects.length > 0 && (
          <div className="mb-6">
            <h4 className="text-md font-semibold text-red-800 mb-3">Vehicle Defects Found ({vehicleDefects.length})</h4>
            <div className="space-y-4">
              {vehicleDefects.map((item) => (
                <div key={item.id} className={`border rounded-lg p-4 ${
                  item.defect_status === 'fixed' 
                    ? 'border-green-200 bg-green-50' 
                    : 'border-red-200 bg-red-50'
                }`}>
                  <div className="flex items-center justify-between mb-2">
                  <h5 className="font-medium text-slate-900 mb-2">{item.item_name}</h5>
                    {item.defect_status === 'fixed' && (
                      <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs font-medium">
                        Defect Fixed
                      </span>
                    )}
                  </div>
                  
                  {item.comments && (
                    <div className="mb-3">
                      <p className="text-sm font-medium text-slate-700 mb-1">Comments:</p>
                      <p className="text-sm text-slate-600 bg-white p-2 rounded border">
                        {item.comments}
                      </p>
                    </div>
                  )}
                  
                  {item.photo_url && (
                    <div>
                      <p className="text-sm font-medium text-slate-700 mb-2 flex items-center">
                        <Camera className="h-4 w-4 mr-1" />
                        Photo Evidence:
                      </p>
                      <img
                        src={item.photo_url}
                        alt={`Defect: ${item.item_name}`}
                        className="max-w-sm rounded-lg border shadow-sm"
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Vehicle Items Passed */}
        {vehiclePassed.length > 0 && (
          <div>
            <h4 className="text-md font-semibold text-green-800 mb-3">Vehicle Items Passed ({vehiclePassed.length})</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {vehiclePassed.map((item) => (
                <div key={item.id} className={`flex items-center space-x-2 p-3 rounded-lg border ${
                  item.defect_fixed 
                    ? 'bg-blue-50 border-blue-200' 
                    : 'bg-green-50 border-green-200'
                }`}>
                  <CheckCircle className="h-4 w-4 text-green-600 flex-shrink-0" />
                  <span className="text-sm text-slate-900">{item.item_name}</span>
                  {item.defect_fixed && (
                    <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-medium ml-auto">
                      Fixed
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Fixed Defects Section */}
        {fixedDefectItems.length > 0 && (
          <div className="mt-6">
            <h4 className="text-md font-semibold text-blue-800 mb-3">Defects Fixed This Inspection ({fixedDefectItems.length})</h4>
            <div className="space-y-3">
              {fixedDefectItems.map((item) => (
                <div key={item.id} className="flex items-center space-x-3 p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <Wrench className="h-5 w-5 text-blue-600" />
                  </div>
                  <div className="flex-1">
                    <div className="font-medium text-slate-900">{item.item_name}</div>
                    <div className="text-sm text-blue-700">Previous defect has been resolved</div>
                  </div>
                  <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-medium">
                    Fixed
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Additional Plant Requirements (11th+ Items) */}
      {(plantDefects.length > 0 || plantPassed.length > 0) && (
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center">
            <Wrench className="h-5 w-5 text-orange-600 mr-2" />
            Additional Plant Requirements (Items 11+)
          </h3>
          
          {/* Plant Defects */}
          {plantDefects.length > 0 && (
            <div className="mb-6">
              <h4 className="text-md font-semibold text-red-800 mb-3">Plant Defects Found ({plantDefects.length})</h4>
              <div className="space-y-4">
                {plantDefects.map((item) => (
                  <div key={item.id} className="border border-red-200 rounded-lg p-4 bg-red-50">
                    <h5 className="font-medium text-slate-900 mb-2">
                      {item.item_name.replace('Plant Required: ', '')}
                    </h5>
                    
                    {item.comments && (
                      <div className="mb-3">
                        <p className="text-sm font-medium text-slate-700 mb-1">Comments:</p>
                        <p className="text-sm text-slate-600 bg-white p-2 rounded border">
                          {item.comments}
                        </p>
                      </div>
                    )}
                    
                    {item.photo_url && (
                      <div>
                        <p className="text-sm font-medium text-slate-700 mb-2 flex items-center">
                          <Camera className="h-4 w-4 mr-1" />
                          Photo Evidence:
                        </p>
                        <img
                          src={item.photo_url}
                          alt={`Plant Defect: ${item.item_name}`}
                          className="max-w-sm rounded-lg border shadow-sm"
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Plant Items Serviceable */}
          {plantPassed.length > 0 && (
            <div>
              <h4 className="text-md font-semibold text-green-800 mb-3">Plant Items Serviceable ({plantPassed.length})</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {plantPassed.map((item) => (
                  <div key={item.id} className="flex items-center space-x-2 p-3 bg-green-50 rounded-lg border border-green-200">
                    <CheckCircle className="h-4 w-4 text-green-600 flex-shrink-0" />
                    <span className="text-sm text-slate-900">
                      {item.item_name.replace('Plant Required: ', '').replace('Additional Plant: ', '')}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* No Additional Plant Message */}
      {plantDefects.length === 0 && plantPassed.length === 0 && (
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center">
            <Wrench className="h-5 w-5 text-orange-600 mr-2" />
            Additional Plant Requirements
          </h3>
          <div className="text-center py-4">
            <p className="text-slate-600">No additional plant requirements were added for this inspection.</p>
          </div>
        </div>
      )}
    </div>
  );
};