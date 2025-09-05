import React, { useState, useEffect } from 'react';
import { Layout } from '../../components/Layout';
import { TabNavigation, TabType } from '../../components/TabNavigation';
import { InspectionForm } from './components/InspectionForm';
import { SuccessMessage } from './components/SuccessMessage';
import { NewTimesheetForm } from '../../pages/employee/NewTimesheetForm';
import { TimesheetList } from './components/TimesheetList';
import { TimesheetSuccessMessage } from './components/TimesheetSuccessMessage';
import { HavsTimesheetForm } from './components/HavsTimesheetForm';
import { supabase, Vehicle, ChecklistTemplate, Employee } from '../../lib/supabase';
import { LoadingSpinner } from '../../components/LoadingSpinner';

interface EmployeeAppProps {
  onBack: () => void;
  currentEmployee: Employee | null;
}

type CurrentView = 'landing' | 'inspection' | 'timesheet' | 'timesheet-form' | 'havs';

export const EmployeeApp: React.FC<EmployeeAppProps> = ({ onBack, currentEmployee }) => {
  const [currentView, setCurrentView] = useState<CurrentView>('landing');
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(currentEmployee);
  const [checklistTemplate, setChecklistTemplate] = useState<ChecklistTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Inspection state
  const [inspectionSuccess, setInspectionSuccess] = useState(false);
  const [lastInspection, setLastInspection] = useState<{ vehicle: string; hasDefects: boolean } | null>(null);
  
  // Timesheet state
  const [timesheetSuccess, setTimesheetSuccess] = useState(false);
  const [lastTimesheet, setLastTimesheet] = useState<{ jobNumber: string; totalValue: number } | null>(null);

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

  const handleTaskSelect = (task: 'inspection' | 'plant' | 'timesheet') => {
    // Reset success states when selecting a new task
    setInspectionSuccess(false);
    setTimesheetSuccess(false);
    
    // Navigate to the appropriate view
    setCurrentView(task);
  };

  const handleTabChange = (tab: TabType) => {
    if (tab === 'timesheet') {
      // For timesheet tab, show the list by default
      setCurrentView('timesheet');
    } else if (tab === 'havs') {
      setCurrentView('havs');
    } else {
      handleTaskSelect(tab);
    }
  };

  // Inspection handlers
  const handleInspectionSuccess = (vehicle: string, hasDefects: boolean) => {
    setLastInspection({ vehicle, hasDefects });
    setInspectionSuccess(true);
  };

  const handleNewInspection = () => {
    setInspectionSuccess(false);
    setLastInspection(null);
  };

  // Timesheet handlers
  const handleStartNewTimesheet = () => {
    setCurrentView('timesheet-form');
    setTimesheetSuccess(false);
  };

  const handleTimesheetSuccess = (jobNumber: string, totalValue: number) => {
    setLastTimesheet({ jobNumber, totalValue });
    setTimesheetSuccess(true);
  };

  const handleNewTimesheet = () => {
    setTimesheetSuccess(false);
    setLastTimesheet(null);
    setCurrentView('timesheet');
  };

  const handleJobAdded = (jobNumber: string, totalValue: number) => {
    setLastTimesheet({ jobNumber, totalValue });
    setCurrentView('timesheet'); // Go to timesheet list
    setTimesheetSuccess(false);
  };

  const getPageTitle = () => {
    if (selectedEmployee) {
      switch (currentView) {
        case 'landing':
          return `Home`;
        case 'inspection':
          return 'Daily Vehicle Check';
        case 'timesheet':
          return 'Your Timesheets';
        case 'timesheet-form':
          return 'New Timesheet';
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
          return 'Daily Vehicle Check Form';
        case 'timesheet':
          return 'Price Work & Day Rate Timesheets';
        case 'timesheet-form':
          return 'NSF Utilities Timesheet';
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
      onBack(); // Always sign out when going back from landing
    } else if (currentView === 'timesheet-form') {
      // Go back to timesheet list
      setCurrentView('timesheet');
    } else {
      setCurrentView('landing');
      // Reset success states when going back to landing
      setInspectionSuccess(false);
      setTimesheetSuccess(false);
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-3xl mx-auto">
              {/* Daily Vehicle Check */}
              <div
                className="bg-white rounded-xl shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden group cursor-pointer"
                onClick={() => handleTaskSelect('inspection')}
              >
                <div className="p-6">
                  <h3 className="text-lg font-semibold text-slate-900 mb-2">Daily Plant and Vehicle Check</h3>
                  <p className="text-slate-600 text-sm">Complete safety inspections and equipment checks with photo documentation</p>
                </div>
              </div>
              
              {/* Timesheets */}
              <div
                className="bg-white rounded-xl shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden group cursor-pointer"
                onClick={() => handleTaskSelect('timesheet')}
              >
                <div className="p-6">
                  <h3 className="text-lg font-semibold text-slate-900 mb-2">Price Work Timesheets</h3>
                  <p className="text-slate-600 text-sm">Submit price work and day rate timesheets</p>
                </div>
              </div>
              
              {/* HAVs Timesheet */}
              <div
                className="bg-white rounded-xl shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden group cursor-pointer"
                onClick={() => handleTaskSelect('havs')}
              >
                <div className="p-6">
                  <h3 className="text-lg font-semibold text-slate-900 mb-2">HAVs Timesheet</h3>
                  <p className="text-slate-600 text-sm">Record exposure time for vibrating equipment</p>
                </div>
              </div>
            </div>
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
      
      case 'timesheet':
        if (timesheetSuccess && lastTimesheet) {
          return (
            <TimesheetSuccessMessage
              jobNumber={lastTimesheet.jobNumber}
              totalValue={lastTimesheet.totalValue}
              onNewTimesheet={handleNewTimesheet}
            />
          );
        }
        return (
          <TimesheetList
            selectedEmployee={selectedEmployee}
            onStartNewTimesheet={handleStartNewTimesheet}
          />
        );

      case 'havs':
        return (
          <HavsTimesheetForm
            selectedEmployee={selectedEmployee}
            onBack={() => setCurrentView('landing')}
          />
        );

      case 'timesheet-form':
        return (
          <NewTimesheetForm
            selectedEmployee={selectedEmployee}
            onJobAdded={handleJobAdded}
            onBack={() => setCurrentView('timesheet')}
          />
        );
      
      default:
        return (
          <div className="max-w-4xl mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-3xl mx-auto">
              <div
                className="bg-white rounded-xl shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden group cursor-pointer"
                onClick={() => handleTaskSelect('inspection')}
              >
                <div className="p-6">
                  <h3 className="text-lg font-semibold text-slate-900 mb-2">Daily Plant and Vehicle Check</h3>
                  <p className="text-slate-600 text-sm">Complete safety inspections and equipment checks</p>
                </div>
              </div>
              
              <div
                className="bg-white rounded-xl shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden group cursor-pointer"
                onClick={() => handleTaskSelect('timesheet')}
              >
                <div className="p-6">
                  <h3 className="text-lg font-semibold text-slate-900 mb-2">Price Work Timesheets</h3>
                  <p className="text-slate-600 text-sm">Submit price work and day rate timesheets</p>
                </div>
              </div>
              
              <div
                className="bg-white rounded-xl shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden group cursor-pointer"
                onClick={() => handleTaskSelect('havs')}
              >
                <div className="p-6">
                  <h3 className="text-lg font-semibold text-slate-900 mb-2">HAVs Timesheet</h3>
                  <p className="text-slate-600 text-sm">Record exposure time for vibrating equipment</p>
                </div>
              </div>
            </div>
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
      
      {currentView !== 'landing' && currentView !== 'timesheet-form' && currentView !== 'havs' && selectedEmployee && (
        <TabNavigation 
          activeTab={currentView === 'timesheet' ? 'timesheet' : currentView === 'havs' ? 'havs' : currentView as TabType} 
          onTabChange={handleTabChange} 
        />
      )}
    </div>
  );
};