import React, { useState, useEffect } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { Layout } from '../../components/Layout';
import { AdminDashboard } from './components/AdminDashboard';
import { InspectionTable } from './components/InspectionTable';
import { InspectionDetails } from './components/InspectionDetails';
import { NewTimesheetsTable } from './components/NewTimesheetsTable';
import { FilterPanel } from './components/FilterPanel';
import { DailyComplianceChart } from './components/DailyComplianceChart';
import { TimesheetComplianceChart } from './components/TimesheetComplianceChart';
import { EmployeeSearchFilter } from './components/EmployeeSearchFilter';
import { ManagementHub } from './components/ManagementHub';
import { EmployeeManagement } from './components/EmployeeManagement';
import VehicleManagement from './components/VehicleManagement';
import { WorkRateManagement } from './components/WorkRateManagement';
import { IpsomRatesManagement } from './components/IpsomRatesManagement';
import { MollsworthRatesManagement } from './components/MollsworthRatesManagement';
import { MollsworthWorkRatesManagement } from './components/MollsworthWorkRatesManagement';
import { HavsTimesheetsTable } from './components/HavsTimesheetsTable';
import { HavsComplianceTable } from './components/HavsComplianceTable';
import { supabase, VehicleInspection, PlantRecord, Employee, Timesheet } from '../../lib/supabase';
import { LoadingSpinner } from '../../components/LoadingSpinner';

interface AdminAppProps {
  onBack: () => void;
}

export interface FilterState {
  defectsOnly: boolean;
  dateFrom: string;
  dateTo: string;
  vehicle: string;
  employee: string;
}

