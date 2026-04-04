"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
} from "lucide-react";
import { DocumentUpload, DocumentUploadRef } from "@/components/DocumentUpload";
import {
  initiateKyc,
  initiateDigiLockerAuth,
  fetchDigiLockerDocuments,
  checkDigiLockerStatus,
} from "@/lib/api-client";
import DigiLockerStatus from "@/components/DigiLockerStatus";
import { useDispatch, useSelector } from "react-redux";
import { RootState } from "@/lib/store/store";
import { setPanUploaded, setAadhaarFrontUploaded, setAadhaarBackUploaded } from "@/lib/store/features/kycSlice";

interface UploadStepProps {
  userId: string;
  onNext: () => void;
  onStateRestored?: (step: 'upload' | 'photo' | 'signature' | 'verify') => void;
}

export function UploadStep({ userId, onNext, onStateRestored }: UploadStepProps) {
  const [kycInitiated, setKycInitiated] = useState(false);
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  
  const dispatch = useDispatch();
  const panUploaded = useSelector((state: RootState) => state.kyc.panUploaded);
  const aadhaarFrontUploaded = useSelector((state: RootState) => state.kyc.aadhaarFrontUploaded);
  const aadhaarBackUploaded = useSelector((state: RootState) => state.kyc.aadhaarBackUploaded);
  
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

  // Initialize KYC session
  useEffect(() => {
    if (!userId || kycInitiated) return;

    const initSession = async () => {
      try {
        const result = await initiateKyc(userId);
        setSubmissionId(result.kycSessionId);
        localStorage.setItem("kyc_submission_id", result.kycSessionId);
        setKycInitiated(true);
        
        // Always sync backend completion metrics immediately into Redux!
        if (result.completedSteps) {
          if (result.completedSteps.includes('pan')) dispatch(setPanUploaded(true));
          if (result.completedSteps.includes('aadhaar')) {
            dispatch(setAadhaarFrontUploaded(true));
            dispatch(setAadhaarBackUploaded(true));
          }
        }
        
        // If the backend has a formally saved uiStep, fast-forward the frontend to it.
        if (result.uiStep && ['upload', 'photo', 'signature', 'verify'].includes(result.uiStep)) {
          if (onStateRestored) {
            onStateRestored(result.uiStep as any);
          }
        }
      } catch (error: any) {
        console.error("Failed to initiate KYC session:", error);
        if (error?.response?.status === 409) {
          setKycInitiated(true); // User conflict probably means existing
        }
      }
    };
    initSession();
  }, [userId, kycInitiated, onStateRestored]);

  useEffect(() => {
    if (submissionId) {
      localStorage.setItem("kyc_submission_id", submissionId);
    }
  }, [submissionId]);

  const selectedCount = [
    panSelected,
    aadhaarFrontSelected,
    aadhaarBackSelected,
  ].filter(Boolean).length;

  const handleUploadAll = async () => {
    setError(null);
    if (selectedCount !== 3) {
      setError("Please select all documents before uploading.");
      return;
    }
    setUploadingAll(true);
    try {
      if (panSelected && !panUploaded) await panRef.current?.triggerUpload();
      if (aadhaarFrontSelected && !aadhaarFrontUploaded) await aadhaarFrontRef.current?.triggerUpload();
      if (aadhaarBackSelected && !aadhaarBackUploaded) await aadhaarBackRef.current?.triggerUpload();
    } catch (err: any) {
      setError(err?.message || "Upload failed. Please try again.");
    } finally {
      setUploadingAll(false);
    }
  };

  const handleDigiLockerAuth = async () => {
    try {
      setDigiLockerError(null);
      if (!submissionId) {
        setDigiLockerError("KYC session is not ready yet. Please wait.");
        return;
      }

      const { authorizationUrl } = await initiateDigiLockerAuth(submissionId);
      const popup = window.open(authorizationUrl, "DigiLocker Authorization", "width=600,height=700,scrollbars=yes");

      const handleMessage = (event: MessageEvent) => {
        const allowedOrigins = new Set<string>([window.location.origin]);
        try {
          const apiUrl = process.env.NEXT_PUBLIC_API_URL;
          if (apiUrl) allowedOrigins.add(new URL(apiUrl).origin);
        } catch { /* ignore */ }

        if (!allowedOrigins.has(event.origin)) return;

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
      setDigiLockerError(err?.response?.data?.message || "Failed to initiate DigiLocker authorization");
    }
  };

  const handleFetchFromDigiLocker = async () => {
    try {
      setFetchingFromDigiLocker(true);
      setDigiLockerError(null);

      if (!submissionId) {
        setDigiLockerError("KYC session is not ready yet.");
        return;
      }

      const result = await fetchDigiLockerDocuments(submissionId, ["PAN"]);
      if (result.documentsFetched.includes("PAN")) dispatch(setPanUploaded(true));

      if (result.documentsFetched.length > 0) {
        setDigiLockerError(null);
        alert(`Successfully fetched: ${result.documentsFetched.join(", ")} from DigiLocker!`);
      } else {
        setDigiLockerError("No documents were fetched. Please check if documents are available.");
      }
      setError(null);
    } catch (err: any) {
      const message = err?.response?.data?.message || "Failed to fetch documents from DigiLocker";
      const status = err?.response?.status;
      setDigiLockerError(message);

      if (status === 401 && typeof message === "string" && message.includes("re-authorize DigiLocker")) {
        setDigiLockerAuthorized(false);
      }
    } finally {
      setFetchingFromDigiLocker(false);
    }
  };

  const allUploaded = panUploaded && aadhaarFrontUploaded && aadhaarBackUploaded;

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 sm:p-10 relative z-20 overflow-y-auto no-scrollbar">
      {!panUploaded ? (
        // STEP 1: PAN CARD (DigiLocker)
        <div className="flex flex-col w-full h-full animate-in fade-in slide-in-from-right-4 duration-500">
          <h2 className="text-[22px] font-bold text-black mb-2">Pan Card</h2>
          <p className="text-gray-500 text-sm mb-8 leading-relaxed">
            Please link your DigiLocker for completing your first step of KYC securely.
          </p>

          <div className="mb-6 flex flex-col gap-2">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Method</span>
            <div className="h-12 border rounded-xl flex items-center px-4 bg-gray-50 text-gray-900 font-medium">
              DigiLocker Verification
            </div>
          </div>

          {digiLockerError && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 text-xs text-red-600 border border-red-100 text-center">
              {digiLockerError}
            </div>
          )}

          <div className="rounded-[2rem] border-2 border-dashed border-gray-200 p-8 flex flex-col items-center justify-center text-center mt-auto mb-8 bg-[#FDFDFD]">
            <img src="/digilocker.svg" alt="DigiLocker" className="h-10 mb-4 opacity-80 mix-blend-multiply" />
            <p className="text-sm font-medium text-gray-600 mb-6">Connect to fetch PAN automatically</p>

            {!digiLockerAuthorized ? (
              <button type="button" onClick={handleDigiLockerAuth} className="rounded-full bg-white border-2 border-black px-8 py-3 text-sm font-bold text-black hover:bg-gray-50 transition-colors w-full sm:w-auto">
                Connect
              </button>
            ) : (
              <button type="button" onClick={handleFetchFromDigiLocker} disabled={fetchingFromDigiLocker} className={`rounded-full w-full sm:w-auto px-8 py-3 text-sm font-bold transition-colors ${fetchingFromDigiLocker ? "bg-gray-200 text-gray-500" : "bg-black text-white hover:bg-gray-800 shadow-[0_4px_14px_0_rgb(0,0,0,0.39)]"}`}>
                {fetchingFromDigiLocker ? "Fetching..." : "Fetch PAN"}
              </button>
            )}
            
            {submissionId && digiLockerAuthorized && (
              <div className="mt-6 border-t border-gray-100 pt-6 w-full">
                <DigiLockerStatus submissionId={submissionId} onStatusChange={(status) => setDigiLockerAuthorized(status.authorized)} />
              </div>
            )}
          </div>
        </div>
      ) : !(aadhaarFrontUploaded && aadhaarBackUploaded) ? (
        // STEP 2: AADHAAR CARD
        <div className="flex flex-col w-full h-full animate-in fade-in slide-in-from-right-4 duration-500">
          <h2 className="text-[22px] font-bold text-black mb-2">Aadhaar Card</h2>
          <p className="text-gray-500 text-sm mb-6 leading-relaxed">
            Please upload your Aadhaar card below for completing your KYC details.
          </p>

          <div className="space-y-6 flex-1 overflow-y-auto no-scrollbar pr-2 pb-4">
            {/* Front Upload */}
            <div className={`transition-all duration-300 ${aadhaarFrontUploaded ? 'opacity-50 grayscale' : ''}`}>
              <div className="text-sm font-semibold text-gray-700 mb-2 flex items-center justify-between">
                Aadhaar Card (Front)
                {aadhaarFrontUploaded && <CheckCircle2 className="w-4 h-4 text-black" />}
              </div>
              <div className="rounded-2xl border border-gray-200 p-4 bg-[#FDFDFD] shadow-sm">
                 <DocumentUpload
                    documentType="AADHAAR_FRONT"
                    userId={userId}
                    submissionId={submissionId}
                    onSubmissionCreated={setSubmissionId}
                    onUploadSuccess={() => { dispatch(setAadhaarFrontUploaded(true)); setError(null); }}
                    onUploadError={(msg) => setError(msg)}
                    onFileSelected={(selected) => { setAadhaarFrontSelected(selected); dispatch(setAadhaarFrontUploaded(false)); }}
                    ref={aadhaarFrontRef}
                  />
              </div>
            </div>

            {/* Back Upload */}
            <div className={`transition-all duration-300 ${aadhaarBackUploaded ? 'opacity-50 grayscale' : ''}`}>
              <div className="text-sm font-semibold text-gray-700 mb-2 flex items-center justify-between">
                Aadhaar Card (Back)
                {aadhaarBackUploaded && <CheckCircle2 className="w-4 h-4 text-black" />}
              </div>
              <div className="rounded-2xl border border-gray-200 p-4 bg-[#FDFDFD] shadow-sm">
                 <DocumentUpload
                    documentType="AADHAAR_BACK"
                    userId={userId}
                    submissionId={submissionId}
                    onSubmissionCreated={setSubmissionId}
                    onUploadSuccess={() => { dispatch(setAadhaarBackUploaded(true)); setError(null); }}
                    onUploadError={(msg) => setError(msg)}
                    onFileSelected={(selected) => { setAadhaarBackSelected(selected); dispatch(setAadhaarBackUploaded(false)); }}
                    ref={aadhaarBackRef}
                  />
              </div>
            </div>
          </div>

          {error && (
            <div className="mt-4 text-center text-xs font-semibold text-red-500 bg-red-50 p-3 rounded-lg border border-red-100">
              {error}
            </div>
          )}

          <div className="mt-auto pt-6 flex flex-col items-center">
            {(aadhaarFrontSelected || aadhaarBackSelected) && !(aadhaarFrontUploaded && aadhaarBackUploaded) && (
               <button
                  type="button"
                  onClick={handleUploadAll}
                  disabled={uploadingAll}
                  className="w-full sm:w-[300px] rounded-[2rem] bg-black py-4 text-sm font-bold text-white shadow-[0_8px_20px_rgba(0,0,0,0.15)] transition-transform active:scale-95 disabled:bg-gray-300 disabled:shadow-none mb-6"
               >
                 {uploadingAll ? "Uploading..." : "Upload Selected"}
               </button>
            )}
            {allUploaded && (
                 <button
                    type="button"
                    onClick={() => onNext()}
                    className="w-full sm:w-[300px] rounded-[2rem] bg-black py-4 text-sm font-bold text-white shadow-[0_8px_20px_rgba(0,0,0,0.15)] transition-transform active:scale-95 mb-6"
                 >
                   Continue
                 </button>
            )}
          </div>
        </div>
      ) : (
         // ALL UPLOADED
         <div className="flex flex-col w-full h-full items-center justify-center text-center animate-in fade-in duration-500 my-auto">
            <div className="w-16 h-16 rounded-full bg-black flex items-center justify-center text-white mb-6 shadow-lg">
               <CheckCircle2 className="w-8 h-8" />
            </div>
            <h2 className="text-[22px] font-bold text-black mb-2">Documents Saved</h2>
            <p className="text-gray-500 text-sm mb-10">
              Your PAN and Aadhaar have been securely verified.
            </p>

            <button
                type="button"
                onClick={() => onNext()}
                className="w-full sm:w-[300px] mt-auto sm:mt-0 rounded-[2rem] bg-black py-4 text-sm font-bold text-white shadow-[0_8px_20px_rgba(0,0,0,0.15)] transition-transform active:scale-95"
            >
              Proceed
            </button>
         </div>
      )}
    </div>
  );
}
