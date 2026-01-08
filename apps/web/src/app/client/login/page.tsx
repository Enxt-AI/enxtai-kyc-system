// CONSOLIDATED: Client login form moved from /client-login to /client/login
// Proper location within client portal structure (/client/*)
// UTF-8 no BOM encoding to prevent Turbopack parsing errors

'use client';

import ClientSessionProvider from '@/components/ClientSessionProvider';

/**
 * Client Login Page
 *
 * Authentication page for FinTech client users (ADMIN/VIEWER roles).
 *
 * @route /client/login
 *
 * @remarks
 * **Purpose**:
 * - Authenticates ADMIN/VIEWER role users (FinTech clients)
 * - Separate from Super Admin login (/admin/login)
 * - Uses NextAuth credentials provider
 *
 * **Authentication Flow**:
 * 1. User enters email/password
 * 2. NextAuth validates against backend API (/api/auth/client/callback/credentials)
 * 3. Backend checks ClientUser table (role=ADMIN/VIEWER, clientId=valid)
 * 4. On success, creates JWT session with role claim
 * 5. Redirects directly to /client/dashboard (ADMIN/VIEWER only)
 *
 * **Isolated Authentication**:
 * - Uses ClientSessionProvider with basePath="/api/auth/client"
 * - Stores session in next-auth.client-token cookie
 * - Prevents session conflicts with admin portal
 *
 * **Direct Redirect**:
 * - No role checking needed (client login only accepts ADMIN/VIEWER)
 * - window.location.href for hard redirect (ensures fresh session)
 * - Isolated from admin portal authentication
 *
 * **Demo Credentials**:
 * - Email: admin@testfintech.com
 * - Password: client123
 * - Role: ADMIN
 */

import { signIn } from 'next-auth/react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function ClientLoginPage() {
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
        callbackUrl: '/client/dashboard', // Route to client auth handler
      });

      if (result?.error) {
        setError('Invalid email or password');
        setLoading(false);
      } else if (result?.ok) {
        // Successful login - redirect directly to client dashboard
        // Client login page only accepts ADMIN/VIEWER users
        window.location.href = '/client/dashboard';
      }
    } catch (err) {
      setError('An error occurred during login');
      setLoading(false);
    }
  };

  return (
    // ISOLATED CLIENT AUTH: Login page outside protected layout needs own provider
    // Routes signIn() to /api/auth/client/callback/credentials
    <ClientSessionProvider>
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-blue-50 via-white to-gray-50 px-4">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center">
            <h1 className="text-3xl font-bold text-gray-900">Client Login</h1>
            <p className="mt-2 text-sm text-gray-600">Sign in to access your KYC dashboard</p>
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
                placeholder="admin@testfintech.com"
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
            <p>Demo credentials:</p>
            <code className="block mt-1 text-xs bg-gray-100 p-2 rounded">
              admin@testfintech.com / client123
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
    </ClientSessionProvider>
  );
}
