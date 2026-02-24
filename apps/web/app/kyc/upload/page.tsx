"use client";

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { v4 as uuidv4 } from 'uuid';
import { DocumentUpload, DocumentUploadRef } from '@/components/DocumentUpload';
import { getKycApiKey, initiateKyc, initiateDigiLockerAuth, fetchDigiLockerDocuments, checkDigiLockerStatus } from '@/lib/api-client';
import DigiLockerStatus from '@/components/DigiLockerStatus';

export default function KycUploadPage() {
  const router = useRouter();

  // Generate userId once and store in localStorage for consistency across KYC flow
  const [userId, setUserId] = useState<string>('');
  const [isReady, setIsReady] = useState(false);
  const [kycInitiated, setKycInitiated] = useState(false);

  /**
   * API Key Validation Guard
   *
   * Validates API key presence and expiry on component mount.
   * Redirects to hero page if key missing or expired.
   *
   * @remarks
   * **Security Flow**:
   * 1. Check sessionStorage for kyc_api_key
   * 2. Validate 30-minute expiry timestamp
   * 3. Redirect to hero if invalid (with error message)
   * 4. Allow page render if valid
   *
   * **Error Messages**:
   * - `?error=session_expired`: Key expired (30min TTL)
   * - `?error=key_required`: Key missing (direct URL access)
   */
  useEffect(() => {
    try {
      const apiKey = getKycApiKey();
      // Key is valid, proceed with page
    } catch (error) {
      // API key missing or invalid - redirect to hero
      router.replace('/?error=session_expired');
    }
  }, [router]);

  useEffect(() => {
    const stored = localStorage.getItem('kyc_user_id');
    if (stored) {
      setUserId(stored);
    } else {
      const newId = uuidv4();
      localStorage.setItem('kyc_user_id', newId);
      setUserId(newId);
    }
    setIsReady(true);
  }, []);

  // Initialize KYC session when userId is ready
  useEffect(() => {
    if (!userId || kycInitiated) return;

    const initSession = async () => {
      try {
        // Check if session already exists in localStorage
        const existingSessionId = localStorage.getItem('kyc_submission_id');
        if (existingSessionId) {
          setSubmissionId(existingSessionId);
          setKycInitiated(true);
          return;
        }

        // Create new KYC session
        const result = await initiateKyc(userId);
        setSubmissionId(result.kycSessionId);
        localStorage.setItem('kyc_submission_id', result.kycSessionId);
        setKycInitiated(true);
      } catch (error: any) {
        console.error('Failed to initiate KYC session:', error);
        // If initiate fails due to user already existing, that's fine - proceed
        if (error?.response?.status === 409) {
          setKycInitiated(true);
        }
      }
    };

    initSession();
  }, [userId, kycInitiated]);

  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [panUploaded, setPanUploaded] = useState(false);
  const [aadhaarFrontUploaded, setAadhaarFrontUploaded] = useState(false);
  const [aadhaarBackUploaded, setAadhaarBackUploaded] = useState(false);
  const [panSelected, setPanSelected] = useState(false);
  const [aadhaarFrontSelected, setAadhaarFrontSelected] = useState(false);
  const [aadhaarBackSelected, setAadhaarBackSelected] = useState(false);
  const [uploadingAll, setUploadingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [digiLockerAuthorized, setDigiLockerAuthorized] = useState(false);
  const [fetchingFromDigiLocker, setFetchingFromDigiLocker] = useState(false);
  const [digiLockerError, setDigiLockerError] = useState<string | null>(null);

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

  const handleDigiLockerAuth = async () => {
    try {
      setDigiLockerError(null);
      if (!submissionId) {
        setDigiLockerError('KYC session is not ready yet. Please wait a moment and try again.');
        return;
      }

      const { authorizationUrl } = await initiateDigiLockerAuth(submissionId);

      // Open DigiLocker authorization in popup window
      const popup = window.open(
        authorizationUrl,
        'DigiLocker Authorization',
        'width=600,height=700,scrollbars=yes'
      );

      // Listen for callback completion
      const handleMessage = (event: MessageEvent) => {
        // Validate origin to prevent spoofed messages
        const allowedOrigins = new Set<string>([window.location.origin]);
        try {
          const apiUrl = process.env.NEXT_PUBLIC_API_URL;
          if (apiUrl) {
            allowedOrigins.add(new URL(apiUrl).origin);
          }
        } catch {
          // ignore
        }

        if (!allowedOrigins.has(event.origin)) {
          return; // Ignore messages from unauthorized origins
        }

        if (event.data.type === 'digilocker_auth_success') {
          setDigiLockerAuthorized(true);
          popup?.close();
          window.removeEventListener('message', handleMessage);
        } else if (event.data.type === 'digilocker_auth_error') {
          setDigiLockerError(event.data.error || 'Authorization failed');
          popup?.close();
          window.removeEventListener('message', handleMessage);
        }
      };

      window.addEventListener('message', handleMessage);
    } catch (err: any) {
      setDigiLockerError(err?.response?.data?.message || 'Failed to initiate DigiLocker authorization');
    }
  };

  const handleFetchFromDigiLocker = async () => {
    try {
      setFetchingFromDigiLocker(true);
      setDigiLockerError(null);

      if (!submissionId) {
        setDigiLockerError('KYC session is not ready yet. Please wait a moment and try again.');
        return;
      }

      const result = await fetchDigiLockerDocuments(submissionId, ['PAN', 'AADHAAR']);

      // Mark documents as uploaded
      if (result.documentsFetched.includes('PAN')) {
        setPanUploaded(true);
      }
      if (result.documentsFetched.includes('AADHAAR')) {
        setAadhaarFrontUploaded(true);
        setAadhaarBackUploaded(true);
      }

      // Show success feedback
      if (result.documentsFetched.length > 0) {
        setDigiLockerError(null);
        // Use a brief success message (will clear error state)
        alert(`Successfully fetched: ${result.documentsFetched.join(', ')} from DigiLocker!`);
      } else {
        setDigiLockerError('No documents were fetched. Please check if documents are available in your DigiLocker account.');
      }

      setError(null);
    } catch (err: any) {
      const message = err?.response?.data?.message || 'Failed to fetch documents from DigiLocker';
      const status = err?.response?.status;
      setDigiLockerError(message);

      // If DigiLocker auth is no longer valid, force the UI back to re-authorize.
      if (status === 401 && typeof message === 'string' && message.includes('re-authorize DigiLocker')) {
        setDigiLockerAuthorized(false);
      }
    } finally {
      setFetchingFromDigiLocker(false);
    }
  };

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

        {/* DigiLocker Integration Section */}
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-blue-900">Fetch from DigiLocker</h3>
              <p className="mt-1 text-xs text-blue-700">
                Automatically fetch your PAN and Aadhaar documents from DigiLocker
              </p>
              {digiLockerError && (
                <p className="mt-2 text-xs text-red-600">{digiLockerError}</p>
              )}
            </div>
            <div className="flex gap-2">
              {!digiLockerAuthorized ? (
                <button
                  type="button"
                  onClick={handleDigiLockerAuth}
                  className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-blue-700"
                >
                  Authorize DigiLocker
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleFetchFromDigiLocker}
                  disabled={fetchingFromDigiLocker}
                  className={`rounded px-4 py-2 text-sm font-semibold text-white shadow ${
                    fetchingFromDigiLocker
                      ? 'bg-gray-400 cursor-not-allowed'
                      : 'bg-green-600 hover:bg-green-700'
                  }`}
                >
                  {fetchingFromDigiLocker ? 'Fetching...' : 'Fetch Documents'}
                </button>
              )}
            </div>
          </div>
          {submissionId && (
            <div className="mt-3">
              <DigiLockerStatus
                submissionId={submissionId}
                onStatusChange={(status) => setDigiLockerAuthorized(status.authorized)}
              />
            </div>
          )}
        </div>

        <div className="flex items-center gap-4">
          <div className="h-px flex-1 bg-slate-200" />
          <span className="text-xs font-medium text-slate-500">OR UPLOAD MANUALLY</span>
          <div className="h-px flex-1 bg-slate-200" />
        </div>

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
