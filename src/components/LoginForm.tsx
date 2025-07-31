import React, { useState } from 'react';
import { Eye, EyeOff, LogIn, Car } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface LoginFormProps {
  onLoginSuccess: (userRole: 'employee' | 'admin', employeeData?: any) => void;
}

export const LoginForm: React.FC<LoginFormProps> = ({ onLoginSuccess }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // Check if this is the admin account and create it if it doesn't exist
      if (email.trim().toLowerCase() === 'nsfutilities@btinternet.com') {
        // First try to sign in
        let { data: authData, error: authError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password: password,
        });

        // If login fails due to invalid credentials, create the admin account
        if (authError && authError.message === 'Invalid login credentials') {
          const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
            email: email.trim(),
            password: password,
            options: {
              emailRedirectTo: undefined // Disable email confirmation
            }
          });

          if (signUpError) throw new Error(`Failed to create admin account: ${signUpError.message}`);

          if (!signUpData.user) {
            throw new Error('Account creation failed - no user data received');
          }

          // Update authData and clear authError after successful sign up
          authData = signUpData;
          authError = null;

          // Create admin profile
          const { error: createAdminError } = await supabase
            .from('user_profiles')
            .insert({
              id: authData.user.id,
              employee_id: null,
              role: 'admin'
            });

          if (createAdminError) {
            console.error('Error creating admin profile:', createAdminError);
          }

          // Update user metadata to include admin role claim
          try {
            const { error: updateError } = await supabase.auth.updateUser({
              data: { 
                role: 'admin',
                is_admin: true,
                email: email.trim()
              }
            });
            
            if (updateError) {
              console.error('Error updating user metadata:', updateError);
            }
          } catch (metadataError) {
            console.error('Error setting admin metadata:', metadataError);
          }
        }

        // If there was a different auth error, throw it
        if (authError) throw authError;

        // If sign in was successful, check/create admin profile
        if (authData && authData.user) {
          // Check if admin profile exists, create if not
          const { data: adminProfile, error: adminProfileError } = await supabase
            .from('user_profiles')
            .select('*')
            .eq('id', authData.user.id)
            .single();

          if (adminProfileError && adminProfileError.code === 'PGRST116') {
            // Profile doesn't exist, create it
            const { error: createAdminError } = await supabase
              .from('user_profiles')
              .insert({
                id: authData.user.id,
                employee_id: null,
                role: 'admin'
              });

            if (createAdminError) {
              console.error('Error creating admin profile:', createAdminError);
            }
          }

          // Ensure admin metadata is set
          try {
            const { error: updateError } = await supabase.auth.updateUser({
              data: { 
                role: 'admin',
                is_admin: true,
                email: email.trim()
              }
            });
            
            if (updateError) {
              console.error('Error updating user metadata:', updateError);
            }
          } catch (metadataError) {
            console.error('Error setting admin metadata:', metadataError);
          }
          onLoginSuccess('admin');
          return;
        }
      }

      // Sign in with Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password,
      });

      if (authError) throw authError;

      if (!authData.user) {
        throw new Error('Login failed - no user data received');
      }

      // Get user profile to determine role
      const { data: profile, error: profileError } = await supabase
        .from('user_profiles')
        .select(`
          *,
          employee:employees(*)
        `)
        .eq('id', authData.user.id)
        .single();

      if (profileError) {
        // If no profile found, try to find employee by user_id
        const { data: employee, error: employeeError } = await supabase
          .from('employees')
          .select('*')
          .eq('user_id', authData.user.id)
          .single();

        if (employeeError || !employee) {
          throw new Error('User profile not found. Please contact your administrator.');
        }

        // Create missing profile
        const { error: createProfileError } = await supabase
          .from('user_profiles')
          .insert({
            id: authData.user.id,
            employee_id: employee.id,
            role: 'employee'
          });

        if (createProfileError) {
          console.error('Error creating profile:', createProfileError);
        }

        // Login as employee
        onLoginSuccess('employee', employee);
        return;
      }

      // Handle case where profile exists but no employee data
      if (!profile.employee && profile.role === 'employee') {
        throw new Error('Employee data not found. Please contact your administrator.');
      }

      // Login successful with existing profile
      if (profile.role === 'admin') {
        onLoginSuccess('admin');
      } else {
        onLoginSuccess('employee', profile.employee);
      }

    } catch (error: any) {
      console.error('Login error:', error);
      setError(error.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="mx-auto w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mb-6">
            <Car className="h-10 w-10 text-blue-600" />
          </div>
          <h1 className="text-3xl font-bold text-slate-900 mb-2">
            Vehicle Inspection System
          </h1>
          <p className="text-slate-600">
            Sign in to access your dashboard
          </p>
        </div>

        {/* Login Form */}
        <div className="bg-white rounded-2xl shadow-lg p-8">
          <form onSubmit={handleLogin} className="space-y-6">
            {/* Email Field */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                placeholder="Enter your email"
                required
                disabled={loading}
              />
            </div>

            {/* Password Field */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 pr-12 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                  placeholder="Enter your password"
                  required
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                  disabled={loading}
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5" />
                  ) : (
                    <Eye className="h-5 w-5" />
                  )}
                </button>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-red-800 text-sm">{error}</p>
              </div>
            )}

            {/* Login Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center space-x-2"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  <span>Signing in...</span>
                </>
              ) : (
                <>
                  <LogIn className="h-5 w-5" />
                  <span>Sign In</span>
                </>
              )}
            </button>
          </form>

          {/* Footer */}
          <div className="mt-6 pt-6 border-t border-slate-200">
            <p className="text-center text-sm text-slate-600">
              Need access? Contact your system administrator
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};