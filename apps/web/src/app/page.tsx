'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { validateApiKey, setKycApiKey } from '@/lib/api-client';

/**
 * EnxtAI KYC System - Landing Page (Secure Entry)
 *
 * Main entry point for the multi-tenant KYC verification platform with API key validation.
 *
 * @route /
 *
 * @remarks
 * **Page Purpose**:
 * - Serves as the central hub for all user types in the SaaS KYC system
 * - Provides clear navigation paths for three distinct user personas
 * - **NEW**: Enforces API key validation before KYC flow access (secure entry)
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
 *    - **NEW**: Requires valid client API key (entered via modal)
 *    - API key validated against TenantMiddleware (domain whitelist + key hash)
 *    - Guided flow through document upload and verification
 *
 * **Secure KYC Entry Flow** (NEW):
 * 1. User clicks "Begin KYC Verification" button
 * 2. Modal prompts for client API key entry
 * 3. Frontend validates key via HEAD /api/v1/kyc/initiate (TenantMiddleware)
 * 4. Backend checks:
 *    - API key hash matches active client
 *    - Request origin matches client's allowedDomains whitelist
 * 5. On success:
 *    - API key stored in sessionStorage (30min expiry)
 *    - User redirected to /kyc/upload
 * 6. On failure:
 *    - Error message displayed (invalid key or domain not whitelisted)
 *    - User can retry or contact administrator
 *
 * **SessionStorage Schema**:
 * - `kyc_api_key`: Plaintext API key (used by subsequent KYC requests)
 * - `kyc_api_key_expiry`: Timestamp for 30-minute expiry
 *
 * **Security Considerations**:
 * - API key validated server-side (no client-side bypass)
 * - Domain whitelisting prevents API key abuse from unauthorized sites
 * - 30-minute expiry limits exposure window
 * - Subsequent phase will inject API key into all KYC upload requests
 *
 * **Design Patterns**:
 * - Modal overlay with backdrop blur for API key entry
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
 * @see {@link file:apps/web/src/lib/api-client.ts} validateApiKey function
 * @see {@link file:apps/api/src/common/middleware/tenant.middleware.ts} TenantMiddleware
 */

/**
 * Error Banner Component
 *
 * Handles error message display from query parameters.
 * Must be in separate component to use useSearchParams with Suspense.
 */
function ErrorBanner({ onError }: { onError: (error: string | null) => void }) {
  const searchParams = useSearchParams();

  useEffect(() => {
    const errorParam = searchParams.get('error');

    if (errorParam) {
      switch (errorParam) {
        case 'session_expired':
          onError('Your session has expired. Please enter your API key again.');
          break;
        case 'invalid_key':
          onError('Your API key is invalid or has been revoked. Please contact your administrator.');
          break;
        case 'domain_not_whitelisted':
          onError('This domain is not authorized to access the KYC system. Please contact your administrator.');
          break;
        case 'key_required':
          onError('Please enter your API key to access the KYC verification flow.');
          break;
        default:
          onError('An error occurred. Please try again.');
      }

      // Clear error param from URL without triggering navigation
      window.history.replaceState({}, '', '/');
    }
  }, [searchParams, onError]);

  return null;
}

