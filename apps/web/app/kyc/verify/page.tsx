/**
 * KYC Verification Complete Page
 *
 * This page is shown after the user completes all KYC steps (document upload,
 * photo capture, signature). It has two distinct behaviors:
 *
 * 1. **External client flow** (returnUrl is present in sessionStorage):
 *    Shows a brief success message with a countdown, then redirects the user
 *    back to the client application's returnUrl with status query parameters.
 *    Redirect URL format: {returnUrl}?status=submitted&sessionId={kycSessionId}
 *
 * 2. **Direct/standalone flow** (no returnUrl):
 *    Shows the original success page with submission details and a button to
 *    start a new KYC process. This preserves backward compatibility.
 */
'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import { clearKycApiKey, getKycReturnUrl, clearKycReturnUrl, initiateKyc } from '@/lib/api-client';

export default function VerifyPage() {
  const router = useRouter();
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  // returnUrl is set when the user arrived via an external client redirect.
  // null means the user accessed the KYC flow directly (standalone mode).
  const [returnUrl, setReturnUrl] = useState<string | null>(null);
  // Countdown timer for auto-redirect in the external client flow.
  const [countdown, setCountdown] = useState<number>(5);
  // Whether the auto-redirect has already been triggered (prevents double-redirect).
  const [redirecting, setRedirecting] = useState(false);

  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    // Read verification identifier natively from URL
    const params = new URLSearchParams(window.location.search);
    const vId = params.get('verification');
    if (vId) setUserId(vId);

    // Retrieve submissionId natively via API lookup instead of LocalStorage
    const fetchSubmission = async () => {
      if (!vId) return;
      try {
        const sessionData = await initiateKyc(vId);
        if (sessionData?.kycSessionId) {
          setSubmissionId(sessionData.kycSessionId);
        }
      } catch (err) {
        console.error("Could not fetch KYC DB Submission", err);
      }
    };
    
    fetchSubmission();

    const storedReturnUrl = getKycReturnUrl();
    setReturnUrl(storedReturnUrl);
  }, []);

  /**
   * Redirect to Client Application
   *
   * Builds the redirect URL with status query parameters and navigates
   * the user back to the client application. Clears all KYC session data
   * before redirecting.
   *
   * Query parameters appended to returnUrl:
   *   - status: 'submitted' (KYC flow completed successfully)
   *   - sessionId: The KYC submission ID for the client to track
   */
  const redirectToClient = useCallback(() => {
    if (!returnUrl || redirecting) return;
    setRedirecting(true);

    // Build the redirect URL with status information
    const redirectTarget = new URL(returnUrl);
    redirectTarget.searchParams.set('status', 'submitted');
    if (submissionId) {
      redirectTarget.searchParams.set('sessionId', submissionId);
    }

    // Clean up all KYC session data before leaving
    clearKycApiKey(); // Also clears returnUrl from sessionStorage
    clearKycReturnUrl();

    // Navigate to the client application
    window.location.href = redirectTarget.toString();
  }, [returnUrl, submissionId, redirecting]);

  /**
   * Auto-redirect countdown for external client flow.
   * Counts down from 5 seconds and then triggers the redirect.
   */
  useEffect(() => {
    // Only auto-redirect if we have a returnUrl (external client flow)
    if (!returnUrl) return;

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          redirectToClient();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [returnUrl, redirectToClient]);

  /**
   * Handle Starting New KYC Process (standalone flow only)
   *
   * Clears all KYC-related data from storage and redirects to home.
   *
   * **Cleanup Actions**:
   * 1. Clear KYC submission ID (localStorage)
   * 2. Clear user ID (localStorage)
   * 3. Clear API key and expiry (sessionStorage) - uses helper function
   * 4. Redirect to hero page
   *
   * **Security**:
   * - Prevents key reuse across multiple KYC sessions
   * - Forces re-authentication for new submissions
   * - Ensures clean state for next user
   */
  const handleStartNewKYC = () => {
    // Clear API key from sessionStorage using helper
    clearKycApiKey();

    // Redirect to home
    router.push('/');
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-50 via-white to-gray-50 flex items-center justify-center p-6">
      <div className="mx-auto max-w-2xl w-full space-y-6">
        <div className="rounded-2xl border border-green-200 bg-white p-8 shadow-lg text-center space-y-6">
          {/* Success Icon */}
          <div className="mx-auto w-20 h-20 rounded-full bg-green-100 flex items-center justify-center">
            <svg className="w-12 h-12 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>

          {/* Success Message */}
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">KYC Submission Complete!</h1>
            <p className="text-gray-600">
              Thank you for completing your KYC verification process.
            </p>
          </div>

          {/* Submission Details */}
          {submissionId && (
            <div className="rounded-lg bg-gray-50 p-4 text-left space-y-2">
              <p className="text-sm font-semibold text-gray-700">Submission Details:</p>
              <div className="text-xs text-gray-600 space-y-1">
                <p><span className="font-medium">Submission ID:</span> {submissionId}</p>
                <p><span className="font-medium">Status:</span> Under Review</p>
              </div>
            </div>
          )}

          {/* What's Next */}
          <div className="rounded-lg bg-blue-50 p-4 text-left space-y-2">
            <p className="text-sm font-semibold text-blue-900">What happens next?</p>
            <ul className="text-xs text-blue-800 space-y-1 list-disc pl-5">
              <li>Your documents are being verified by our team</li>
              <li>You will receive an email notification once verification is complete</li>
              <li>This process typically takes 24-48 hours</li>
            </ul>
          </div>

          {/*
            External Client Flow: Show a "Returning to app" message with
            countdown and a manual redirect button.

            Standalone Flow: Show the original "Start New KYC" button.
          */}
          {returnUrl ? (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">
                Returning you to the application in{' '}
                <span className="font-semibold text-blue-600">{countdown}</span>{' '}
                second{countdown !== 1 ? 's' : ''}...
              </p>
              <button
                onClick={redirectToClient}
                disabled={redirecting}
                className="w-full rounded-full bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {redirecting ? 'Redirecting...' : 'Return to Application Now'}
              </button>
            </div>
          ) : (
            <button
              onClick={handleStartNewKYC}
              className="w-full rounded-full bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow hover:bg-blue-700 transition"
            >
              Start New KYC Submission
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
