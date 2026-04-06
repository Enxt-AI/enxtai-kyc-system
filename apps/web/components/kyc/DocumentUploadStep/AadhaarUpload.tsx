"use client";

import React, { SetStateAction } from "react";
import { DocumentUpload, DocumentUploadRef } from "@/components/DocumentUpload";
import { useDispatch } from "react-redux";
import {
  setAadhaarFrontUploaded,
  setAadhaarBackUploaded,
} from "@/lib/store/features/kycSlice";

interface AadhaarUploadProps {
  userId: string;
  submissionId: string | null;
  setError: React.Dispatch<SetStateAction<string | null>>;
  setAadhaarFrontSelected: (s: boolean) => void;
  setAadhaarBackSelected: (s: boolean) => void;
  aadhaarFrontRef: React.RefObject<DocumentUploadRef | null>;
  aadhaarBackRef: React.RefObject<DocumentUploadRef | null>;
  error: string | null;
  uploadingAll: boolean;
  handleUploadAll: () => void;
}

export function AadhaarUpload({
  userId,
  submissionId,
  setError,
  setAadhaarFrontSelected,
  setAadhaarBackSelected,
  aadhaarFrontRef,
  aadhaarBackRef,
  error,
  uploadingAll,
  handleUploadAll,
}: AadhaarUploadProps) {
  const dispatch = useDispatch();

  return (
    <>
      <h2 className="text-xl font-bold mb-4">Aadhaar</h2>

      <DocumentUpload
        documentType="AADHAAR_FRONT"
        userId={userId}
        submissionId={submissionId}
        onUploadSuccess={() => dispatch(setAadhaarFrontUploaded(true))}
        onUploadError={setError}
        onFileSelected={(s) => {
          setAadhaarFrontSelected(s);
          if (s) dispatch(setAadhaarFrontUploaded(false));
        }}
        ref={aadhaarFrontRef}
      />

      <DocumentUpload
        documentType="AADHAAR_BACK"
        userId={userId}
        submissionId={submissionId}
        onUploadSuccess={() => dispatch(setAadhaarBackUploaded(true))}
        onUploadError={setError}
        onFileSelected={(s) => {
          setAadhaarBackSelected(s);
          if (s) dispatch(setAadhaarBackUploaded(false));
        }}
        ref={aadhaarBackRef}
      />

      {error && <p className="text-red-500">{error}</p>}

      <button onClick={handleUploadAll} disabled={uploadingAll}>
        {uploadingAll ? "Uploading..." : "Upload Aadhaar Documents"}
      </button>
    </>
  );
}
