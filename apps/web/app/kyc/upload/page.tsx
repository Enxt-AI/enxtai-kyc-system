"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { v4 as uuidv4 } from "uuid";
import {
  ArrowLeft,
  ShieldCheck,
  CloudLightning,
  CheckCircle2,
  ChevronRight,
  Lock,
  Fingerprint,
  FileCheck,
} from "lucide-react";
import { DocumentUpload, DocumentUploadRef } from "@/components/DocumentUpload";
import {
  getKycApiKey,
  initiateKyc,
  initiateDigiLockerAuth,
  fetchDigiLockerDocuments,
  checkDigiLockerStatus,
} from "@/lib/api-client";
import DigiLockerStatus from "@/components/DigiLockerStatus";

export default function KycUploadPage() {
  const router = useRouter();

  // Generate userId once and store in localStorage for consistency across KYC flow
  const [userId, setUserId] = useState<string>("");
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
      router.replace("/?error=session_expired");
    }
  }, [router]);

  useEffect(() => {
    const stored = localStorage.getItem("kyc_user_id");
    if (stored) {
      setUserId(stored);
    } else {
      const newId = uuidv4();
      localStorage.setItem("kyc_user_id", newId);
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
        const existingSessionId = localStorage.getItem("kyc_submission_id");
        if (existingSessionId) {
          setSubmissionId(existingSessionId);
          setKycInitiated(true);
          return;
        }

        // Create new KYC session
        const result = await initiateKyc(userId);
        setSubmissionId(result.kycSessionId);
        localStorage.setItem("kyc_submission_id", result.kycSessionId);
        setKycInitiated(true);
      } catch (error: any) {
        console.error("Failed to initiate KYC session:", error);
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
      localStorage.setItem("kyc_submission_id", submissionId);
    }
  }, [submissionId]);

  const uploadedCount = [
    panUploaded,
    aadhaarFrontUploaded,
    aadhaarBackUploaded,
  ].filter(Boolean).length;
  const selectedCount = [
    panSelected,
    aadhaarFrontSelected,
    aadhaarBackSelected,
  ].filter(Boolean).length;

  const handleUploadAll = async () => {
    // Sequential uploads keep submissionId propagation intact.
    setError(null);
    if (selectedCount !== 3) {
      setError("Please select all documents before uploading.");
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
      const message = err?.message || "Upload failed. Please try again.";
      setError(message);
    } finally {
      setUploadingAll(false);
    }
  };

  const handleDigiLockerAuth = async () => {
    try {
      setDigiLockerError(null);
      if (!submissionId) {
        setDigiLockerError(
          "KYC session is not ready yet. Please wait a moment and try again.",
        );
        return;
      }

      const { authorizationUrl } = await initiateDigiLockerAuth(submissionId);

      // Open DigiLocker authorization in popup window
      const popup = window.open(
        authorizationUrl,
        "DigiLocker Authorization",
        "width=600,height=700,scrollbars=yes",
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

        if (event.data.type === "digilocker_auth_success") {
          setDigiLockerAuthorized(true);
          popup?.close();
          window.removeEventListener("message", handleMessage);
        } else if (event.data.type === "digilocker_auth_error") {
          setDigiLockerError(event.data.error || "Authorization failed");
          popup?.close();
          window.removeEventListener("message", handleMessage);
        }
      };

      window.addEventListener("message", handleMessage);
    } catch (err: any) {
      setDigiLockerError(
        err?.response?.data?.message ||
          "Failed to initiate DigiLocker authorization",
      );
    }
  };

  const handleFetchFromDigiLocker = async () => {
    try {
      setFetchingFromDigiLocker(true);
      setDigiLockerError(null);

      if (!submissionId) {
        setDigiLockerError(
          "KYC session is not ready yet. Please wait a moment and try again.",
        );
        return;
      }

      const result = await fetchDigiLockerDocuments(submissionId, [
        "PAN",
        "AADHAAR",
      ]);

      // Mark documents as uploaded
      if (result.documentsFetched.includes("PAN")) {
        setPanUploaded(true);
      }
      if (result.documentsFetched.includes("AADHAAR")) {
        setAadhaarFrontUploaded(true);
        setAadhaarBackUploaded(true);
      }

      // Show success feedback
      if (result.documentsFetched.length > 0) {
        setDigiLockerError(null);
        // Use a brief success message (will clear error state)
        alert(
          `Successfully fetched: ${result.documentsFetched.join(", ")} from DigiLocker!`,
        );
      } else {
        setDigiLockerError(
          "No documents were fetched. Please check if documents are available in your DigiLocker account.",
        );
      }

      setError(null);
    } catch (err: any) {
      const message =
        err?.response?.data?.message ||
        "Failed to fetch documents from DigiLocker";
      const status = err?.response?.status;
      setDigiLockerError(message);

      // If DigiLocker auth is no longer valid, force the UI back to re-authorize.
      if (
        status === 401 &&
        typeof message === "string" &&
        message.includes("re-authorize DigiLocker")
      ) {
        setDigiLockerAuthorized(false);
      }
    } finally {
      setFetchingFromDigiLocker(false);
    }
  };

  // Show loading state until userId is ready
  if (!isReady) {
    return (
      <main className="min-h-screen bg-slate-50 p-8 flex items-center justify-center">
        <div className="text-center flex flex-col items-center">
          <div className="relative flex items-center justify-center">
            <div className="absolute inset-0 rounded-full border-4 border-blue-100 opacity-20"></div>
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-t-blue-600 border-r-blue-600 border-b-transparent border-l-transparent"></div>
          </div>
          <p className="mt-6 text-sm font-medium text-slate-500 animate-pulse">
            Initializing Secure Session...
          </p>
        </div>
      </main>
    );
  }

  const allUploaded =
    panUploaded && aadhaarFrontUploaded && aadhaarBackUploaded;

  return (
    <main className="min-h-screen bg-slate-50 relative pb-32 font-sans selection:bg-blue-100 selection:text-blue-900">
      {/* Background Decor */}
      <div
        className="pointer-events-none absolute inset-x-0 -top-40 -z-10 transform-gpu overflow-hidden blur-3xl sm:-top-80"
        aria-hidden="true"
      >
        <div
          className="relative left-[calc(50%-11rem)] aspect-[1155/678] w-[36.125rem] -translate-x-1/2 rotate-[30deg] bg-gradient-to-tr from-blue-100 to-indigo-100 opacity-60 sm:left-[calc(50%-30rem)] sm:w-[72.1875rem]"
          style={{
            clipPath:
              "polygon(74.1% 44.1%, 100% 61.6%, 97.5% 26.9%, 85.5% 0.1%, 80.7% 2%, 72.5% 32.5%, 60.2% 62.4%, 52.4% 68.1%, 47.5% 58.3%, 45.2% 34.5%, 27.5% 76.7%, 0.1% 64.9%, 17.9% 100%, 27.6% 76.8%, 76.1% 97.7%, 74.1% 44.1%)",
          }}
        ></div>
      </div>

      <div className="px-4 pt-10 sm:px-6 lg:px-8">
        <header className="mb-10 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="flex-1">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors mb-6 group"
            >
              <ArrowLeft className="h-4 w-4 group-hover:-translate-x-1 transition-transform" />
              Back to Home
            </Link>

            <div className="flex items-center gap-3 mb-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 shadow-lg shadow-blue-500/20">
                <ShieldCheck className="h-5 w-5 text-white" />
              </div>
              <h1 className="text-3xl font-bold tracking-tight text-slate-900">
                Verify Identity
              </h1>
            </div>
            <p className="text-slate-500 text-lg max-w-2xl mt-2 leading-relaxed">
              Upload your documents securely to complete your KYC process.
              {submissionId && uploadedCount > 0 && (
                <span className="mt-1 text-sm font-semibold text-blue-600 bg-blue-50 py-1 px-3 rounded-full inline-block">
                  Session: {submissionId.split("-")[0]}•••
                </span>
              )}
            </p>
          </div>
        </header>

        <div className="flex flex-col lg:flex-row items-stretch gap-8">
          <div className="flex-1 lg:self-center relative overflow-hidden rounded-3xl border border-blue-100 bg-gradient-to-br from-blue-50 via-white to-indigo-50 shadow-xl">
            <img
              src="/digilocker.svg"
              alt="digilocker-logo"
              className="absolute right-0 top-0 w-64 opacity-10 pointer-events-none"
            />

            <div className="relative z-10 p-8 flex flex-col justify-between h-full">
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-semibold text-indigo-700">
                    Recommended
                  </span>
                  <h3 className="text-xl font-bold text-slate-900">
                    Fetch from DigiLocker
                  </h3>
                </div>

                <p className="text-slate-600 mb-5">
                  Securely verify your identity by fetching PAN & Aadhaar
                  directly from DigiLocker. No manual upload required.
                </p>

                <div className="flex gap-6 text-sm text-slate-500 font-medium">
                  <div className="flex items-center gap-1.5">
                    <Lock className="w-4 h-4 text-emerald-500" />
                    256-bit Encryption
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Fingerprint className="w-4 h-4 text-blue-500" />
                    Govt. Verified
                  </div>
                </div>

                {digiLockerError && (
                  <div className="mt-4 p-3 rounded-lg bg-red-50 text-sm text-red-600 border border-red-100">
                    ⚠️ {digiLockerError}
                  </div>
                )}
              </div>

              {/* CTA */}
              <div className="mt-6">
                {!digiLockerAuthorized ? (
                  <button
                    type="button"
                    onClick={handleDigiLockerAuth}
                    className="w-full rounded-xl bg-blue-600 px-5 py-3.5 text-sm font-bold text-white shadow hover:bg-blue-500 transition"
                  >
                    Connect DigiLocker →
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleFetchFromDigiLocker}
                    disabled={fetchingFromDigiLocker}
                    className={`w-full rounded-xl px-5 py-3.5 text-sm font-bold text-white transition ${
                      fetchingFromDigiLocker
                        ? "bg-slate-400 cursor-wait"
                        : "bg-emerald-600 hover:bg-emerald-500"
                    }`}
                  >
                    {fetchingFromDigiLocker
                      ? "Fetching securely..."
                      : "Fetch My Documents"}
                  </button>
                )}
              </div>

              {submissionId && digiLockerAuthorized && (
                <div className="mt-6 border-t pt-4">
                  <DigiLockerStatus
                    submissionId={submissionId}
                    onStatusChange={(status) =>
                      setDigiLockerAuthorized(status.authorized)
                    }
                  />
                </div>
              )}
            </div>
          </div>

          <div className="flex lg:flex-col items-center justify-center text-slate-400 font-bold text-xs tracking-widest">
            <div className="hidden lg:block w-px h-full bg-slate-200" />
            <span className="px-3 py-2">OR</span>
            <div className="hidden lg:block w-px h-full bg-slate-200" />
          </div>

          <div className="flex-1 rounded-3xl border border-slate-200 bg-white shadow-sm p-8 flex flex-col gap-6">
            <h3 className="text-lg font-semibold text-slate-900">
              Upload Documents Manually
            </h3>

            <div className="grid gap-6 md:grid-cols-2 lg:gap-8">
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

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                {error}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Sticky Bottom Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-slate-200 bg-white/80 backdrop-blur-xl shadow-[0_-10px_40px_rgba(0,0,0,0.05)] transform transition-transform pb-safe">
        <div className="mx-auto max-w-5xl px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-6 w-full sm:w-auto">
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                  Upload Progress
                </p>
                <div className="flex items-center gap-2 text-xl font-bold text-slate-900">
                  <span
                    className={
                      uploadedCount === 3 ? "text-emerald-600" : "text-blue-600"
                    }
                  >
                    {uploadedCount}
                  </span>
                  <span className="text-slate-300">/</span>
                  <span>3</span>
                  <span className="text-sm font-medium text-slate-500 ml-1">
                    done
                  </span>
                </div>
              </div>

              <div className="hidden sm:block h-10 w-px bg-slate-200"></div>

              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                  Selected
                </p>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold text-slate-700">
                    {selectedCount}
                  </span>
                  <span className="text-sm font-medium text-slate-500">
                    ready
                  </span>
                </div>
              </div>
            </div>

            <div className="flex w-full sm:w-auto items-center gap-3">
              {selectedCount === 3 && uploadedCount < 3 && !allUploaded && (
                <button
                  type="button"
                  onClick={() => void handleUploadAll()}
                  disabled={uploadingAll}
                  className={`flex-1 sm:flex-none rounded-xl px-6 py-3 text-sm font-bold text-white shadow-md transition-all duration-200 ${
                    uploadingAll
                      ? "bg-slate-400 cursor-wait"
                      : "bg-slate-800 shadow-slate-900/10 hover:bg-slate-700 hover:shadow-lg hover:shadow-slate-900/20"
                  }`}
                >
                  {uploadingAll ? "Uploading All..." : "Upload All Now"}
                </button>
              )}

              <Link
                href="/kyc/photo"
                className={
                  allUploaded ? "flex-1 sm:flex-none" : "w-full sm:w-auto"
                }
              >
                <button
                  type="button"
                  disabled={!allUploaded}
                  className={`group relative flex w-full justify-center rounded-xl px-8 py-3 text-sm font-bold text-white shadow-lg transition-all duration-300 ${
                    allUploaded
                      ? "bg-blue-600 shadow-blue-500/25 hover:bg-blue-500 hover:shadow-xl hover:shadow-blue-500/40 hover:-translate-y-0.5"
                      : "bg-slate-200 text-slate-400 cursor-not-allowed shadow-none"
                  }`}
                >
                  <span className="relative z-10 flex items-center gap-2">
                    Continue to Live Photo{" "}
                    <ChevronRight
                      className={`w-4 h-4 ${allUploaded ? "group-hover:translate-x-1 transition-transform" : ""}`}
                    />
                  </span>
                  {allUploaded && (
                    <div className="absolute inset-0 h-full w-full rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                  )}
                </button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