export const AdminApp: React.FC<AdminAppProps> = ({ onBack }) => {
  const navigate = useNavigate();
  const location = useLocation();
  
  const [inspections, setInspections] = useState<VehicleInspection[]>([]);
  const [timesheets, setTimesheets] = useState<Timesheet[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [filteredInspections, setFilteredInspections] = useState<VehicleInspection[]>([]);
  const [selectedInspection, setSelectedInspection] = useState<VehicleInspection | null>(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<FilterState>({
    defectsOnly: false,
    dateFrom: '',
    dateTo: '',
    vehicle: '',
    employee: '',
  });

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [inspections, filters, selectedEmployeeId]);

  const loadData = async () => {
    try {
      setLoading(true);
      
      // Load employees first with their assigned vehicles
      const { data: employeesData, error: employeesError } = await supabase
        .from('employees')
        .select(`
          *,
          assigned_vehicle:vehicles(*)
        `)
        .order('full_name');

      if (employeesError) throw employeesError;

      // Load inspections
      const { data: inspectionsData, error: inspectionsError } = await supabase
        .from('vehicle_inspections')
        .select(`
          *,
          vehicle:vehicles!vehicle_id(*),
          employee:employees!employee_id(*),
          inspection_items(*)
        `)
        .order('submitted_at', { ascending: false });

      if (inspectionsError) throw inspectionsError;

      setEmployees(employeesData || []);
      setInspections(inspectionsData || []);

      // Load timesheets for compliance tracking
      const { data: timesheetsData, error: timesheetsError } = await supabase
        .from('new_timesheets')
        .select(`
          *,
          employee:employees!employee_id(*)
        `)
        .order('submitted_at', { ascending: false });

      if (timesheetsError) throw timesheetsError;
      setTimesheets(timesheetsData || []);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...inspections];

    // Apply employee filter first
    if (selectedEmployeeId) {
      filtered = filtered.filter(inspection => inspection.employee_id === selectedEmployeeId);
    }

    if (filters.defectsOnly) {
      filtered = filtered.filter(inspection => inspection.has_defects);
    }

    if (filters.dateFrom) {
      filtered = filtered.filter(inspection => 
        new Date(inspection.submitted_at) >= new Date(filters.dateFrom)
      );
    }

    if (filters.dateTo) {
      filtered = filtered.filter(inspection => 
        new Date(inspection.submitted_at) <= new Date(filters.dateTo + 'T23:59:59')
      );
    }

    if (filters.vehicle) {
      filtered = filtered.filter(inspection => 
        inspection.vehicle?.registration_number.toLowerCase().includes(filters.vehicle.toLowerCase()) ||
        inspection.vehicle?.make.toLowerCase().includes(filters.vehicle.toLowerCase()) ||
        inspection.vehicle?.model.toLowerCase().includes(filters.vehicle.toLowerCase()) ||
        (inspection.override_vehicle_registration && 
         inspection.override_vehicle_registration.toLowerCase().includes(filters.vehicle.toLowerCase()))
      );
    }

    if (filters.employee) {
      filtered = filtered.filter(inspection => 
        inspection.employee?.name.toLowerCase().includes(filters.employee.toLowerCase())
      );
    }

    setFilteredInspections(filtered);
  };

  const handleViewInspection = (inspection: VehicleInspection) => {
    setSelectedInspection(inspection);
    navigate('/inspection-details');
  };

  const handleBackToList = () => {
    setSelectedInspection(null);
    navigate('/inspections');
  };

  const getPageTitle = () => {
    const path = location.pathname;
    if (path === '/inspection-details' && selectedInspection) {
      return 'Daily Vehicle Check Details';
    }
    switch (path) {
      case '/inspections':
        return 'Daily Vehicle Checks';
      case '/timesheets':
        return 'Professional Timesheets';
      case '/management':
        return 'Management Hub';
      case '/employees':
        return 'Employee Management';
      case '/vehicles':
        return 'Vehicle Management';
      case '/havs-timesheets':
        return 'HAVs Timesheets';
      default:
        return 'Employer Dashboard';
    }
  };

  const getPageSubtitle = () => {
    const path = location.pathname;
    if (path === '/inspection-details' && selectedInspection) {
      const vehicleInfo = selectedInspection.override_vehicle_registration 
        ? selectedInspection.override_vehicle_registration
        : `${selectedInspection.vehicle?.registration_number}`;
      return `${vehicleInfo} - ${new Date(selectedInspection.submitted_at).toLocaleDateString()}`;
    }
    switch (path) {
      case '/inspections':
        return 'Vehicle Inspection Management';
      case '/timesheets':
        return 'Professional Gang Timesheets';
      case '/management':
        return 'Staff & Fleet Overview';
      case '/employees':
        return 'Add, Edit & Remove Employees';
      case '/vehicles':
        return 'Fleet Vehicle Management';
      case '/ipsom-rates':
        return 'Ipsom Work Rates & Pricing';
      case '/mollsworth-rates':
        return 'Mollsworth Work Rates & Pricing';
      case '/mollsworth-rates':
        return 'Mollsworth Work Rates & Pricing';
      case '/havs-timesheets':
        return 'Hand Arm Vibration Syndrome Records';
      default:
        return 'Management Overview';
    }
  };

  const handleBackNavigation = () => {
    const path = location.pathname;
    if (path === '/inspection-details') {
      handleBackToList();
    } else if (path === '/') {
      onBack();
    } else {
      navigate('/');
    }
  };

  if (loading) {
    return (
      <Layout 
        title="Employer Dashboard" 
        subtitle="Loading..." 
        showBackButton 
        onBack={onBack}
      >
        <LoadingSpinner />
      </Layout>
    );
  }

  return (
    <Layout 
      title={getPageTitle()} 
      subtitle={getPageSubtitle()} 
      showBackButton 
      onBack={handleBackNavigation}
    >
      <Routes>
        <Route 
          path="/" 
          element={
            <div className="space-y-6">
             <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
               <DailyComplianceChart 
                 inspections={inspections}
                 employees={employees}
               />
               <TimesheetComplianceChart 
                 timesheets={timesheets}
                 employees={employees}
               />
             </div>
              <AdminDashboard 
                inspections={inspections}
                plantRecords={[]}
              />
            </div>
          } 
        />
        <Route 
          path="/inspections" 
          element={
            <div className="space-y-6">
              <InspectionTable 
                inspections={filteredInspections}
                onViewInspection={handleViewInspection}
                employees={employees}
                allInspections={inspections}
               onInspectionsUpdate={loadData}
              />
            </div>
          } 
        />
        <Route 
          path="/inspection-details" 
          element={
            selectedInspection ? (
              <InspectionDetails inspection={selectedInspection} />
            ) : (
              <div>Inspection not found</div>
            )
          } 
        />
        <Route 
          path="/timesheets" 
          element={<NewTimesheetsTable employees={employees} />} 
        />
        <Route 
          path="/management" 
          element={<ManagementHub />} 
        />
        <Route 
          path="/employees" 
          element={
            <EmployeeManagement 
              employees={employees}
              vehicles={[]}
              onEmployeesUpdate={loadData}
            />
          } 
        />
        <Route 
          path="/vehicles" 
          element={<VehicleManagement />} 
        />
        <Route 
          path="/work-rates" 
          element={<WorkRateManagement />} 
        />
        <Route 
          path="/ipsom-rates" 
          element={<IpsomRatesManagement />} 
        />
        <Route 
          path="/mollsworth-work-rates" 
          element={<MollsworthWorkRatesManagement />} 
        />
        <Route 
          path="/havs-timesheets" 
          element={
            <div className="space-y-6">
              <HavsComplianceTable employees={employees} />
              <HavsTimesheetsTable employees={employees} />
            </div>
          } 
        />
      </Routes>
    </Layout>
  );
};