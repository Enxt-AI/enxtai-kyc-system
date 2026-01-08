'use client';

import AdminSessionProvider from '@/components/AdminSessionProvider';

/**
 * Super Admin Login Page
 *
 * Authentication page for EnxtAI internal Super Admin users.
 *
 * @route /admin/login
 *
 * @remarks
 * **Purpose**:
 * - Authenticates SUPER_ADMIN role users (EnxtAI team)
 * - Separate from Client Admin login (/client/login)
 * - Uses NextAuth credentials provider
 *
 * **Authentication Flow**:
 * 1. User enters email/password
 * 2. NextAuth validates against backend API (/api/auth/admin/callback/credentials)
 * 3. Backend checks ClientUser table (role=SUPER_ADMIN, clientId=null)
 * 4. On success, creates JWT session with role claim
 * 5. Redirects directly to /admin/dashboard (SUPER_ADMIN only)
 *
 * **Isolated Authentication**:
 * - Uses AdminSessionProvider with basePath="/api/auth/admin"
 * - Stores session in next-auth.super-admin-token cookie
 * - Prevents session conflicts with client portal
 *
 * **Direct Redirect**:
 * - No role checking needed (admin login only accepts SUPER_ADMIN)
 * - window.location.href for hard redirect (ensures fresh session)
 * - Isolated from client portal authentication
 *
 * **Demo Credentials**:
 * - Email: admin@enxtai.com
 * - Password: admin123
 * - Role: SUPER_ADMIN
 *
 * **Security**:
 * - JWT tokens stored in httpOnly cookies
 * - CSRF protection enabled
 * - Role-based redirect prevents unauthorized access
 *
 * @see {@link file:apps/web/src/lib/auth.ts} NextAuth configuration
 * @see {@link file:apps/web/src/middleware.ts} Route protection middleware
 */

// SHARED AUTH, ROLE-BASED REDIRECT: Single backend, separate UIs.

import { signIn } from 'next-auth/react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function SuperAdminLoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
        callbackUrl: '/admin/dashboard', // Route to admin auth handler
      });

      if (result?.error) {
        setError('Invalid email or password');
        setLoading(false);
      } else if (result?.ok) {
        // Successful login - redirect directly to admin dashboard
        // Admin login page only accepts SUPER_ADMIN users
        window.location.href = '/admin/dashboard';
      }
    } catch (err) {
      setError('An error occurred during login');
      setLoading(false);
    }
  };

  return (
    // ISOLATED ADMIN AUTH: Login page outside protected layout needs own provider
    // Routes signIn() to /api/auth/admin/callback/credentials
    <AdminSessionProvider>
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-blue-50 via-white to-gray-50 px-4">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center">
            <h1 className="text-3xl font-bold text-gray-900">Super Admin Login</h1>
            <p className="mt-2 text-sm text-gray-600">Sign in to your Super Admin account to manage clients and review KYC submissions</p>
          </div>

          <div className="bg-white rounded-lg shadow-md p-8 space-y-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                  Email Address
                </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="admin@enxtai.com"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md p-3">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white py-2 px-4 rounded-md font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <div className="text-center text-sm text-gray-600">
            <p>Super Admin Demo Credentials:</p>
            <code className="block mt-1 text-xs bg-gray-100 p-2 rounded">
              admin@enxtai.com / admin123
            </code>
          </div>
        </div>

        <div className="text-center">
          <Link href="/" className="text-sm text-blue-600 hover:underline">
            ← Back to Home
          </Link>
        </div>
      </div>
    </div>
    </AdminSessionProvider>
  );
}