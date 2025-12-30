"use client";

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { DocumentUpload } from '@/components/DocumentUpload';
import { createKYCSubmission } from '@/lib/api-client';

export default function KycUploadPage() {
  const [userId] = useState(
    process.env.NEXT_PUBLIC_TEST_USER_ID ?? '11111111-1111-1111-1111-111111111111',
  );
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [panUploaded, setPanUploaded] = useState(false);
  const [aadhaarUploaded, setAadhaarUploaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function init() {
      try {
        const res = await createKYCSubmission(userId);
        setSubmissionId(res.id);
      } catch (err: any) {
        const message = err?.response?.data?.message || 'Unable to start submission';
        setError(message);
      }
    }
    void init();
  }, [userId]);

  const uploadedCount = [panUploaded, aadhaarUploaded].filter(Boolean).length;

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500">Submission ID: {submissionId ?? '...'}</p>
            <h1 className="text-3xl font-semibold text-gray-900">Upload KYC Documents</h1>
            <p className="text-gray-600">Upload your PAN and Aadhaar to continue your verification.</p>
          </div>
          <Link href="/" className="text-blue-600 hover:underline text-sm">
            Back
          </Link>
        </header>

        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-2">
            <h2 className="text-lg font-medium text-gray-800">PAN Card</h2>
            <DocumentUpload
              documentType="PAN"
              userId={userId}
              onUploadSuccess={() => setPanUploaded(true)}
              onUploadError={(msg) => setError(msg)}
            />
          </div>

          <div className="space-y-2">
            <h2 className="text-lg font-medium text-gray-800">Aadhaar Card</h2>
            <DocumentUpload
              documentType="AADHAAR"
              userId={userId}
              onUploadSuccess={() => setAadhaarUploaded(true)}
              onUploadError={(msg) => setError(msg)}
            />
          </div>
        </div>

        <div className="flex items-center justify-between rounded-lg border bg-white px-4 py-3 shadow-sm">
          <div>
            <p className="text-sm text-gray-700">Progress</p>
            <p className="text-xl font-semibold text-gray-900">{uploadedCount}/2 documents uploaded</p>
          </div>
          <Link href="/kyc/photo">
            <button
              type="button"
              disabled={!panUploaded || !aadhaarUploaded}
              className={`rounded px-4 py-2 text-sm font-semibold text-white shadow ${
                panUploaded && aadhaarUploaded ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-400 cursor-not-allowed'
              }`}
            >
              Continue to Live Photo
            </button>
          </Link>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </main>
  );
}
