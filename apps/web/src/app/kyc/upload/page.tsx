"use client";

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { v4 as uuidv4 } from 'uuid';
import { DocumentUpload, DocumentUploadRef } from '@/components/DocumentUpload';

export default function KycUploadPage() {
  const userId = useMemo(() => uuidv4(), []); // Generate once per mount
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [panUploaded, setPanUploaded] = useState(false);
  const [aadhaarFrontUploaded, setAadhaarFrontUploaded] = useState(false);
  const [aadhaarBackUploaded, setAadhaarBackUploaded] = useState(false);
  const [panSelected, setPanSelected] = useState(false);
  const [aadhaarFrontSelected, setAadhaarFrontSelected] = useState(false);
  const [aadhaarBackSelected, setAadhaarBackSelected] = useState(false);
  const [uploadingAll, setUploadingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const panRef = useRef<DocumentUploadRef>(null);
  const aadhaarFrontRef = useRef<DocumentUploadRef>(null);
  const aadhaarBackRef = useRef<DocumentUploadRef>(null);

  // Store submissionId in localStorage when it's set
  useEffect(() => {
    if (submissionId) {
      localStorage.setItem('kyc_submission_id', submissionId);
    }
  }, [submissionId]);

  const uploadedCount = [panUploaded, aadhaarFrontUploaded, aadhaarBackUploaded].filter(Boolean).length;
  const selectedCount = [panSelected, aadhaarFrontSelected, aadhaarBackSelected].filter(Boolean).length;

  const handleUploadAll = async () => {
    // Sequential uploads keep submissionId propagation intact.
    setError(null);
    if (selectedCount !== 3) {
      setError('Please select all documents before uploading.');
      return;
    }
    setUploadingAll(true);
    try {
      if (panSelected && !panUploaded) {
        await panRef.current?.triggerUpload();
      }
      if (aadhaarFrontSelected && !aadhaarFrontUploaded) {
        await aadhaarFrontRef.current?.triggerUpload();
      }
      if (aadhaarBackSelected && !aadhaarBackUploaded) {
        await aadhaarBackRef.current?.triggerUpload();
      }
    } catch (err: any) {
      const message = err?.message || 'Upload failed. Please try again.';
      setError(message);
    } finally {
      setUploadingAll(false);
    }
  };

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
              onFileSelected={(selected) => {
                setPanSelected(selected);
                setPanUploaded(false);
              }}
              ref={panRef}
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
              onFileSelected={(selected) => {
                setAadhaarFrontSelected(selected);
                setAadhaarFrontUploaded(false);
              }}
              ref={aadhaarFrontRef}
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
            onFileSelected={(selected) => {
              setAadhaarBackSelected(selected);
              setAadhaarBackUploaded(false);
            }}
            ref={aadhaarBackRef}
          />
        </div>

        <div className="flex flex-col gap-2 rounded-lg border bg-white px-4 py-3 shadow-sm md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm text-gray-700">Selected</p>
            <p className="text-lg font-semibold text-gray-900">{selectedCount}/3 documents ready</p>
          </div>
          <button
            type="button"
            onClick={() => void handleUploadAll()}
            disabled={uploadingAll || selectedCount !== 3}
            className={`rounded px-4 py-2 text-sm font-semibold text-white shadow ${
              uploadingAll || selectedCount !== 3 ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {uploadingAll ? 'Uploading...' : 'Upload All Documents'}
          </button>
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
