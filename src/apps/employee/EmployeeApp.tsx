import React, { useState, useEffect } from 'react';
import { Layout } from '../../components/Layout';
import { TabNavigation, TabType } from '../../components/TabNavigation';
import { InspectionForm } from './components/InspectionForm';
import { SuccessMessage } from './components/SuccessMessage';
import { HavsTimesheetForm } from './components/HavsTimesheetForm';
import { supabase, Vehicle, ChecklistTemplate, Employee } from '../../lib/supabase';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { EmployeeLanding } from './components/EmployeeLanding';

interface EmployeeAppProps {
  onBack: () => void;
  currentEmployee: Employee | null;
}

type CurrentView = 'landing' | 'inspection' | 'havs';

export const EmployeeApp: React.FC<EmployeeAppProps> = ({ onBack, currentEmployee }) => {
  const [currentView, setCurrentView] = useState<CurrentView>('landing');
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(currentEmployee);
  const [checklistTemplate, setChecklistTemplate] = useState<ChecklistTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [inspectionSuccess, setInspectionSuccess] = useState(false);
  const [lastInspection, setLastInspection] = useState<{ vehicle: string; hasDefects: boolean } | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Load vehicles
      const { data: vehiclesData, error: vehiclesError } = await supabase
        .from('vehicles')
        .select('*')
        .order('registration_number');

      if (vehiclesError) {
        console.error('Error loading vehicles:', vehiclesError);
        throw new Error(`Failed to load vehicles: ${vehiclesError.message}`);
      }

      // Load employees with their assigned vehicles
      const { data: employeesData, error: employeesError } = await supabase
        .from('employees')
        .select(`
          *,
          assigned_vehicle:vehicles!assigned_vehicle_id(*)
        `)
        .order('full_name');

      if (employeesError) {
        console.error('Error loading employees:', employeesError);
        throw new Error(`Failed to load employees: ${employeesError.message}`);
      }

      // Update current employee with assigned vehicle data if available
      if (currentEmployee && employeesData) {
        const updatedEmployee = employeesData.find(emp => emp.id === currentEmployee.id);
        if (updatedEmployee) {
          console.log('Updated employee with vehicle data:', updatedEmployee);
          console.log('Assigned vehicle:', updatedEmployee.assigned_vehicle);
          setSelectedEmployee(updatedEmployee);
        }
      }

      // Load checklist template (optional - may not exist)
      const { data: templateData, error: templateError } = await supabase
        .from('checklist_templates')
        .select('*')
        .limit(1);

      // Don't throw error if no template exists, just log it
      if (templateError) {
        console.warn('Error loading checklist template:', templateError);
      }

      setVehicles(vehiclesData || []);
      setEmployees(employeesData || []);
      // Set template to first item if exists, otherwise null
      setChecklistTemplate(templateData && templateData.length > 0 ? templateData[0] : null);
    } catch (error) {
      console.error('Error loading data:', error);
      setError(error instanceof Error ? error.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleTaskSelect = (task: 'inspection' | 'havs') => {
    setInspectionSuccess(false);
    setCurrentView(task);
  };

  const handleTabChange = (tab: TabType) => {
    if (tab === 'havs') {
      setCurrentView('havs');
    } else if (tab === 'inspection') {
      handleTaskSelect('inspection');
    }
  };

  const handleInspectionSuccess = (vehicle: string, hasDefects: boolean) => {
    setLastInspection({ vehicle, hasDefects });
    setInspectionSuccess(true);
  };

  const handleNewInspection = () => {
    setInspectionSuccess(false);
    setLastInspection(null);
  };

  const getPageTitle = () => {
    if (selectedEmployee) {
      switch (currentView) {
        case 'landing':
          return `Home`;
        case 'inspection':
          return 'Daily Vehicle & Plant Check';
        case 'havs':
          return 'HAVs Timesheet';
        default:
          return `Home`;
      }
    }
    return 'Home';
  };

  const getPageSubtitle = () => {
    if (selectedEmployee) {
      switch (currentView) {
        case 'landing':
          return selectedEmployee.role + (selectedEmployee.assigned_vehicle ? ` • Assigned: ${selectedEmployee.assigned_vehicle.registration_number}` : '');
        case 'inspection':
          return 'Daily Vehicle & Plant Check Form';
        case 'havs':
          return 'Hand Arm Vibration Syndrome Exposure Record';
        default:
          return selectedEmployee.role;
      }
    }
    return 'Field Worker Dashboard';
  };

  const handleBackNavigation = () => {
    if (currentView === 'landing') {
      onBack();
    } else {
      setCurrentView('landing');
      setInspectionSuccess(false);
    }
  };

  const renderCurrentView = () => {
    if (loading) {
      return <LoadingSpinner />;
    }

    if (error) {
      return (
        <div className="max-w-2xl mx-auto">
          <div className="bg-red-50 border border-red-200 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-red-800 mb-2">Error Loading Data</h2>
            <p className="text-red-700 mb-4">{error}</p>
            <button
              onClick={loadData}
              className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors"
            >
              Try Again
            </button>
          </div>
        </div>
      );
    }

    if (!selectedEmployee) {
      return (
        <div className="max-w-2xl mx-auto">
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-yellow-800 mb-2">Employee Data Not Available</h2>
            <p className="text-yellow-700 mb-4">Unable to load employee information. Please sign out and sign back in.</p>
            <button
              onClick={onBack}
              className="bg-yellow-600 text-white px-4 py-2 rounded-lg hover:bg-yellow-700 transition-colors"
            >
              Sign Out
            </button>
          </div>
        </div>
      );
    }

    switch (currentView) {
      case 'landing':
        return (
          <div className="max-w-4xl mx-auto">
            <EmployeeLanding
              onTaskSelect={handleTaskSelect}
              selectedEmployee={selectedEmployee}
            />
          </div>
        );

      case 'inspection':
        if (inspectionSuccess && lastInspection) {
          return (
            <SuccessMessage
              vehicle={lastInspection.vehicle}
              hasDefects={lastInspection.hasDefects}
              onBackToHome={handleBackNavigation}
            />
          );
        }
        return (
          <div className="max-w-2xl mx-auto">
            <InspectionForm
              vehicles={vehicles}
              checklistTemplate={checklistTemplate}
              selectedEmployee={selectedEmployee}
              onSubmissionSuccess={handleInspectionSuccess}
            />
          </div>
        );

      case 'havs':
        return (
          <HavsTimesheetForm
            selectedEmployee={selectedEmployee}
            onBack={() => setCurrentView('landing')}
          />
        );

      default:
        return (
          <div className="max-w-4xl mx-auto">
            <EmployeeLanding
              onTaskSelect={handleTaskSelect}
              selectedEmployee={selectedEmployee}
            />
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex flex-col">
      <Layout 
        title={getPageTitle()} 
        subtitle={getPageSubtitle()} 
        showBackButton 
        onBack={handleBackNavigation}
      >
        {renderCurrentView()}
      </Layout>
      
      {currentView !== 'landing' && currentView !== 'havs' && selectedEmployee && (
        <TabNavigation
          activeTab={currentView as TabType}
          onTabChange={handleTabChange}
        />
      )}
    </div>
  );
};