"use client";

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { v4 as uuidv4 } from 'uuid';
import { DocumentUpload } from '@/components/DocumentUpload';

export default function KycUploadPage() {
  const userId = useMemo(() => uuidv4(), []); // Generate once per mount
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [panUploaded, setPanUploaded] = useState(false);
  const [aadhaarFrontUploaded, setAadhaarFrontUploaded] = useState(false);
  const [aadhaarBackUploaded, setAadhaarBackUploaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const uploadedCount = [panUploaded, aadhaarFrontUploaded, aadhaarBackUploaded].filter(Boolean).length;

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex items-center justify-between">
          <div>
            {submissionId && uploadedCount > 0 && (
              <p className="text-sm text-gray-500">Submission ID: {submissionId}</p>
            )}
            <h1 className="text-3xl font-semibold text-gray-900">Upload KYC Documents</h1>
            <p className="text-gray-600">Upload your PAN and Aadhaar (front & back) to continue.</p>
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
              submissionId={submissionId}
              onSubmissionCreated={setSubmissionId}
              onUploadSuccess={() => {
                setPanUploaded(true);
                setError(null);
              }}
              onUploadError={(msg) => setError(msg)}
            />
          </div>

          <div className="space-y-2">
            <h2 className="text-lg font-medium text-gray-800">Aadhaar Card (Front)</h2>
            <p className="text-xs text-gray-500">Side with photo and name</p>
            <DocumentUpload
              documentType="AADHAAR_FRONT"
              userId={userId}
              submissionId={submissionId}
              onSubmissionCreated={setSubmissionId}
              onUploadSuccess={() => {
                setAadhaarFrontUploaded(true);
                setError(null);
              }}
              onUploadError={(msg) => setError(msg)}
            />
          </div>
        </div>

        <div className="space-y-2">
          <h2 className="text-lg font-medium text-gray-800">Aadhaar Card (Back)</h2>
          <p className="text-xs text-gray-500">Side with address</p>
          <DocumentUpload
            documentType="AADHAAR_BACK"
            userId={userId}
            submissionId={submissionId}
            onSubmissionCreated={setSubmissionId}
            onUploadSuccess={() => {
              setAadhaarBackUploaded(true);
              setError(null);
            }}
            onUploadError={(msg) => setError(msg)}
          />
        </div>

        <div className="flex items-center justify-between rounded-lg border bg-white px-4 py-3 shadow-sm">
          <div>
            <p className="text-sm text-gray-700">Progress</p>
            <p className="text-xl font-semibold text-gray-900">{uploadedCount}/3 documents uploaded</p>
          </div>
          <Link href="/kyc/photo">
            <button
              type="button"
              disabled={!panUploaded || !aadhaarFrontUploaded || !aadhaarBackUploaded}
              className={`rounded px-4 py-2 text-sm font-semibold text-white shadow ${
                panUploaded && aadhaarFrontUploaded && aadhaarBackUploaded
                  ? 'bg-blue-600 hover:bg-blue-700'
                  : 'bg-gray-400 cursor-not-allowed'
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