export default function HomePage() {
  const router = useRouter();
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bannerError, setBannerError] = useState<string | null>(null);

  /**
   * Handle API Key Submission
   *
   * Validates the entered API key and stores it in sessionStorage on success.
   *
   * @remarks
   * **Validation Flow**:
   * 1. Trim and validate key format (non-empty)
   * 2. Call validateApiKey() which triggers TenantMiddleware
   * 3. On success: Store in sessionStorage with 30min expiry, redirect to /kyc/upload
   * 4. On failure: Display error message (invalid key or domain not whitelisted)
   *
   * **SessionStorage Schema**:
   * - `kyc_api_key`: Plaintext API key
   * - `kyc_api_key_expiry`: Timestamp (Date.now() + 30min)
   *
   * **Security**:
   * - Key validated server-side via TenantMiddleware
   * - Domain whitelist enforced by backend
   * - 30-minute expiry prevents stale keys
   */
  const handleApiKeySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedKey = apiKey.trim();
    if (!trimmedKey) {
      setError('Please enter an API key');
      return;
    }

    setValidating(true);
    try {
      const result = await validateApiKey(trimmedKey);

      if (result.valid) {
        // Store API key using helper function (sets key + 30min expiry)
        setKycApiKey(trimmedKey);

        // Redirect to KYC upload flow
        router.push('/kyc/upload');
      } else {
        setError(result.error || 'Invalid API key');
      }
    } catch (err) {
      setError('Failed to validate API key. Please try again.');
    } finally {
      setValidating(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-b from-blue-50 via-white to-gray-50 px-4 sm:px-6 lg:px-8">
      {/* Error Banner Handler - wrapped in Suspense for useSearchParams */}
      <Suspense fallback={null}>
        <ErrorBanner onError={setBannerError} />
      </Suspense>

      <div className="w-full max-w-7xl space-y-12">
        {/* Error Banner */}
        {bannerError && (
          <div className="max-w-6xl mx-auto">
            <div className="rounded-lg bg-red-50 border border-red-200 p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-start">
                  <svg className="h-6 w-6 text-red-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-red-800">Authentication Error</h3>
                    <p className="mt-1 text-sm text-red-700">{bannerError}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setBannerError(null)}
                  className="ml-4 inline-flex text-red-400 hover:text-red-600 focus:outline-none"
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        )}

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

        {/* Portal Selection Grid - prefetch disabled to prevent route preloading issues */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {/* Super Admin Portal */}
          <Link
            href="/admin/login"
            prefetch={false}
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
            prefetch={false}
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

          {/* KYC Verification - Now requires API key */}
          <button
            onClick={() => setShowApiKeyModal(true)}
            className="group block bg-white rounded-lg shadow-md hover:shadow-xl hover:scale-105 transition-all duration-200 p-8 text-center md:col-span-2 lg:col-span-1 w-full"
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
                  Secure Access
                </span>
              </div>
            </div>
          </button>
        </div>

        {/* Footer */}
        <div className="text-center text-gray-500 text-sm">
          <p>© 2026 EnxtAI. Secure KYC verification for modern FinTech.</p>
        </div>
      </div>

      {/* API Key Modal */}
      {showApiKeyModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-bold text-gray-900">Enter Client API Key</h3>
              <button
                onClick={() => {
                  setShowApiKeyModal(false);
                  setApiKey('');
                  setError(null);
                }}
                className="text-gray-400 hover:text-gray-600"
                aria-label="Close modal"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <p className="text-sm text-gray-600">
              To begin the KYC verification process, please enter your client API key.
              This key is provided by your organization and ensures secure access to the verification system.
            </p>

            <form onSubmit={handleApiKeySubmit} className="space-y-4">
              <div>
                <label htmlFor="apiKey" className="block text-sm font-medium text-gray-700 mb-1">
                  API Key
                </label>
                <input
                  id="apiKey"
                  type="text"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk_live_..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={validating}
                  autoFocus
                />
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-md p-3">
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowApiKeyModal(false);
                    setApiKey('');
                    setError(null);
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 transition-colors"
                  disabled={validating}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={validating || !apiKey.trim()}
                  className={`flex-1 px-4 py-2 rounded-md text-white font-medium transition-colors ${
                    validating || !apiKey.trim()
                      ? 'bg-gray-400 cursor-not-allowed'
                      : 'bg-blue-600 hover:bg-blue-700'
                  }`}
                >
                  {validating ? 'Validating...' : 'Continue'}
                </button>
              </div>
            </form>

            <div className="pt-4 border-t border-gray-200">
              <p className="text-xs text-gray-500">
                <strong>Note:</strong> Your API key is validated against your organization's
                whitelisted domains. If you encounter issues, please contact your administrator.
              </p>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
