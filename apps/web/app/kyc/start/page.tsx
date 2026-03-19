/**
 * KYC Start Page -- Session Bootstrap from External Client Redirect
 *
 * Route: /kyc/start?token=<JWT>
 *
 * This page is the entry point for users redirected from external client
 * applications (e.g., smc-unlisted-stox). It receives a JWT token via the
 * `token` query parameter, validates it server-side through the
 * /api/kyc/validate-token endpoint, and then bootstraps the KYC session
 * by setting the required sessionStorage/localStorage values.
 *
 * Flow:
 * 1. User clicks "Complete KYC" in the client application
 * 2. Client app calls POST /v1/kyc/initiate and receives a kycFlowUrl
 * 3. Client app redirects user to kycFlowUrl (this page)
 * 4. This page validates the token and extracts session data
 * 5. Session data is stored in browser storage
 * 6. User is redirected to /kyc/upload to begin the KYC flow
 *
 * On failure (expired/invalid token), the user is shown an error message
 * with an option to return to the client application (if returnUrl is known).
 */
'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import {
  setKycApiKey,
  setKycReturnUrl,
} from '@/lib/api-client';

/**
 * Shape of the response from POST /api/kyc/validate-token.
 * Matches the JSON returned by the validate-token API route.
 */
interface ValidateTokenResponse {
  valid: boolean;
  clientId?: string;
  userId?: string;
  externalUserId?: string;
  kycSessionId?: string;
  apiKey?: string;
  returnUrl?: string | null;
  error?: string;
  /** Steps already completed in a prior session (e.g., ["pan", "aadhaar"]). */
  completedSteps?: string[];
  /** Next step to complete, or null if all documents are uploaded. */
  currentStep?: string | null;
}

/**
 * Inner component that reads searchParams.
 * Wrapped in Suspense because useSearchParams() requires it in Next.js App Router.
 */
function KycStartContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [status, setStatus] = useState<'loading' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string>('');
  // If we can extract a returnUrl from the error response or from the token,
  // we show a "Return to App" button even on error screens.
  const [fallbackReturnUrl, setFallbackReturnUrl] = useState<string | null>(null);

  useEffect(() => {
    const token = searchParams.get('token');

    if (!token) {
      setStatus('error');
      setErrorMessage(
        'No session token provided. Please use the link from your application to start the KYC process.',
      );
      return;
    }

    // Validate the JWT token by calling the server-side API route.
    // This keeps the JWT_KYC_SESSION_SECRET on the server.
    async function validateAndBootstrap(sessionToken: string) {
      try {
        const response = await fetch('/api/kyc/validate-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: sessionToken }),
        });

        const data: ValidateTokenResponse = await response.json();

        if (!data.valid || !data.apiKey || !data.kycSessionId) {
          setStatus('error');
          setErrorMessage(
            data.error || 'Invalid session. Please request a new KYC link from your application.',
          );
          // Try to extract returnUrl from the response (if the server decoded
          // enough to get it before failing validation).
          if (data.returnUrl) {
            setFallbackReturnUrl(data.returnUrl);
          }
          return;
        }

        // -- Bootstrap the KYC session --

        // 1. Store the API key in sessionStorage so the Axios interceptor
        //    automatically includes it in X-API-Key headers for /v1/kyc/* requests.
        setKycApiKey(data.apiKey);

        // 2. Store the external user ID in localStorage -- the KYC flow pages
        //    send this as the `externalUserId` form field in upload requests.
        //    This must be the client's original external ID (e.g., "cmmf4ww..."),
        //    NOT the internal User.id UUID, because the upload endpoints call
        //    lookupUserByExternalId() which queries by (clientId, externalUserId).
        if (data.externalUserId) {
          localStorage.setItem('kyc_user_id', data.externalUserId);
        }

        // 3. Store the KYC submission ID (kycSessionId) -- this is used by the
        //    upload, photo, and signature pages to associate documents with the
        //    correct submission.
        if (data.kycSessionId) {
          localStorage.setItem('kyc_submission_id', data.kycSessionId);
        }

        // 4. Store the return URL so the /kyc/verify page knows where to
        //    redirect the user after successful completion.
        if (data.returnUrl) {
          setKycReturnUrl(data.returnUrl);
        }

        // 5. Determine the correct entry point based on step progress.
        //
        //    If the user is resuming a partially completed session (e.g., PAN
        //    and Aadhaar already uploaded), we skip them directly to the next
        //    incomplete step instead of restarting from /kyc/upload.
        //
        //    Step-to-route mapping:
        //      "pan" or "aadhaar" -> /kyc/upload   (document upload page)
        //      "photo"            -> /kyc/photo    (live photo capture)
        //      "signature"        -> /kyc/signature (signature draw/upload)
        //      null (all done)    -> /kyc/verify   (review & submit)
        //
        //    Using replace() so the user cannot navigate back to this bootstrap
        //    page (the token would be visible in the URL bar).
        const stepRouteMap: Record<string, string> = {
          pan: '/kyc/upload',
          aadhaar: '/kyc/upload',
          photo: '/kyc/photo',
          signature: '/kyc/signature',
        };
        const nextStep = data.currentStep;
        const targetRoute = nextStep ? (stepRouteMap[nextStep] || '/kyc/upload') : '/kyc/verify';

        router.replace(targetRoute);
      } catch (err) {
        console.error('[kyc/start] Failed to validate session token:', err);
        setStatus('error');
        setErrorMessage(
          'Unable to validate your session. Please check your internet connection and try again.',
        );
      }
    }

    validateAndBootstrap(token);
  }, [searchParams, router]);

  // -- Loading State --
  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-50 via-white to-gray-50 flex items-center justify-center p-6">
        <div className="mx-auto max-w-md w-full text-center space-y-6">
          <div className="rounded-2xl border border-blue-200 bg-white p-8 shadow-lg space-y-6">
            {/* Spinner */}
            <div className="mx-auto w-16 h-16 rounded-full border-4 border-blue-200 border-t-blue-600 animate-spin" />

            <div>
              <h1 className="text-xl font-bold text-gray-900 mb-2">
                Preparing Your KYC Session
              </h1>
              <p className="text-sm text-gray-600">
                Validating your session token and setting up the verification flow.
                This will only take a moment.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // -- Error State --
  return (
    <div className="min-h-screen bg-gradient-to-b from-red-50 via-white to-gray-50 flex items-center justify-center p-6">
      <div className="mx-auto max-w-md w-full text-center space-y-6">
        <div className="rounded-2xl border border-red-200 bg-white p-8 shadow-lg space-y-6">
          {/* Error Icon */}
          <div className="mx-auto w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
            <svg
              className="w-10 h-10 text-red-600"
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
          </div>

          <div>
            <h1 className="text-xl font-bold text-gray-900 mb-2">
              Session Error
            </h1>
            <p className="text-sm text-gray-600">{errorMessage}</p>
          </div>

          <div className="space-y-3">
            {/* Show "Return to App" button if we have a fallback returnUrl */}
            {fallbackReturnUrl && (
              <a
                href={`${fallbackReturnUrl}?status=error&reason=invalid_session`}
                className="block w-full rounded-full bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow hover:bg-blue-700 transition text-center"
              >
                Return to Application
              </a>
            )}

            {/* Always show a retry hint */}
            <p className="text-xs text-gray-500">
              If this problem persists, please contact the application that sent you here
              to request a new KYC verification link.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * KYC Start Page
 *
 * Wraps the content in Suspense because useSearchParams() in Next.js App Router
 * requires a Suspense boundary to handle the initial server render.
 */
export default function KycStartPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gradient-to-b from-blue-50 via-white to-gray-50 flex items-center justify-center p-6">
          <div className="mx-auto max-w-md w-full text-center">
            <div className="rounded-2xl border border-blue-200 bg-white p-8 shadow-lg">
              <div className="mx-auto w-16 h-16 rounded-full border-4 border-blue-200 border-t-blue-600 animate-spin" />
              <p className="mt-4 text-sm text-gray-600">Loading...</p>
            </div>
          </div>
        </div>
      }
    >
      <KycStartContent />
    </Suspense>
  );
}
