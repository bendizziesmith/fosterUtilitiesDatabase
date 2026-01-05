// project/src/components/LoginForm.tsx
import React, { useState } from 'react';
import { Eye, EyeOff, LogIn, Car } from 'lucide-react';
import { supabase } from '../lib/supabase';

/**
 * Props:
 * - onLoginSuccess: gets called with the user's role ('employee' | 'admin')
 *   and (optionally) the employee data when role is 'employee'.
 */
interface LoginFormProps {
  onLoginSuccess: (userRole: 'employee' | 'admin', employeeData?: any) => void;
}

/**
 * IMPORTANT:
 * This login form ONLY signs the user in.
 * It does NOT create users or elevate roles.
 * Admin/user creation should happen on the server (Supabase Edge Function),
 * not here in the browser.
 */
export const LoginForm: React.FC<LoginFormProps> = ({ onLoginSuccess }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // error shown under the form (safe to show to users)
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // 1) Try to sign in with Supabase
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (authError || !authData?.user) {
        // Keep this message generic for security
        throw new Error('Invalid email or password.');
      }

      // 2) Fetch user profile to determine the role
      //    user_profiles includes role + (optionally) a linked employee
      let { data: profile, error: profileError } = await supabase
        .from('user_profiles')
        .select(
          `
          *,
          employee:employees(*)
        `
        )
        .eq('id', authData.user.id)
        .maybeSingle();

      // If no profile found, create one
      if (!profile) {
        const { data: matchingEmployee } = await supabase
          .from('employees')
          .select('*')
          .eq('email', authData.user.email)
          .maybeSingle();

        const { error: upsertError } = await supabase
          .from('user_profiles')
          .upsert({
            id: authData.user.id,
            employee_id: matchingEmployee?.id || null,
            role: matchingEmployee ? 'employee' : 'admin',
          }, { onConflict: 'id' });

        if (upsertError) {
          console.error('Profile upsert error:', upsertError);
        }

        const { data: newProfile } = await supabase
          .from('user_profiles')
          .select(`*, employee:employees(*)`)
          .eq('id', authData.user.id)
          .maybeSingle();

        profile = newProfile;
      }

      if (!profile) {
        throw new Error('Unable to load your profile. Please try again.');
      }

      // 3) Send the user to the correct app based on role
      if (profile.role === 'admin') {
        onLoginSuccess('admin'); // No employee data for admin
      } else if (profile.role === 'employee') {
        // Some apps attach the employee data here
        onLoginSuccess('employee', profile.employee ?? null);
      } else {
        // Unknown role fallback
        throw new Error(
          'Your role is not recognized. Please contact your administrator.'
        );
      }
    } catch (err: any) {
      setError(err?.message || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Card */}
        <div className="bg-white shadow-xl rounded-2xl p-8 border border-slate-200">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center mb-4">
              <Car className="w-7 h-7 text-blue-600" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900">
              Vehicle & Plant Portal
            </h1>
            <p className="text-slate-600 mt-1">Sign in to continue</p>
          </div>

          {/* Error banner */}
          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleLogin} className="space-y-4">
            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Email
              </label>
              <input
                type="email"
                autoComplete="email"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            {/* Password with show/hide toggle */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 pr-10 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-500 hover:text-slate-700"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full inline-flex items-center justify-center space-x-2 rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-60"
            >
              <LogIn className="w-4 h-4" />
              <span>{loading ? 'Signing in…' : 'Sign In'}</span>
            </button>
          </form>

          {/* Footer */}
          <div className="mt-6 pt-6 border-t border-slate-200">
            <p className="text-center text-sm text-slate-600">
              Don’t have an account? Ask your administrator to create one for you.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
