"use client";

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { WebcamCapture } from '@/components/WebcamCapture';
import { createKYCSubmission, getKYCSubmission } from '@/lib/api-client';

export default function KycPhotoPage() {
  const [userId] = useState(
    process.env.NEXT_PUBLIC_TEST_USER_ID ?? '11111111-1111-1111-1111-111111111111',
  );
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [uploaded, setUploaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function init() {
      try {
        const existing = await getKYCSubmission(userId);
        if (existing?.id) {
          setSubmissionId(existing.id);
        } else {
          const res = await createKYCSubmission(userId);
          setSubmissionId(res.id);
        }
      } catch (err: any) {
        const message = err?.response?.data?.message || 'Unable to start submission';
        setError(message);
      }
    }
    void init();
  }, [userId]);

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500">Submission ID: {submissionId ?? '...'}</p>
            <h1 className="text-3xl font-semibold text-gray-900">Capture Live Photo</h1>
            <p className="text-gray-600">Position your face in the frame and capture a clear photo.</p>
          </div>
          <Link href="/kyc/upload" className="text-blue-600 hover:underline text-sm">
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

        <div className="flex items-center justify-between rounded-lg border bg-white px-4 py-3 shadow-sm">
          <div>
            <p className="text-sm text-gray-700">Live photo status</p>
            <p className="text-xl font-semibold text-gray-900">
              {uploaded ? 'Uploaded' : 'Pending capture'}
            </p>
          </div>
          <button
            type="button"
            disabled={!uploaded}
            className={`rounded px-4 py-2 text-sm font-semibold text-white shadow ${
              uploaded ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-400 cursor-not-allowed'
            }`}
          >
            Continue
          </button>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </main>
  );
}
