import React from 'react';
import Link from 'next/link';

/**
 * EnxtAI KYC System - Landing Page
 *
 * Main entry point for the multi-tenant KYC verification platform.
 *
 * @route /
 *
 * @remarks
 * **Page Purpose**:
 * - Serves as the central hub for all user types in the SaaS KYC system
 * - Provides clear navigation paths for three distinct user personas
 * - Maintains consistent design language with login pages
 *
 * **User Types & Routes**:
 * 1. **Super Admin Portal** (`/admin/login`):
 *    - Internal EnxtAI team members (SUPER_ADMIN role)
 *    - Access to client management, KYC review queue, system analytics
 *    - Requires authentication with SUPER_ADMIN role
 *
 * 2. **Client Portal** (`/client/login`):
 *    - FinTech client administrators (ADMIN/VIEWER roles)
 *    - Access to KYC submissions, webhook configuration, client settings
 *    - Requires authentication with valid clientId
 *
 * 3. **KYC Verification Flow** (`/kyc/upload`):
 *    - End-users starting the KYC verification process
 *    - Public access, no authentication required
 *    - Guided flow through document upload and verification
 *
 * **Design Patterns**:
 * - Gradient background: `bg-gradient-to-b from-blue-50 via-white to-gray-50`
 * - Centered layout with responsive grid for portal cards
 * - White cards with shadows and hover effects
 * - Blue color scheme matching login pages
 * - Mobile-first responsive design
 *
 * **Responsive Breakpoints**:
 * - Mobile: Single column stack
 * - Tablet (md): 2 columns
 * - Desktop (lg): 3 columns
 *
 * @see {@link file:apps/web/src/app/admin/login/page.tsx} Super Admin Login
 * @see {@link file:apps/web/src/app/client/login/page.tsx} Client Login
 * @see {@link file:apps/web/src/app/kyc/upload/page.tsx} KYC Upload Flow
 */

export default function HomePage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-b from-blue-50 via-white to-gray-50 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-7xl space-y-12">
        {/* Hero Section */}
        <div className="text-center space-y-4">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900">
            EnxtAI KYC System
          </h1>
          <p className="text-xl sm:text-2xl text-gray-600 max-w-3xl mx-auto">
            Multi-tenant Know Your Customer verification platform for FinTech companies
          </p>
          <p className="text-lg text-gray-500 max-w-2xl mx-auto">
            Streamline customer onboarding with automated document verification,
            role-based access control, and comprehensive compliance management.
          </p>
        </div>

        {/* Portal Selection Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {/* Super Admin Portal */}
          <Link
            href="/admin/login"
            className="group block bg-white rounded-lg shadow-md hover:shadow-xl hover:scale-105 transition-all duration-200 p-8 text-center"
          >
            <div className="space-y-4">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto group-hover:bg-blue-200 transition-colors">
                <svg
                  className="w-8 h-8 text-blue-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-label="Admin Shield Icon"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                  />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-gray-900">Super Admin Portal</h2>
              <p className="text-gray-600 leading-relaxed">
                Internal access for EnxtAI team to manage clients, review KYC submissions,
                and oversee system operations.
              </p>
              <div className="pt-4">
                <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
                  Internal Access
                </span>
              </div>
            </div>
          </Link>

          {/* Client Portal */}
          <Link
            href="/client/login"
            className="group block bg-white rounded-lg shadow-md hover:shadow-xl hover:scale-105 transition-all duration-200 p-8 text-center"
          >
            <div className="space-y-4">
              <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mx-auto group-hover:bg-indigo-200 transition-colors">
                <svg
                  className="w-8 h-8 text-indigo-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-label="Client Building Icon"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                  />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-gray-900">Client Portal</h2>
              <p className="text-gray-600 leading-relaxed">
                FinTech client access to manage KYC submissions, configure webhooks,
                and monitor verification status.
              </p>
              <div className="pt-4">
                <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-indigo-100 text-indigo-800">
                  Client Access
                </span>
              </div>
            </div>
          </Link>

          {/* KYC Verification */}
          <Link
            href="/kyc/upload"
            className="group block bg-white rounded-lg shadow-md hover:shadow-xl hover:scale-105 transition-all duration-200 p-8 text-center md:col-span-2 lg:col-span-1"
          >
            <div className="space-y-4">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto group-hover:bg-green-200 transition-colors">
                <svg
                  className="w-8 h-8 text-green-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-label="KYC Document Icon"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-gray-900">Begin KYC Verification</h2>
              <p className="text-gray-600 leading-relaxed">
                Start your Know Your Customer verification process with guided document
                upload and automated verification.
              </p>
              <div className="pt-4">
                <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">
                  Public Access
                </span>
              </div>
            </div>
          </Link>
        </div>

        {/* Footer */}
        <div className="text-center text-gray-500 text-sm">
          <p>© 2026 EnxtAI. Secure KYC verification for modern FinTech.</p>
        </div>
      </div>
    </main>
  );
}
