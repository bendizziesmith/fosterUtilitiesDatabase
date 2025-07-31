import React, { useState } from 'react';
import { BrowserRouter as Router } from 'react-router-dom';
import { LoginForm } from './components/LoginForm';
import { EmployeeApp } from './apps/employee/EmployeeApp';
import { AdminApp } from './apps/admin/AdminApp';
import { getCurrentUser, signOut } from './lib/auth';
import { Employee } from './lib/supabase';

type AppMode = 'login' | 'employee' | 'admin';

function App() {
  const [currentApp, setCurrentApp] = useState<AppMode>('login');
  const [currentEmployee, setCurrentEmployee] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);

  React.useEffect(() => {
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    try {
      const { user, profile } = await getCurrentUser();
      
      if (user && profile) {
        if (profile.role === 'admin') {
          setCurrentApp('admin');
        } else {
          setCurrentApp('employee');
          setCurrentEmployee(profile.employee);
        }
      } else {
        setCurrentApp('login');
      }
    } catch (error) {
      console.error('Error checking auth status:', error);
      setCurrentApp('login');
    } finally {
      setLoading(false);
    }
  };

  const handleLoginSuccess = (userRole: 'employee' | 'admin', employeeData?: Employee) => {
    if (userRole === 'admin') {
      setCurrentApp('admin');
    } else {
      setCurrentApp('employee');
      setCurrentEmployee(employeeData || null);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      setCurrentApp('login');
      setCurrentEmployee(null);
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (currentApp === 'login') {
    return <LoginForm onLoginSuccess={handleLoginSuccess} />;
  }

  if (currentApp === 'employee') {
    return <EmployeeApp onBack={handleSignOut} currentEmployee={currentEmployee} />;
  }

  if (currentApp === 'admin') {
    return (
      <Router>
        <AdminApp onBack={handleSignOut} />
      </Router>
    );
  }

  return null;
}

export default App;