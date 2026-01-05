import React, { useState, useEffect } from 'react';
import { X, User, HardHat, Clock, FileText, AlertCircle, Download, History } from 'lucide-react';
import { supabase } from '../../../lib/supabase';

interface HavsWeekDetailProps {
  weekId: string;
  onClose: () => void;
}

interface WeekDetail {
  id: string;
  week_ending: string;
  status: string;
  submitted_at: string | null;
  last_saved_at: string | null;
  revision_number: number;
  created_at: string;
  ganger: {
    id: string;
    full_name: string;
    role: string;
  };
  members: MemberDetail[];
  revisions: RevisionInfo[];
}

interface MemberDetail {
  member_id: string;
  person_type: string;
  employee_id: string | null;
  display_name: string;
  role: string;
  is_manual: boolean;
  total_minutes: number;
  comments: string | null;
  actions: string | null;
  exposure_entries: ExposureEntry[];
}

interface ExposureEntry {
  equipment_name: string;
  equipment_category: string;
  day_of_week: string;
  minutes: number;
}

interface RevisionInfo {
  revision_number: number;
  created_at: string;
  notes: string | null;
}

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DAY_LABELS: Record<string, string> = {
  monday: 'Mon',
  tuesday: 'Tue',
  wednesday: 'Wed',
  thursday: 'Thu',
  friday: 'Fri',
  saturday: 'Sat',
  sunday: 'Sun',
};

