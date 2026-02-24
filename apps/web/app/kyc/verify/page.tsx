'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { clearKycApiKey } from '@/lib/api-client';

export default function VerifyPage() {
  const router = useRouter();
  const [submissionId, setSubmissionId] = useState<string | null>(null);

  useEffect(() => {
    // Retrieve submissionId from localStorage
    const storedId = localStorage.getItem('kyc_submission_id');
    setSubmissionId(storedId);
  }, []);

  /**
   * Handle Starting New KYC Process
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
    // Clear localStorage
    localStorage.removeItem('kyc_submission_id');
    localStorage.removeItem('kyc_user_id');

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

          {/* Action Button */}
          <button
            onClick={handleStartNewKYC}
            className="w-full rounded-full bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow hover:bg-blue-700 transition"
          >
            Start New KYC Submission
          </button>
        </div>
      </div>
    </div>
  );
}
