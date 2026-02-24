"use client";

import AdminSessionProvider from "@/components/AdminSessionProvider";

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

import { signIn } from "next-auth/react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function SuperAdminLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
        callbackUrl: "/admin/dashboard", // Route to admin auth handler
      });

      if (result?.error) {
        setError("Invalid email or password");
        setLoading(false);
      } else if (result?.ok) {
        // Successful login - redirect directly to admin dashboard
        // Admin login page only accepts SUPER_ADMIN users
        window.location.href = "/admin/dashboard";
      }
    } catch (err) {
      setError("An error occurred during login");
      setLoading(false);
    }
  };

  return (
    // ISOLATED ADMIN AUTH: Login page outside protected layout needs own provider
    // Routes signIn() to /api/auth/admin/callback/credentials
    <AdminSessionProvider>
      <div className="min-h-screen bg-zinc-50 selection:bg-zinc-900 selection:text-white flex flex-col items-center justify-center px-4 sm:px-6 lg:px-8">
        <div className="w-full max-w-md space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-white border border-zinc-200 shadow-sm mb-6">
              <svg
                className="w-6 h-6 text-zinc-900"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745l-1 1M12 15v8m0-8h.01M5 19h14"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M12 11V3m0 8h.01M5 7h14"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M9 3h6v4H9V3z"
                />
              </svg>
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-zinc-900">
              System Administration
            </h1>
            <p className="mt-2 text-sm text-zinc-500 leading-relaxed font-medium">
              Internal access for operational oversight and compliance queue
              management.
            </p>
          </div>

          <div className="bg-white rounded-2xl shadow-xl shadow-zinc-200/50 border border-zinc-200 overflow-hidden">
            <div className="p-8">
              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <label
                    htmlFor="email"
                    className="block text-sm font-medium text-zinc-900 mb-2"
                  >
                    Email Address
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <svg
                        className="h-5 w-5 text-zinc-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207"
                        />
                      </svg>
                    </div>
                    <input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="block w-full pl-10 pr-3 py-2.5 bg-zinc-50 border border-zinc-200 rounded-lg text-sm placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent transition-all"
                      placeholder="admin@enxtai.com"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="password"
                    className="block text-sm font-medium text-zinc-900 mb-2"
                  >
                    Password
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <svg
                        className="h-5 w-5 text-zinc-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                        />
                      </svg>
                    </div>
                    <input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className="block w-full pl-10 pr-3 py-2.5 bg-zinc-50 border border-zinc-200 rounded-lg text-sm placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent transition-all"
                      placeholder="••••••••"
                    />
                  </div>
                </div>

                {error && (
                  <div className="flex items-start gap-3 p-3 bg-red-50 text-red-700 rounded-lg text-sm border border-red-100 animate-in fade-in">
                    <svg
                      className="w-5 h-5 shrink-0 mt-0.5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    <p>{error}</p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex items-center justify-center px-4 py-2.5 bg-zinc-900 text-white text-sm font-medium rounded-lg hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:ring-offset-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed gap-2"
                >
                  {loading ? (
                    <>
                      <svg
                        className="animate-spin h-4 w-4 text-white"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        ></circle>
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        ></path>
                      </svg>
                      Authenticating...
                    </>
                  ) : (
                    "Authenticate to Access"
                  )}
                </button>
              </form>
            </div>

            <div className="bg-zinc-50 border-t border-zinc-100 p-6">
              <div className="flex items-center justify-center gap-2 text-xs font-medium text-zinc-500 uppercase tracking-wider mb-3">
                <svg
                  className="w-4 h-4 text-zinc-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                Demo Credentials
              </div>
              <code className="block text-center text-xs font-mono text-zinc-600 bg-white border border-zinc-200 py-2 px-3 rounded-md">
                admin@enxtai.com / admin123
              </code>
            </div>
          </div>

          <div className="text-center pt-4">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-sm font-medium text-zinc-500 hover:text-zinc-900 transition-colors"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 19l-7-7m0 0l7-7m-7 7h18"
                />
              </svg>
              Return to Home
            </Link>
          </div>
        </div>
      </div>
    </AdminSessionProvider>
  );
}
