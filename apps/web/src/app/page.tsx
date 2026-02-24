"use client";

import React, { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { validateApiKey, setKycApiKey } from "@/lib/api-client";

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
    const errorParam = searchParams.get("error");

    if (errorParam) {
      switch (errorParam) {
        case "session_expired":
          onError("Your session has expired. Please enter your API key again.");
          break;
        case "invalid_key":
          onError(
            "Your API key is invalid or has been revoked. Please contact your administrator.",
          );
          break;
        case "domain_not_whitelisted":
          onError(
            "This domain is not authorized to access the KYC system. Please contact your administrator.",
          );
          break;
        case "key_required":
          onError(
            "Please enter your API key to access the KYC verification flow.",
          );
          break;
        default:
          onError("An error occurred. Please try again.");
      }

      // Clear error param from URL without triggering navigation
      window.history.replaceState({}, "", "/");
    }
  }, [searchParams, onError]);

  return null;
}

export default function HomePage() {
  const router = useRouter();
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [apiKey, setApiKey] = useState("");
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
      setError("Please enter a valid API key");
      return;
    }

    setValidating(true);
    try {
      const result = await validateApiKey(trimmedKey);

      if (result.valid) {
        // Store API key using helper function (sets key + 30min expiry)
        setKycApiKey(trimmedKey);
        // Redirect to KYC upload flow
        router.push("/kyc/upload");
      } else {
        setError(result.error || "Invalid API key provided");
      }
    } catch (err) {
      setError("An unexpected error occurred. Please try again later.");
    } finally {
      setValidating(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 selection:bg-zinc-900 selection:text-white flex flex-col items-center py-12 px-4 sm:px-6 lg:px-8">
      {/* Error Banner Handler - wrapped in Suspense for useSearchParams */}
      <Suspense fallback={null}>
        <ErrorBanner onError={setBannerError} />
      </Suspense>

      {/* Global Error Banner */}
      {bannerError && (
        <div className="w-full max-w-5xl mb-8 animate-in slide-in-from-top-4">
          <div className="rounded-xl bg-red-50 border border-red-100 p-4 shrink-0 flex items-start gap-4 shadow-sm">
            <svg
              className="w-5 h-5 text-red-600 mt-0.5 shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-red-900">
                Authentication Required
              </h3>
              <p className="mt-1 text-sm text-red-700 leading-relaxed">
                {bannerError}
              </p>
            </div>
            <button
              onClick={() => setBannerError(null)}
              className="text-red-500 hover:text-red-700 transition-colors p-1"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Hero Section */}
      <div className="w-full max-w-5xl flex flex-col items-center text-center mt-12 mb-20 animate-in fade-in slide-in-from-bottom-4 duration-700">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white border border-zinc-200 text-xs font-semibold text-zinc-600 mb-8 shadow-sm">
          <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
          enxtAI Platform Operational
        </div>
        <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight text-zinc-900 mb-6 font-sans">
          Identity Verification Infrastructure
        </h1>
        <p className="max-w-2xl text-lg sm:text-lg text-zinc-500 leading-relaxed font-medium">
          Enterprise-grade automated KYC workflows designed for modern FinTech
          compliance, secure access, and streamlined customer onboarding.
        </p>
      </div>

      {/* Portal Selection Grid - prefetch disabled to prevent route preloading issues */}
      <div className= "max-w-7xl mx-auto w-full grid grid-cols-1 md:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-8 duration-700">
        {/* Super Admin Portal */}
        <Link
          href="/admin/login"
          prefetch={false}
          className="group relative flex flex-col p-8 bg-white rounded-2xl border border-zinc-200 hover:border-zinc-300 hover:shadow-xl hover:shadow-zinc-200/50 transition-all duration-300"
        >
          <div className="w-12 h-12 flex items-center justify-center rounded-xl bg-zinc-100/80 text-zinc-900 mb-6 group-hover:scale-110 group-hover:bg-zinc-100 transition-all duration-300">
            <svg
              className="w-6 h-6"
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
          <h2 className="text-lg font-semibold text-zinc-900 mb-3 tracking-tight">
            System Administration
          </h2>
          <p className="text-sm text-zinc-500 flex-grow mb-8 leading-relaxed">
            Centralized portal for operational oversight, infrastructure
            monitoring, and advanced compliance review queues.
          </p>
          <div className="mt-auto flex items-center justify-between border-t border-zinc-100 pt-5">
            <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-widest">
              Internal Access
            </span>
            <span className="flex items-center text-sm font-medium text-zinc-900 group-hover:text-blue-600 transition-colors">
              Enter{" "}
              <span className="ml-1 opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0 transition-all duration-300">
                →
              </span>
            </span>
          </div>
        </Link>

        {/* Client Portal */}
        <Link
          href="/client/login"
          prefetch={false}
          className="group relative flex flex-col p-8 bg-white rounded-2xl border border-zinc-200 hover:border-zinc-300 hover:shadow-xl hover:shadow-zinc-200/50 transition-all duration-300"
        >
          <div className="w-12 h-12 flex items-center justify-center rounded-xl bg-zinc-100/80 text-zinc-900 mb-6 group-hover:scale-110 group-hover:bg-zinc-100 transition-all duration-300">
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
              />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-zinc-900 mb-3 tracking-tight">
            Client Workspace
          </h2>
          <p className="text-sm text-zinc-500 flex-grow mb-8 leading-relaxed">
            Partner access for FinTech organizations to oversee webhook
            integrations, monitor verification status, and analyze metrics.
          </p>
          <div className="mt-auto flex items-center justify-between border-t border-zinc-100 pt-5">
            <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-widest">
              Partner Access
            </span>
            <span className="flex items-center text-sm font-medium text-zinc-900 group-hover:text-blue-600 transition-colors">
              Enter{" "}
              <span className="ml-1 opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0 transition-all duration-300">
                →
              </span>
            </span>
          </div>
        </Link>

        {/* KYC Verification - Highlighted (Now requires API key) */}
        <button
          onClick={() => setShowApiKeyModal(true)}
          className="group relative flex flex-col p-8 bg-white rounded-2xl border border-zinc-200 hover:border-zinc-300 hover:shadow-xl hover:shadow-zinc-200/50 transition-all duration-300 text-left"
        >
          <div className="w-12 h-12 flex items-center justify-center rounded-xl bg-zinc-100/80 text-zinc-900 mb-6 group-hover:scale-110 group-hover:bg-zinc-100 transition-all duration-300">
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-zinc-900 mb-3 tracking-tight">
            Initiate KYC Flow
          </h2>
          <p className="text-sm text-zinc-500 flex-grow mb-8 leading-relaxed">
            Secure entry point for end-users to submit documents, verify
            identity, and complete the automated onboarding procedure.
          </p>
          <div className="mt-auto flex items-center justify-between border-t border-zinc-100 pt-5">
            <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-widest">
              Secure Access
            </span>
            <span className="flex items-center text-sm font-medium text-zinc-900 group-hover:text-blue-600 transition-colors">
              Start{" "}
              <span className="ml-1 opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0 transition-all duration-300">
                →
              </span>
            </span>
          </div>
        </button>
      </div>

      {/* Footer */}
      <footer className="mt-auto pt-24 pb-8 text-center text-zinc-400 text-sm animate-in fade-in duration-1000">
        <p className="flex items-center justify-center gap-2">
          <span>© {new Date().getFullYear()} EnxtAI Core Technologies.</span>
          <span className="w-1 h-1 bg-zinc-300 rounded-full"></span>
          <span>All Rights Reserved.</span>
        </p>
      </footer>

      {/* API Key Modal */}
      {showApiKeyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
          <div
            className="absolute inset-0 bg-zinc-900/40 backdrop-blur-sm transition-opacity"
            onClick={() => {
              if (!validating) {
                setShowApiKeyModal(false);
                setApiKey("");
                setError(null);
              }
            }}
          />
          <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-zinc-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6 sm:p-8">
              <div className="flex items-start justify-between mb-6">
                <div>
                  <h3 className="text-xl font-bold text-zinc-900 tracking-tight">
                    Authenticate Request
                  </h3>
                  <p className="mt-2 text-sm text-zinc-500 leading-relaxed">
                    Provide your commercial API key to authorize the secure KYC
                    flow initialization.
                  </p>
                </div>
                <button
                  onClick={() => {
                    setShowApiKeyModal(false);
                    setApiKey("");
                    setError(null);
                  }}
                  disabled={validating}
                  className="text-zinc-400 hover:text-zinc-600 transition-colors p-1"
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>

              <form onSubmit={handleApiKeySubmit} className="space-y-6">
                <div>
                  <label
                    htmlFor="apiKey"
                    className="block text-sm font-medium text-zinc-900 mb-2"
                  >
                    Client API Key
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
                          d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
                        />
                      </svg>
                    </div>
                    <input
                      id="apiKey"
                      type="password"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="sk_live_..."
                      className="block w-full pl-10 pr-3 py-2.5 bg-zinc-50 border border-zinc-200 rounded-lg text-sm placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent transition-all"
                      disabled={validating}
                      autoFocus
                      autoComplete="off"
                    />
                  </div>
                </div>

                {error && (
                  <div className="flex items-start gap-3 p-3 bg-red-50 text-red-700 rounded-lg text-sm border border-red-100">
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

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowApiKeyModal(false);
                      setApiKey("");
                      setError(null);
                    }}
                    disabled={validating}
                    className="flex-1 px-4 py-2.5 border border-zinc-200 text-zinc-700 text-sm font-medium rounded-lg hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-300 focus:ring-offset-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={validating || !apiKey.trim()}
                    className="flex-1 px-4 py-2.5 bg-zinc-900 text-white text-sm font-medium rounded-lg hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:ring-offset-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {validating ? (
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
                      "Authorize Request"
                    )}
                  </button>
                </div>
              </form>
            </div>
            <div className="bg-zinc-50 border-t border-zinc-100 p-4 sm:px-8">
              <p className="text-[11px] text-zinc-500 text-center flex items-center justify-center gap-1.5 font-medium uppercase tracking-wider">
                <svg
                  className="w-3.5 h-3.5 text-zinc-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                  />
                </svg>
                Secure Environment Setup
              </p>
              {/* Note: Your API key is validated against your organization's whitelisted domains. */}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
