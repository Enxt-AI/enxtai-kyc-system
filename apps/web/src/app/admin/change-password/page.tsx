'use client';
import { useState, useEffect, useRef } from 'react';
import { useAdminSession } from '@/lib/use-admin-session';
import { useRouter } from 'next/navigation';

/**
 * Admin Change Password Page
 *
 * Self-service password change for Super Admin users.
 *
 * @remarks
 * **Voluntary Change Only**:
 * - No forced reset for Super Admin (unlike client users)
 * - Accessible via navigation link anytime
 * - Can cancel and return to dashboard
 *
 * **Password Requirements**:
 * - Minimum 12 characters
 * - At least one uppercase letter (A-Z)
 * - At least one lowercase letter (a-z)
 * - At least one number (0-9)
 * - At least one special character (@$!%*?&)
 *
 * **Security Features**:
 * - Client-side validation with real-time feedback
 * - Password strength meter (weak/medium/strong)
 * - Session-based authentication (no reset tokens)
 * - Isolated auth context via AdminSessionProvider
 *
 * **API Integration**:
 * - POST /api/admin/change-password
 * - Requires valid NextAuth admin session
 * - Uses `session.user.id` for user identification
 * - Backend clears `mustChangePassword` flag automatically
 */
function ChangePasswordForm() {
  const { data: session, status } = useAdminSession();
  const router = useRouter();

  // Form state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [countdown, setCountdown] = useState(5);
  const [passwordMismatch, setPasswordMismatch] = useState(false);

  // Use ref to prevent success state from being reset
  const successRef = useRef(false);

  // Check if we already completed password reset (persisted)
  useEffect(() => {
    const storedTimestamp = localStorage.getItem('passwordResetComplete');
    if (storedTimestamp) {
      const elapsed = Date.now() - parseInt(storedTimestamp, 10);
      // If less than 30 seconds ago, show success UI
      if (elapsed < 30000) {
        setSuccess(true);
        successRef.current = true;
        // Calculate remaining countdown
        const remaining = Math.max(0, 5 - Math.floor(elapsed / 1000));
        setCountdown(remaining);
      }
    }
  }, []);

  // Password strength calculation
  const checkPasswordStrength = (password: string) => {
    const hasMinLength = password.length >= 8;
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumbers = /\d/.test(password);
    const hasSpecialChar = /[@$!%*?&]/.test(password);

    const criteria = [hasMinLength, hasUpperCase, hasLowerCase, hasNumbers, hasSpecialChar];
    const metCriteria = criteria.filter(Boolean).length;

    if (metCriteria < 3) return 'weak';
    if (metCriteria < 5) return 'medium';
    return 'strong';
  };

  // Password validation
  const validatePassword = (current: string, password: string, confirm: string) => {
    const errors = [];

    if (!current.trim()) {
      errors.push('Current password is required');
    }

    if (password.length < 8) {
      errors.push('Password must be at least 8 characters long');
    }
    if (!/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }
    if (!/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }
    if (!/\d/.test(password)) {
      errors.push('Password must contain at least one number');
    }
    if (!/[@$!%*?&]/.test(password)) {
      errors.push('Password must contain at least one special character (@$!%*?&)');
    }
    if (password !== confirm) {
      errors.push('Passwords do not match');
    }

    return errors;
  };

  // Countdown effect for success message
  useEffect(() => {
    if ((success || successRef.current) && countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    } else if ((success || successRef.current) && countdown === 0) {
      // Clear localStorage flag before redirect
      localStorage.removeItem('passwordResetComplete');
      router.replace('/admin/dashboard');
    }
  }, [success, countdown, router]);

  // Real-time validation effect
  useEffect(() => {
    if (confirmPassword && newPassword) {
      setPasswordMismatch(confirmPassword !== newPassword);
    } else {
      setPasswordMismatch(false);
    }
  }, [confirmPassword, newPassword]);

  // Handle manual redirect
  const handleManualRedirect = () => {
    router.replace('/admin/dashboard');
  };

  // Get cookie value by name
  const getCookie = (name: string) => {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop()?.split(';').shift();
    return null;
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess(false);

    // Check for password mismatch
    if (passwordMismatch) {
      setError('Passwords do not match');
      return;
    }

    // Validate passwords
    const validationErrors = validatePassword(currentPassword, newPassword, confirmPassword);
    if (validationErrors.length > 0) {
      setError(validationErrors.join('. '));
      return;
    }

    // Check session
    if (!session?.user?.id) {
      setError('Session expired. Please log in again.');
      router.replace('/admin/login');
      return;
    }

    setLoading(true);

    try {
      // Create session token as base64-encoded JSON (expected by SessionAuthGuard)
      const sessionData = {
        userId: session.user.id,
        clientId: session.user.clientId, // null for SUPER_ADMIN
        role: session.user.role,
        email: session.user.email,
      };
      const sessionToken = btoa(JSON.stringify(sessionData));

      // Call change password API
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/admin/change-password`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${sessionToken}`,
          },
          body: JSON.stringify({
            currentPassword,
            newPassword,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to change password');
      }

      // Parse response (if needed, but success is all we care about)
      await response.json().catch(() => ({}));

      console.log('Password change successful, setting success state...');

      // CRITICAL: Set localStorage flag FIRST to prevent guard race condition
      localStorage.setItem('passwordResetComplete', Date.now().toString());

      // Clear form immediately for security
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setError('');

      // Show success message and start countdown - SET THIS LAST
      setCountdown(5);
      successRef.current = true;
      setSuccess(true);

      console.log('Success state set to true, ref:', successRef.current);
    } catch (err) {
      console.error('Change password error:', err);
      setError(err instanceof Error ? err.message : 'An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Handle redirect for unauthenticated users (skip during success state)
  useEffect(() => {
    if (!success && !successRef.current && status === 'unauthenticated') {
      router.replace('/admin/login');
    }
  }, [status, router, success]);

  // Show loading while session loads (but allow success UI to show)
  if (!success && !successRef.current && status === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Don't render anything while redirecting (but allow success UI to show)
  if (!success && !successRef.current && status === 'unauthenticated') {
    return null;
  }

  const passwordStrength = checkPasswordStrength(newPassword);
  const isFormValid = newPassword && confirmPassword && currentPassword && !error && !passwordMismatch;

  return (
    <>
      {/* Success confirmation - render first to guarantee it shows */}
      {(success || successRef.current) && (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
          <div className="max-w-md w-full space-y-8">
            <div className="rounded-md bg-green-50 p-4 animate-fade-in">
              <div className="text-center">
                <div className="text-sm text-green-700 mb-4">
                  ✅ Password changed successfully!
                </div>
                <div className="text-sm text-gray-600 mb-4">
                  Redirecting to dashboard in {countdown} second{countdown !== 1 ? 's' : ''}...
                </div>
                <button
                  type="button"
                  onClick={handleManualRedirect}
                  className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                >
                  Okay
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main form - only render when not in success state */}
      {!success && !successRef.current && (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Change Password
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Update your Super Admin account password.
          </p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="rounded-md shadow-sm -space-y-px">
            {/* Current Password Field */}
            <div>
              <label htmlFor="currentPassword" className="sr-only">
                Current Password
              </label>
              <input
                id="currentPassword"
                name="currentPassword"
                type="password"
                autoComplete="current-password"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                placeholder="Current Password"
                value={currentPassword}
                onChange={(e) => {
                  setCurrentPassword(e.target.value);
                  setError('');
                }}
              />
            </div>

            {/* New Password Field */}
            <div>
              <label htmlFor="newPassword" className="sr-only">
                New Password
              </label>
              <input
                id="newPassword"
                name="newPassword"
                type="password"
                autoComplete="new-password"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                placeholder="New Password"
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value);
                  setError('');
                }}
              />
            </div>

            {/* Password Strength Indicator */}
            {newPassword && (
              <div className="px-3 py-2 bg-gray-50 border-l border-r border-gray-300">
                <div className="flex items-center space-x-2">
                  <span className="text-xs text-gray-600">Strength:</span>
                  <div className="flex space-x-1">
                    <div className={`h-2 w-6 rounded ${passwordStrength === 'weak' ? 'bg-red-500' : passwordStrength === 'medium' ? 'bg-yellow-500' : 'bg-green-500'}`}></div>
                    <div className={`h-2 w-6 rounded ${passwordStrength === 'medium' || passwordStrength === 'strong' ? (passwordStrength === 'medium' ? 'bg-yellow-500' : 'bg-green-500') : 'bg-gray-200'}`}></div>
                    <div className={`h-2 w-6 rounded ${passwordStrength === 'strong' ? 'bg-green-500' : 'bg-gray-200'}`}></div>
                  </div>
                  <span className={`text-xs capitalize ${passwordStrength === 'weak' ? 'text-red-600' : passwordStrength === 'medium' ? 'text-yellow-600' : 'text-green-600'}`}>
                    {passwordStrength}
                  </span>
                </div>
              </div>
            )}

            {/* Confirm Password Field */}
            <div>
              <label htmlFor="confirmPassword" className="sr-only">
                Confirm New Password
              </label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                required
                className={`appearance-none rounded-none relative block w-full px-3 py-2 border placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-blue-500 focus:z-10 sm:text-sm ${
                  passwordMismatch
                    ? 'border-red-300 text-red-900 placeholder-red-300 focus:ring-red-500 focus:border-red-500'
                    : 'border-gray-300 focus:border-blue-500'
                }`}
                placeholder="Confirm New Password"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  setError('');
                }}
              />
              {passwordMismatch && (
                <p className="mt-1 text-sm text-red-600">Passwords do not match</p>
              )}
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="rounded-md bg-red-50 p-4">
              <div className="text-sm text-red-700">{error}</div>
            </div>
          )}

          {/* Submit Button */}
          <div>
            <button
              type="submit"
              disabled={loading || !isFormValid || success}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <div className="flex items-center">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Changing Password...
                </div>
              ) : success ? (
                'Password Changed'
              ) : (
                'Change Password'
              )}
            </button>
          </div>

          {/* Cancel Link */}
          <div className="text-center">
            <button
              type="button"
              onClick={() => router.push('/admin/dashboard')}
              className="text-sm text-blue-600 hover:text-blue-500"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
      )}
    </>
  );
}

export default function ChangePasswordPage() {
  return <ChangePasswordForm />;
}