export const HavsWeekDetail: React.FC<HavsWeekDetailProps> = ({ weekId, onClose }) => {
  const [detail, setDetail] = useState<WeekDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showRevisions, setShowRevisions] = useState(false);

  useEffect(() => {
    loadWeekDetail();
  }, [weekId]);

  const loadWeekDetail = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data, error: rpcError } = await supabase.rpc('get_havs_week_details', {
        week_id_param: weekId,
      });

      if (rpcError) throw rpcError;
      setDetail(data);
    } catch (err) {
      console.error('Error loading week detail:', err);
      setError('Failed to load HAVS week details');
    } finally {
      setLoading(false);
    }
  };

  const handleExportCSV = async () => {
    try {
      const { data, error } = await supabase.rpc('get_havs_csv_export', {
        week_id_param: weekId,
      });

      if (error) throw error;

      if (!data || data.length === 0) {
        alert('No data to export');
        return;
      }

      const headers = [
        'Week Ending',
        'Ganger',
        'Member Name',
        'Member Type',
        'Source',
        'Role',
        'Equipment',
        'Category',
        'Day',
        'Minutes',
        'Total Member Minutes',
        'Status',
        'Submitted At',
      ];

      const csvRows = [
        headers.join(','),
        ...data.map((row: any) =>
          [
            row.week_ending,
            `"${row.ganger_name}"`,
            `"${row.member_name}"`,
            row.member_type,
            row.member_source,
            `"${row.role}"`,
            `"${row.equipment_name || ''}"`,
            row.equipment_category || '',
            row.day_of_week || '',
            row.minutes || 0,
            row.total_member_minutes || 0,
            row.status,
            row.submitted_at || '',
          ].join(',')
        ),
      ];

      const csvContent = csvRows.join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `HAVS_Week_${detail?.week_ending}_${detail?.ganger.full_name.replace(/\s+/g, '_')}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export error:', err);
      alert('Failed to export CSV');
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-lg p-8">
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 border-3 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
            <p className="text-slate-700">Loading HAVS details...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-lg p-6 max-w-md">
          <div className="flex items-center gap-3 mb-4">
            <AlertCircle className="h-6 w-6 text-red-600" />
            <h3 className="text-lg font-semibold">Error</h3>
          </div>
          <p className="text-slate-600 mb-4">{error || 'Failed to load details'}</p>
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  const totalGangMinutes = detail.members.reduce((sum, m) => sum + m.total_minutes, 0);
  const totalGangHours = Math.floor(totalGangMinutes / 60);
  const totalGangRemainingMinutes = totalGangMinutes % 60;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full my-8">
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between rounded-t-lg z-10">
          <div>
            <h2 className="text-xl font-bold text-slate-900">HAVS Week Details</h2>
            <p className="text-sm text-slate-600 mt-1">
              Week Ending: {new Date(detail.week_ending).toLocaleDateString('en-GB')}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-md transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="bg-slate-50 rounded-lg p-4 grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Ganger</p>
              <p className="font-semibold text-slate-900">{detail.ganger.full_name}</p>
              <p className="text-sm text-slate-600">{detail.ganger.role}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Status</p>
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium ${
                  detail.status === 'submitted'
                    ? 'bg-green-100 text-green-800'
                    : 'bg-amber-100 text-amber-800'
                }`}
              >
                {detail.status}
              </span>
            </div>
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Gang Members</p>
              <p className="font-semibold text-slate-900">{detail.members.length}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Total Exposure</p>
              <p className="font-semibold text-slate-900">
                {totalGangHours}h {totalGangRemainingMinutes}m
              </p>
            </div>
            {detail.submitted_at && (
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Submitted</p>
                <p className="text-sm text-slate-700">
                  {new Date(detail.submitted_at).toLocaleDateString('en-GB')} at{' '}
                  {new Date(detail.submitted_at).toLocaleTimeString('en-GB')}
                </p>
              </div>
            )}
            {detail.revision_number > 0 && (
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Revisions</p>
                <button
                  onClick={() => setShowRevisions(!showRevisions)}
                  className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
                >
                  <History className="h-4 w-4" />
                  {detail.revision_number} revision{detail.revision_number !== 1 ? 's' : ''}
                </button>
              </div>
            )}
          </div>

          {showRevisions && detail.revisions.length > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                <History className="h-4 w-4" />
                Revision History
              </h3>
              <div className="space-y-2">
                {detail.revisions.map((rev) => (
                  <div key={rev.revision_number} className="bg-white rounded p-3 text-sm">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium">Revision #{rev.revision_number}</span>
                      <span className="text-slate-600">
                        {new Date(rev.created_at).toLocaleDateString('en-GB')} at{' '}
                        {new Date(rev.created_at).toLocaleTimeString('en-GB')}
                      </span>
                    </div>
                    {rev.notes && <p className="text-slate-600">{rev.notes}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={handleExportCSV}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md flex items-center gap-2 transition-colors"
            >
              <Download className="h-4 w-4" />
              Export CSV
            </button>
          </div>

          <div className="space-y-6">
            {detail.members.map((member, memberIndex) => {
              const memberHours = Math.floor(member.total_minutes / 60);
              const memberRemainMinutes = member.total_minutes % 60;

              const equipmentGroups: Record<string, ExposureEntry[]> = {};
              member.exposure_entries?.forEach((entry) => {
                if (!equipmentGroups[entry.equipment_name]) {
                  equipmentGroups[entry.equipment_name] = [];
                }
                equipmentGroups[entry.equipment_name].push(entry);
              });

              return (
                <div key={member.member_id} className="border border-slate-200 rounded-lg overflow-hidden">
                  <div className="bg-slate-100 px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-white rounded">
                        {member.person_type === 'ganger' ? (
                          <HardHat className="h-5 w-5 text-amber-600" />
                        ) : (
                          <User className="h-5 w-5 text-blue-600" />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-slate-900">{member.display_name}</p>
                          <span
                            className={`text-xs px-2 py-0.5 rounded ${
                              member.person_type === 'ganger'
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-blue-100 text-blue-700'
                            }`}
                          >
                            {member.person_type}
                          </span>
                          {member.is_manual && (
                            <span className="text-xs px-2 py-0.5 rounded bg-emerald-100 text-emerald-700">
                              Manual Entry
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-slate-600">{member.role}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-slate-500 uppercase tracking-wide">Total Exposure</p>
                      <p className="text-lg font-bold text-slate-900">
                        {memberHours}h {memberRemainMinutes}m
                      </p>
                    </div>
                  </div>

                  <div className="p-4">
                    {Object.keys(equipmentGroups).length > 0 ? (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-slate-200">
                              <th className="text-left py-2 px-2 font-semibold text-slate-700">Equipment</th>
                              {DAYS.map((day) => (
                                <th key={day} className="text-center py-2 px-2 font-semibold text-slate-700">
                                  {DAY_LABELS[day]}
                                </th>
                              ))}
                              <th className="text-center py-2 px-2 font-semibold text-slate-700">Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {Object.entries(equipmentGroups).map(([equipmentName, entries]) => {
                              const dayMap: Record<string, number> = {};
                              entries.forEach((entry) => {
                                dayMap[entry.day_of_week] = entry.minutes;
                              });
                              const rowTotal = Object.values(dayMap).reduce((sum, m) => sum + m, 0);

                              return (
                                <tr key={equipmentName} className="border-b border-slate-100 hover:bg-slate-50">
                                  <td className="py-2 px-2 text-slate-900">{equipmentName}</td>
                                  {DAYS.map((day) => (
                                    <td key={day} className="text-center py-2 px-2 text-slate-700">
                                      {dayMap[day] || '-'}
                                    </td>
                                  ))}
                                  <td className="text-center py-2 px-2 font-semibold text-slate-900">
                                    {rowTotal}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="text-slate-500 text-center py-4">No exposure data recorded</p>
                    )}

                    {(member.comments || member.actions) && (
                      <div className="mt-4 pt-4 border-t border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-4">
                        {member.comments && (
                          <div>
                            <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1">
                              Comments
                            </p>
                            <p className="text-sm text-slate-600">{member.comments}</p>
                          </div>
                        )}
                        {member.actions && (
                          <div>
                            <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1">
                              Actions
                            </p>
                            <p className="text-sm text-slate-600">{member.actions}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="sticky bottom-0 bg-slate-50 border-t border-slate-200 px-6 py-4 flex justify-end rounded-b-lg">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-medium rounded-md transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
