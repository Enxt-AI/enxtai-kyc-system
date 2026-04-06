"use client";

import React, { useEffect, useRef, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { DocumentUploadRef } from "@/components/DocumentUpload";
import {
  initiateKyc,
  initiateDigiLockerAuth,
  fetchDigiLockerDocuments,
} from "@/lib/api-client";
import { useDispatch, useSelector } from "react-redux";
import { RootState } from "@/lib/store/store";
import {
  setPanUploaded,
  setAadhaarFrontUploaded,
  setAadhaarBackUploaded,
} from "@/lib/store/features/kycSlice";

import { PanVerification } from "./PanVerification";
import { AadhaarUpload } from "./AadhaarUpload";

interface DocumentUploadStepProps {
  userId: string;
  onNext: () => void;
  onStateRestored?: (step: number) => void;
}

export function DocumentUploadStep({
  userId,
  onNext,
  onStateRestored,
}: DocumentUploadStepProps) {
  const [kycInitiated, setKycInitiated] = useState(false);
  const [submissionId, setSubmissionId] = useState<string | null>(null);

  const dispatch = useDispatch();
  const panUploaded = useSelector((s: RootState) => s.kyc.panUploaded);
  const aadhaarFrontUploaded = useSelector(
    (s: RootState) => s.kyc.aadhaarFrontUploaded
  );
  const aadhaarBackUploaded = useSelector(
    (s: RootState) => s.kyc.aadhaarBackUploaded
  );

  const [aadhaarFrontSelected, setAadhaarFrontSelected] = useState(false);
  const [aadhaarBackSelected, setAadhaarBackSelected] = useState(false);

  const [uploadingAll, setUploadingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [digiLockerAuthorized, setDigiLockerAuthorized] = useState(false);
  const [fetchingFromDigiLocker, setFetchingFromDigiLocker] = useState(false);
  const [digiLockerError, setDigiLockerError] = useState<string | null>(null);

  const aadhaarFrontRef = useRef<DocumentUploadRef>(null);
  const aadhaarBackRef = useRef<DocumentUploadRef>(null);

  // 🔹 INIT KYC
  useEffect(() => {
    if (!userId || kycInitiated) return;

    const init = async () => {
      try {
        const res = await initiateKyc(userId);

        setSubmissionId(res.kycSessionId);
        localStorage.setItem("kyc_submission_id", res.kycSessionId);
        setKycInitiated(true);

        if (res.completedSteps) {
          if (res.completedSteps.includes("pan"))
            dispatch(setPanUploaded(true));

          if (res.completedSteps.includes("aadhaar")) {
            dispatch(setAadhaarFrontUploaded(true));
            dispatch(setAadhaarBackUploaded(true));
          }
        }

        if (res.uiStep && onStateRestored) {
          onStateRestored(res.uiStep);
        }
      } catch (err: any) {
        if (err?.response?.status === 409) {
          setKycInitiated(true);
        }
      }
    };

    init();
  }, [userId]);

  // 🔹 SAVE submissionId
  useEffect(() => {
    if (submissionId) {
      localStorage.setItem("kyc_submission_id", submissionId);
    }
  }, [submissionId]);

  const selectedCount = [
    aadhaarFrontSelected,
    aadhaarBackSelected,
  ].filter(Boolean).length;

  // 🔹 UPLOAD ALL
  const handleUploadAll = async () => {
    setError(null);

    if (selectedCount !== 2) {
      setError("Select Aadhaar front & back before uploading.");
      return;
    }

    setUploadingAll(true);

    try {
      if (!aadhaarFrontUploaded && aadhaarFrontRef.current) {
        await aadhaarFrontRef.current.triggerUpload();
      }

      if (!aadhaarBackUploaded && aadhaarBackRef.current) {
        await aadhaarBackRef.current.triggerUpload();
      }
    } catch (err: any) {
      setError(err?.message || "Upload failed.");
    } finally {
      setUploadingAll(false);
    }
  };

  // 🔹 DIGILOCKER AUTH
  const handleDigiLockerAuth = async () => {
    try {
      setDigiLockerError(null);

      if (!submissionId) {
        setDigiLockerError("KYC session not ready.");
        return;
      }

      const { authorizationUrl } = await initiateDigiLockerAuth(submissionId);

      const popup = window.open(
        authorizationUrl,
        "DigiLocker",
        "width=600,height=700"
      );

      if (!popup) {
        setDigiLockerError("Popup blocked. Allow popups.");
        return;
      }

      const handleMessage = (event: MessageEvent) => {
        const allowed = [window.location.origin];

        try {
          const apiUrl = process.env.NEXT_PUBLIC_API_URL;
          if (apiUrl) allowed.push(new URL(apiUrl).origin);
        } catch {}

        if (!allowed.includes(event.origin)) return;

        if (event.data.type === "digilocker_auth_success") {
          setDigiLockerAuthorized(true);
          cleanup();
        }

        if (event.data.type === "digilocker_auth_error") {
          setDigiLockerError("Authorization failed");
          cleanup();
        }
      };

      const cleanup = () => {
        window.removeEventListener("message", handleMessage);
        if (!popup.closed) popup.close();
      };

      window.addEventListener("message", handleMessage);

      const interval = setInterval(() => {
        if (popup.closed) {
          cleanup();
          clearInterval(interval);
        }
      }, 500);
    } catch (err: any) {
      setDigiLockerError("Failed to connect DigiLocker");
    }
  };

  // 🔹 FETCH PAN
  const handleFetchFromDigiLocker = async () => {
    try {
      setFetchingFromDigiLocker(true);
      setDigiLockerError(null);

      const res = await fetchDigiLockerDocuments(submissionId!, ["PAN"]);

      if (res.documentsFetched.includes("PAN")) {
        dispatch(setPanUploaded(true));
        // Note: we do not move to next step automatically because they still need Aadhaar.
      } else {
        setDigiLockerError("No PAN found");
      }
    } catch {
      setDigiLockerError("Fetch failed");
    } finally {
      setFetchingFromDigiLocker(false);
    }
  };

  const allUploaded = panUploaded && aadhaarFrontUploaded && aadhaarBackUploaded;

  return (
    <div className="flex flex-col items-center justify-center p-6">
      {!panUploaded && (
        <PanVerification
          digiLockerError={digiLockerError}
          digiLockerAuthorized={digiLockerAuthorized}
          fetchingFromDigiLocker={fetchingFromDigiLocker}
          onDigiLockerAuth={handleDigiLockerAuth}
          onFetchFromDigiLocker={handleFetchFromDigiLocker}
        />
      )}

      {panUploaded && !(aadhaarFrontUploaded && aadhaarBackUploaded) && (
        <AadhaarUpload
          userId={userId}
          submissionId={submissionId}
          setError={setError}
          setAadhaarFrontSelected={setAadhaarFrontSelected}
          setAadhaarBackSelected={setAadhaarBackSelected}
          aadhaarFrontRef={aadhaarFrontRef}
          aadhaarBackRef={aadhaarBackRef}
          error={error}
          uploadingAll={uploadingAll}
          handleUploadAll={handleUploadAll}
        />
      )}

      {allUploaded && (
        <>
          <CheckCircle2 className="w-12 h-12 text-green-500 mb-2" />
          <p className="text-lg font-medium text-gray-800 mb-4">All documents uploaded perfectly</p>
          <button 
            onClick={onNext}
            className="w-full max-w-sm py-3 px-4 bg-gray-900 text-white rounded-xl font-medium shadow hover:bg-gray-800"
          >
            Continue
          </button>
        </>
      )}
    </div>
  );
}
