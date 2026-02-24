"use client";

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { WebcamCapture } from '@/components/WebcamCapture';
import { createKYCSubmission, getKYCSubmission, getKycApiKey } from '@/lib/api-client';

export default function KycPhotoPage() {
  const router = useRouter();

  // Retrieve userId from localStorage (set during document upload)
  const [userId, setUserId] = useState<string>('');
  const [isReady, setIsReady] = useState(false);
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [uploaded, setUploaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * API Key Validation Guard
   *
   * Validates API key presence and expiry on component mount.
   * Redirects to hero page if key missing or expired.
   */
  useEffect(() => {
    try {
      const apiKey = getKycApiKey();
      // Key is valid, proceed with page
    } catch (error) {
      router.replace('/?error=session_expired');
    }
  }, [router]);

  // Load userId from localStorage on client side only
  useEffect(() => {
    const storedUserId = localStorage.getItem('kyc_user_id') ?? process.env.NEXT_PUBLIC_TEST_USER_ID ?? '11111111-1111-1111-1111-111111111111';
    setUserId(storedUserId);
    setIsReady(true);
  }, []);

  useEffect(() => {
    async function init() {
      try {
        const existing = await getKYCSubmission(userId);
        if (existing?.id) {
          setSubmissionId(existing.id);
          localStorage.setItem('kyc_submission_id', existing.id);
        } else {
          const res = await createKYCSubmission(userId);
          setSubmissionId(res.id);
          localStorage.setItem('kyc_submission_id', res.id);
        }
      } catch (err: any) {
        const message = err?.response?.data?.message || 'Unable to start submission';
        setError(message);
      }
    }
    if (userId) {
      void init();
    }
  }, [userId]);

  // Show loading state until userId is ready
  if (!isReady) {
    return (
      <main className="min-h-screen bg-gray-50 p-8 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-gray-50 via-white to-gray-50 p-6 sm:p-10">
      <div className="mx-auto max-w-5xl space-y-8">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-gray-500">Submission ID: {submissionId ?? '...'}</p>
            <h1 className="text-3xl font-semibold text-gray-900">Capture Live Photo</h1>
            <div className="text-gray-700 space-y-1 text-sm">
              <p>Follow the guide below. We need a clear, centered, single face photo.</p>
              <ul className="list-disc pl-4 space-y-1">
                <li>Single person only; keep your face fully inside the circle.</li>
                <li>Good lighting: no strong backlight; keep your face evenly lit.</li>
                <li>Look at the camera and hold still for a few seconds until marked ready.</li>
                <li>Wait for the dashed ring to turn solid green before capturing.</li>
                <li>The crosshair helps you center your face precisely.</li>
              </ul>
            </div>
          </div>
          <Link href="/kyc/upload" className="text-blue-600 hover:underline text-sm font-semibold">
            Back to Documents
          </Link>
        </header>

        <WebcamCapture
          userId={userId}
          onUploadSuccess={() => {
            setUploaded(true);
            setError(null);
          }}
          onUploadError={(msg) => setError(msg)}
        />

        <div className="rounded-xl border border-gray-200 bg-white px-4 py-4 shadow-sm sm:px-6 sm:py-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-gray-700">Live photo status</p>
              <p className="text-xl font-semibold text-gray-900">
                {uploaded ? 'Uploaded' : 'Pending capture'}
              </p>
              {!uploaded && (
                <p className="text-xs text-gray-500">
                  Align your face with the guide circle and wait for the green indicator, then capture and upload to proceed.
                </p>
              )}
              {uploaded && (
                <p className="text-xs text-green-700">Looks good. You can continue to the next step.</p>
              )}
            </div>
            <button
              type="button"
              disabled={!uploaded}
              className={`rounded-full px-5 py-2 text-sm font-semibold text-white shadow transition ${
                uploaded ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-400 cursor-not-allowed'
              }`}
              onClick={() => {
                if (!uploaded) return;
                router.push('/kyc/signature');
              }}
            >
              Continue
            </button>
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </main>
  );
}
