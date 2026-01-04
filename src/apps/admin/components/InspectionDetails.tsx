import React, { useState } from 'react';
import {
  CheckCircle, XCircle, Camera, Calendar, Car, User, Clock,
  Download, FileText, AlertTriangle, Wrench, ChevronDown, ChevronUp,
  ExternalLink, Shield
} from 'lucide-react';
import { VehicleInspection } from '../../../lib/supabase';

interface InspectionDetailsProps {
  inspection: VehicleInspection;
}

export const InspectionDetails: React.FC<InspectionDetailsProps> = ({ inspection }) => {
  const [expandedPhotos, setExpandedPhotos] = useState<Set<string>>(new Set());
  const [showAllPassed, setShowAllPassed] = useState(false);

  const allItems = inspection.inspection_items || [];

  const vehicleItems = allItems.filter(item =>
    !item.item_name.startsWith('Plant Required:') &&
    !item.item_name.startsWith('Additional Plant:')
  );

  const plantItems = allItems.filter(item =>
    item.item_name.startsWith('Plant Required:') ||
    item.item_name.startsWith('Additional Plant:')
  );

  const vehicleDefects = vehicleItems.filter(item => item.status === 'defect');
  const vehiclePassed = vehicleItems.filter(item => item.status === 'no_defect');
  const plantDefects = plantItems.filter(item => item.status === 'defect');
  const plantPassed = plantItems.filter(item => item.status === 'no_defect');

  const hasPlantItems = plantItems.length > 0;
  const totalDefects = vehicleDefects.length + plantDefects.length;

  const togglePhotoExpand = (itemId: string) => {
    const newExpanded = new Set(expandedPhotos);
    if (newExpanded.has(itemId)) {
      newExpanded.delete(itemId);
    } else {
      newExpanded.add(itemId);
    }
    setExpandedPhotos(newExpanded);
  };

  const cleanPlantName = (name: string) => {
    return name
      .replace('Plant Required: ', '')
      .replace('Additional Plant: ', '');
  };

  const exportInspectionToCSV = () => {
    const headers = [
      'Inspection Date',
      'Inspection Time',
      'Employee Name',
      'Employee Role',
      'Vehicle Registration',
      'Vehicle Make/Model',
      'Overall Status',
      'Item Category',
      'Item Name',
      'Item Status',
      'Comments',
      'Photo Evidence'
    ];

    const rows: string[][] = [];

    const addItemRows = (items: typeof allItems, category: string) => {
      items.forEach(item => {
        rows.push([
          new Date(inspection.submitted_at).toLocaleDateString('en-GB'),
          new Date(inspection.submitted_at).toLocaleTimeString('en-GB'),
          inspection.employee?.full_name || 'Unknown',
          inspection.employee?.role || '',
          inspection.override_vehicle_registration || inspection.vehicle?.registration_number || 'Unknown',
          inspection.vehicle?.make_model || 'Manual Entry',
          inspection.has_defects ? 'HAS DEFECTS' : 'ALL CLEAR',
          category,
          item.item_name,
          item.status === 'defect' ? 'DEFECT' : 'OK',
          item.notes || '',
          item.photo_url ? 'Yes' : 'No'
        ]);
      });
    };

    addItemRows(vehicleItems, 'Vehicle Check');
    if (hasPlantItems) {
      addItemRows(plantItems, 'Additional Plant');
    }

    if (rows.length === 0) {
      rows.push([
        new Date(inspection.submitted_at).toLocaleDateString('en-GB'),
        new Date(inspection.submitted_at).toLocaleTimeString('en-GB'),
        inspection.employee?.full_name || 'Unknown',
        inspection.employee?.role || '',
        inspection.override_vehicle_registration || inspection.vehicle?.registration_number || 'Unknown',
        inspection.vehicle?.make_model || 'Manual Entry',
        inspection.has_defects ? 'HAS DEFECTS' : 'ALL CLEAR',
        '-',
        'No items recorded',
        '-',
        '',
        'No'
      ]);
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

    a.download = `Inspection_${employeeName}_${vehicleReg}_${date}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const DefectCard = ({ item, index }: { item: typeof allItems[0]; index: number }) => {
    const isExpanded = expandedPhotos.has(item.id);
    const isFixed = item.defect_status === 'fixed';

    return (
      <div className={`border rounded-lg overflow-hidden ${
        isFixed ? 'border-emerald-200 bg-emerald-50/50' : 'border-red-200 bg-white'
      }`}>
        <div className={`px-4 py-3 border-b ${
          isFixed ? 'border-emerald-200 bg-emerald-50' : 'border-red-100 bg-red-50'
        }`}>
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                isFixed ? 'bg-emerald-100' : 'bg-red-100'
              }`}>
                {isFixed ? (
                  <CheckCircle className="h-4 w-4 text-emerald-600" />
                ) : (
                  <span className="text-sm font-semibold text-red-600">{index + 1}</span>
                )}
              </div>
              <div>
                <h4 className="text-sm font-medium text-slate-900">{item.item_name}</h4>
                <div className="flex items-center gap-2 mt-1">
                  {isFixed ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-700 rounded-full">
                      <Wrench className="h-3 w-3" />
                      Resolved
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700 rounded-full">
                      <AlertTriangle className="h-3 w-3" />
                      Active Defect
                    </span>
                  )}
                  {item.photo_url && (
                    <span className="text-xs text-slate-500 flex items-center gap-1">
                      <Camera className="h-3 w-3" />
                      Photo attached
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="px-4 py-3 space-y-3">
          {item.notes && (
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Inspector Comments</p>
              <p className="text-sm text-slate-700 bg-slate-50 rounded-md p-3 border border-slate-100">
                {item.notes}
              </p>
            </div>
          )}

          {item.photo_url && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Photo Evidence</p>
                <button
                  onClick={() => togglePhotoExpand(item.id)}
                  className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"
                >
                  {isExpanded ? (
                    <>
                      <ChevronUp className="h-3 w-3" />
                      Collapse
                    </>
                  ) : (
                    <>
                      <ChevronDown className="h-3 w-3" />
                      Expand
                    </>
                  )}
                </button>
              </div>
              <div className={`relative rounded-lg overflow-hidden border border-slate-200 ${
                isExpanded ? '' : 'max-h-32'
              }`}>
                <img
                  src={item.photo_url}
                  alt={`Evidence: ${item.item_name}`}
                  className={`w-full object-cover ${isExpanded ? '' : 'max-h-32'}`}
                />
                {!isExpanded && (
                  <div className="absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-white to-transparent" />
                )}
              </div>
              <a
                href={item.photo_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 mt-2"
              >
                <ExternalLink className="h-3 w-3" />
                Open full image
              </a>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-lg">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${
              inspection.has_defects ? 'bg-red-50' : 'bg-emerald-50'
            }`}>
              {inspection.has_defects ? (
                <AlertTriangle className="h-5 w-5 text-red-600" />
              ) : (
                <Shield className="h-5 w-5 text-emerald-600" />
              )}
            </div>
            <div>
              <h1 className="text-lg font-semibold text-slate-900">
                Vehicle Inspection Record
              </h1>
              <p className={`text-sm font-medium ${
                inspection.has_defects ? 'text-red-600' : 'text-emerald-600'
              }`}>
                {inspection.has_defects ? `${totalDefects} Defect${totalDefects !== 1 ? 's' : ''} Found` : 'All Checks Passed'}
              </p>
            </div>
          </div>
          <button
            onClick={exportInspectionToCSV}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </button>
        </div>

        <div className="grid grid-cols-4 divide-x divide-slate-200">
          <div className="px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-50 rounded-lg">
                <Car className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide">Vehicle</p>
                <p className="text-sm font-semibold text-slate-900">
                  {inspection.override_vehicle_registration || inspection.vehicle?.registration_number}
                </p>
                <p className="text-xs text-slate-500">
                  {inspection.vehicle?.make_model || 'Manual Entry'}
                </p>
              </div>
            </div>
          </div>

          <div className="px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-slate-100 rounded-lg">
                <User className="h-5 w-5 text-slate-600" />
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide">Inspector</p>
                <p className="text-sm font-semibold text-slate-900">
                  {inspection.employee?.full_name || 'Unknown'}
                </p>
                <p className="text-xs text-slate-500">
                  {inspection.employee?.role || ''}
                </p>
              </div>
            </div>
          </div>

          <div className="px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-slate-100 rounded-lg">
                <Calendar className="h-5 w-5 text-slate-600" />
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide">Date</p>
                <p className="text-sm font-semibold text-slate-900">
                  {new Date(inspection.submitted_at).toLocaleDateString('en-GB', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric'
                  })}
                </p>
              </div>
            </div>
          </div>

          <div className="px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-slate-100 rounded-lg">
                <Clock className="h-5 w-5 text-slate-600" />
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide">Time</p>
                <p className="text-sm font-semibold text-slate-900">
                  {new Date(inspection.submitted_at).toLocaleTimeString('en-GB', {
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {vehicleDefects.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-lg">
          <div className="px-6 py-4 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-red-100 rounded-md">
                <AlertTriangle className="h-4 w-4 text-red-600" />
              </div>
              <h2 className="text-base font-semibold text-slate-900">
                Vehicle Defects
              </h2>
              <span className="px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700 rounded-full">
                {vehicleDefects.length}
              </span>
            </div>
          </div>
          <div className="p-6">
            <div className="grid gap-4">
              {vehicleDefects.map((item, idx) => (
                <DefectCard key={item.id} item={item} index={idx} />
              ))}
            </div>
          </div>
        </div>
      )}

      {vehiclePassed.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-lg">
          <div className="px-6 py-4 border-b border-slate-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-emerald-100 rounded-md">
                  <CheckCircle className="h-4 w-4 text-emerald-600" />
                </div>
                <h2 className="text-base font-semibold text-slate-900">
                  Passed Checks
                </h2>
                <span className="px-2 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-700 rounded-full">
                  {vehiclePassed.length}
                </span>
              </div>
              {vehiclePassed.length > 5 && (
                <button
                  onClick={() => setShowAllPassed(!showAllPassed)}
                  className="text-sm text-blue-600 hover:text-blue-700"
                >
                  {showAllPassed ? 'Show less' : 'Show all'}
                </button>
              )}
            </div>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {(showAllPassed ? vehiclePassed : vehiclePassed.slice(0, 6)).map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-2 px-3 py-2 bg-emerald-50 rounded-md border border-emerald-100"
                >
                  <CheckCircle className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                  <span className="text-sm text-slate-700 truncate">{item.item_name}</span>
                </div>
              ))}
            </div>
            {!showAllPassed && vehiclePassed.length > 6 && (
              <p className="text-xs text-slate-500 mt-3 text-center">
                +{vehiclePassed.length - 6} more items passed
              </p>
            )}
          </div>
        </div>
      )}

      {hasPlantItems && (
        <div className="bg-white border border-slate-200 rounded-lg">
          <div className="px-6 py-4 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-amber-100 rounded-md">
                <Wrench className="h-4 w-4 text-amber-600" />
              </div>
              <h2 className="text-base font-semibold text-slate-900">
                Additional Plant Equipment
              </h2>
              <span className="px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-700 rounded-full">
                {plantItems.length} item{plantItems.length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>

          <div className="p-6 space-y-6">
            {plantDefects.length > 0 && (
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-3">
                  Plant Defects ({plantDefects.length})
                </p>
                <div className="grid gap-4">
                  {plantDefects.map((item, idx) => (
                    <DefectCard key={item.id} item={{...item, item_name: cleanPlantName(item.item_name)}} index={idx} />
                  ))}
                </div>
              </div>
            )}

            {plantPassed.length > 0 && (
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-3">
                  Plant Items Serviceable ({plantPassed.length})
                </p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {plantPassed.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-2 px-3 py-2 bg-emerald-50 rounded-md border border-emerald-100"
                    >
                      <CheckCircle className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                      <span className="text-sm text-slate-700 truncate">
                        {cleanPlantName(item.item_name)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="bg-slate-50 border border-slate-200 rounded-lg px-6 py-4">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-4 text-slate-500">
            <span>Record ID: {inspection.id.slice(0, 8)}...</span>
            <span>|</span>
            <span>
              Submitted: {new Date(inspection.submitted_at).toLocaleString('en-GB')}
            </span>
          </div>
          <div className="flex items-center gap-1 text-slate-500">
            <FileText className="h-4 w-4" />
            <span>Audit record</span>
          </div>
        </div>
      </div>
    </div>
  );
};
