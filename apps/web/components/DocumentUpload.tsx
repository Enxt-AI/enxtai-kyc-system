"use client";

import React, {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
  forwardRef,
} from "react";
import { useDropzone, FileRejection } from "react-dropzone";
import {
  UploadCloud,
  FileImage,
  FileText,
  File as FileIcon,
  CheckCircle2,
  Trash2,
  AlertCircle,
} from "lucide-react";
import {
  deleteAadhaarBack,
  deleteAadhaarFront,
  deletePanDocument,
  uploadAadhaarBack,
  uploadAadhaarDocument,
  uploadAadhaarFront,
  uploadPanDocument,
} from "@/lib/api-client";

const MAX_SIZE = 5 * 1024 * 1024;

export type DocumentUploadType =
  | "PAN"
  | "AADHAAR"
  | "AADHAAR_FRONT"
  | "AADHAAR_BACK";

// Deferred upload pattern: files are selected and previewed locally, but actual upload
// to MinIO happens only when the parent triggers `triggerUpload()` via ref.
export interface DocumentUploadRef {
  triggerUpload: () => Promise<void>;
}

interface Props {
  documentType: DocumentUploadType;
  userId: string;
  submissionId?: string | null;
  onUploadSuccess: (url: string) => void;
  onUploadError: (error: string) => void;
  onSubmissionCreated?: (id: string) => void;
  onFileSelected?: (selected: boolean) => void;
}
export const DocumentUpload = forwardRef<DocumentUploadRef, Props>(
  (
    {
      documentType,
      userId,
      submissionId,
      onUploadSuccess,
      onUploadError,
      onSubmissionCreated,
      onFileSelected,
    },
    ref,
  ) => {
    const [uploadedFile, setUploadedFile] = useState<File | null>(null);
    const [preview, setPreview] = useState<string | null>(null);
    const [uploading, setUploading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [isUploaded, setIsUploaded] = useState(false); // Track actual upload to MinIO
    const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);

    const accept = useMemo(
      () => ({
        "image/jpeg": [".jpg", ".jpeg"],
        "image/png": [".png"],
        "application/pdf": [".pdf"],
      }),
      [],
    );

    const clearSelection = useCallback(() => {
      if (preview) URL.revokeObjectURL(preview);
      setUploadedFile(null);
      setPreview(null);
      setProgress(0);
      setError(null);
      setIsUploaded(false);
      setUploadedUrl(null);
      onFileSelected?.(false);
    }, [onFileSelected, preview]);

    useEffect(() => {
      return () => {
        if (preview) URL.revokeObjectURL(preview);
      };
    }, [preview]);

    const handleUpload = useCallback(
      async (file: File) => {
        setUploading(true);
        setError(null);
        setProgress(0);
        setIsUploaded(false);
        setUploadedUrl(null);
        try {
          let uploader: (
            userId: string,
            file: File,
            onProgress?: (p: number) => void,
          ) => Promise<any>;

          if (documentType === "PAN") {
            uploader = uploadPanDocument;
          } else if (documentType === "AADHAAR_FRONT") {
            uploader = uploadAadhaarFront;
          } else if (documentType === "AADHAAR_BACK") {
            uploader = uploadAadhaarBack;
          } else {
            uploader = uploadAadhaarDocument; // Legacy fallback
          }

          const res = await uploader(userId, file, (p) => setProgress(p));
          setProgress(100);
          const url = res.documentUrl;
          if (!url) {
            throw new Error("Upload succeeded but URL was not returned");
          }
          const responseSubmissionId = res.submissionId ?? submissionId;
          if (responseSubmissionId && onSubmissionCreated) {
            onSubmissionCreated(responseSubmissionId);
          }
          setIsUploaded(true);
          setUploadedUrl(url);
          onUploadSuccess(url);
        } catch (err: any) {
          const message =
            err?.response?.data?.message ||
            err?.message ||
            "Upload failed. Please try again";
          setError(message);
          onUploadError(message);
          throw new Error(message);
        } finally {
          setUploading(false);
        }
      },
      [
        documentType,
        onUploadError,
        onSubmissionCreated,
        onUploadSuccess,
        submissionId,
        userId,
      ],
    );

    const triggerUpload = useCallback(async () => {
      if (!uploadedFile) {
        setError("Please select a file before uploading");
        onUploadError("Please select a file before uploading");
        return;
      }
      await handleUpload(uploadedFile);
    }, [handleUpload, onUploadError, uploadedFile]);

    useImperativeHandle(ref, () => ({ triggerUpload }), [triggerUpload]);

    const handleRemove = useCallback(async () => {
      if (uploading) return;

      try {
        if (isUploaded && uploadedUrl) {
          if (documentType === "PAN") {
            await deletePanDocument(userId, submissionId ?? undefined);
          } else if (documentType === "AADHAAR_FRONT") {
            await deleteAadhaarFront(userId, submissionId ?? undefined);
          } else if (documentType === "AADHAAR_BACK") {
            await deleteAadhaarBack(userId, submissionId ?? undefined);
          }
        }
      } catch (err: any) {
        const message =
          err?.response?.data?.message ||
          err?.message ||
          "Failed to remove document";
        setError(message);
        onUploadError(message);
      } finally {
        clearSelection();
      }
    }, [
      clearSelection,
      documentType,
      isUploaded,
      onUploadError,
      submissionId,
      uploadedUrl,
      uploading,
      userId,
    ]);

    const onDrop = useCallback(
      (acceptedFiles: File[], rejectedFiles: FileRejection[]) => {
        if (rejectedFiles.length > 0) {
          const reason =
            rejectedFiles[0].errors[0]?.message ??
            "Invalid file. Please upload JPEG, PNG, or PDF under 5MB";
          setError(reason);
          onUploadError(reason);
          return;
        }
        const file = acceptedFiles[0];
        if (!file) return;
        setUploadedFile(file);
        setIsUploaded(false);
        onFileSelected?.(true);
        // Store file locally for preview only. Upload will be triggered externally via ref.
        if (file.type.startsWith("image/")) {
          const url = URL.createObjectURL(file);
          setPreview(url);
        } else {
          setPreview(null);
        }
      },
      [onFileSelected, onUploadError],
    );

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
      onDrop,
      accept,
      maxFiles: 1,
      maxSize: MAX_SIZE,
      onDropRejected: (rejections) => {
        const reason =
          rejections[0]?.errors[0]?.message ??
          "Invalid file. Please upload JPEG, PNG, or PDF under 5MB";
        setError(reason);
        onUploadError(reason);
      },
    });

    return (
      <div className="w-full relative group rounded-2xl border border-gray-200 bg-white/50 backdrop-blur-xl p-5 shadow-sm transition-all hover:shadow-md">
        <div
          {...getRootProps()}
          className={`relative cursor-pointer overflow-hidden rounded-xl border-2 border-dashed p-8 text-center transition-all duration-300 ${
            isDragActive
              ? "border-blue-500 bg-blue-50/80 shadow-[0_0_20px_rgba(59,130,246,0.1)] scale-[1.02]"
              : "border-slate-300 bg-slate-50/50 hover:border-blue-400 hover:bg-slate-50"
          }`}
        >
          <input {...getInputProps()} />
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-slate-100 group-hover:scale-110 transition-transform duration-300">
            <UploadCloud
              className={`h-7 w-7 ${isDragActive ? "text-blue-500" : "text-slate-400 group-hover:text-blue-500"}`}
            />
          </div>
          <p className="text-base font-medium text-slate-700 mb-1">
            {documentType} Document
          </p>
          <p className="text-sm text-slate-500 mb-4">
            <span className="font-semibold text-blue-600">Click to upload</span>{" "}
            or drag and drop
          </p>
          <div className="flex items-center justify-center gap-2 text-xs font-medium text-slate-400 uppercase tracking-wider">
            <span>JPEG</span>
            <span className="w-1 h-1 rounded-full bg-slate-300"></span>
            <span>PNG</span>
            <span className="w-1 h-1 rounded-full bg-slate-300"></span>
            <span>PDF</span>
            <span className="w-1 h-1 rounded-full bg-slate-300"></span>
            <span>Max 5MB</span>
          </div>
        </div>

        {uploadedFile && (
          <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-all duration-300 animate-in slide-in-from-bottom-2 fade-in">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-slate-50 border border-slate-100">
                {uploadedFile.type === "application/pdf" ? (
                  <FileText className="h-6 w-6 text-rose-500" />
                ) : (
                  <FileImage className="h-6 w-6 text-blue-500" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-sm font-semibold text-slate-800 truncate">
                    {uploadedFile.name}
                  </p>
                  {isUploaded ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold tracking-wide text-emerald-600 ring-1 ring-inset ring-emerald-500/20">
                      <CheckCircle2 className="w-3 h-3" /> UPLOADED
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold tracking-wide text-amber-600 ring-1 ring-inset ring-amber-500/20">
                      SELECTED
                    </span>
                  )}
                </div>
                <p className="text-xs font-medium text-slate-500">
                  {(uploadedFile.size / 1024 / 1024).toFixed(2)} MB
                </p>

                {preview && (
                  <div className="mt-3 overflow-hidden rounded-lg border border-slate-100 bg-slate-50">
                    <img
                      src={preview}
                      alt="preview"
                      className="h-32 w-full object-contain mix-blend-multiply"
                    />
                  </div>
                )}
              </div>

              <div className="flex flex-col items-end gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => void handleRemove()}
                  className="flex items-center justify-center w-8 h-8 rounded-full text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                  title="Remove document"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
                {!isUploaded && uploadedFile && !uploading && (
                  <button
                    type="button"
                    onClick={() => triggerUpload().catch(() => {})}
                    className="mt-2 rounded-md bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 transition-colors"
                  >
                    Upload now
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {uploading && (
          <div className="mt-4 animate-in fade-in slide-in-from-top-2">
            <div className="flex justify-between items-center mb-1.5">
              <span className="text-xs font-medium text-slate-600">
                Uploading document...
              </span>
              <span className="text-xs font-bold text-blue-600">
                {progress}%
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-blue-500 transition-all duration-300 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {error && (
          <div className="mt-4 flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-600 border border-red-100 animate-in fade-in">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <p className="font-medium">{error}</p>
          </div>
        )}
      </div>
    );
  },
);

DocumentUpload.displayName = "DocumentUpload";
