import React, { useState } from 'react';
import { Download, Camera, User, Calendar } from 'lucide-react';
import { PlantRecord } from '../../../lib/supabase';

interface PlantRecordsTableProps {
  plantRecords: PlantRecord[];
}

export const PlantRecordsTable: React.FC<PlantRecordsTableProps> = ({
  plantRecords,
}) => {
  const [selectedRecord, setSelectedRecord] = useState<PlantRecord | null>(null);

  const exportToCSV = () => {
    const headers = ['Date', 'Employee', 'Vehicle Registration', 'Make/Model', 'Description', 'Has Photo'];
    const rows = plantRecords.map(record => [
      new Date(record.submitted_at).toLocaleDateString(),
      record.employee?.name || 'Unknown',
      record.vehicle?.registration_number || '',
      record.vehicle?.make || '',
      record.description,
      record.photo_url ? 'Yes' : 'No',
    ]);

    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `plant-records-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  if (plantRecords.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-8 text-center">
        <p className="text-slate-600">No plant records found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">
            Plant Records ({plantRecords.length})
          </h2>
          <button
            onClick={exportToCSV}
            className="flex items-center space-x-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
          >
            <Download className="h-4 w-4" />
            <span>Export CSV</span>
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Employee
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Vehicle
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Description
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Photo
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-200">
              {plantRecords.map((record) => (
                <tr key={record.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">
                    {new Date(record.submitted_at).toLocaleDateString()}
                    <div className="text-xs text-slate-500">
                      {new Date(record.submitted_at).toLocaleTimeString()}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center space-x-2">
                      <User className="h-4 w-4 text-slate-400" />
                      <div>
                        <div className="text-sm font-medium text-slate-900">
                          {record.employee?.name || 'Unknown'}
                        </div>
                        <div className="text-xs text-slate-500">
                          {record.employee?.role || ''}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-slate-900">
                      {record.vehicle?.registration_number}
                    </div>
                    <div className="text-sm text-slate-500">
                      {record.vehicle?.make} {record.vehicle?.model}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-slate-900 max-w-xs truncate">
                      {record.description}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {record.photo_url ? (
                      <div className="flex items-center space-x-1 text-green-600">
                        <Camera className="h-4 w-4" />
                        <span className="text-xs">Yes</span>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400">No</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button
                      onClick={() => setSelectedRecord(record)}
                      className="text-blue-600 hover:text-blue-900 transition-colors"
                    >
                      View Details
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Record Details Modal */}
      {selectedRecord && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-semibold text-slate-900">Plant Record Details</h3>
                <button
                  onClick={() => setSelectedRecord(null)}
                  className="text-slate-400 hover:text-slate-600 transition-colors"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-6">
                {/* Header Info */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex items-center space-x-3">
                    <Calendar className="h-5 w-5 text-slate-400" />
                    <div>
                      <div className="text-sm font-medium text-slate-500">Date</div>
                      <div className="text-slate-900">
                        {new Date(selectedRecord.submitted_at).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-3">
                    <User className="h-5 w-5 text-slate-400" />
                    <div>
                      <div className="text-sm font-medium text-slate-500">Employee</div>
                      <div className="text-slate-900">
                        {selectedRecord.employee?.name || 'Unknown'}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Vehicle Info */}
                <div>
                  <div className="text-sm font-medium text-slate-500 mb-2">Vehicle</div>
                  <div className="bg-slate-50 rounded-lg p-3">
                    <div className="font-medium text-slate-900">
                      {selectedRecord.vehicle?.registration_number}
                    </div>
                    <div className="text-sm text-slate-600">
                      {selectedRecord.vehicle?.make} {selectedRecord.vehicle?.model} ({selectedRecord.vehicle?.year})
                    </div>
                  </div>
                </div>

                {/* Description */}
                <div>
                  <div className="text-sm font-medium text-slate-500 mb-2">Usage Description</div>
                  <div className="bg-slate-50 rounded-lg p-3">
                    <p className="text-slate-900">{selectedRecord.description}</p>
                  </div>
                </div>

                {/* Photo */}
                {selectedRecord.photo_url && (
                  <div>
                    <div className="text-sm font-medium text-slate-500 mb-2">Photo</div>
                    <img
                      src={selectedRecord.photo_url}
                      alt="Plant usage"
                      className="max-w-full rounded-lg border shadow-sm"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};