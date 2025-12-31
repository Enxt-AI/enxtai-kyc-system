"use client";

import React, {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
  forwardRef,
} from 'react';
import { useDropzone, FileRejection } from 'react-dropzone';
import {
  deleteAadhaarBack,
  deleteAadhaarFront,
  deletePanDocument,
  uploadAadhaarBack,
  uploadAadhaarDocument,
  uploadAadhaarFront,
  uploadPanDocument,
} from '@/lib/api-client';

const MAX_SIZE = 5 * 1024 * 1024;

export type DocumentUploadType = 'PAN' | 'AADHAAR' | 'AADHAAR_FRONT' | 'AADHAAR_BACK';

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
  ({ documentType, userId, submissionId, onUploadSuccess, onUploadError, onSubmissionCreated, onFileSelected }, ref) => {
    const [uploadedFile, setUploadedFile] = useState<File | null>(null);
    const [preview, setPreview] = useState<string | null>(null);
    const [uploading, setUploading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [isUploaded, setIsUploaded] = useState(false); // Track actual upload to MinIO
    const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);

    const accept = useMemo(
      () => ({
        'image/jpeg': ['.jpg', '.jpeg'],
        'image/png': ['.png'],
        'application/pdf': ['.pdf'],
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
          let uploader: (userId: string, file: File, onProgress?: (p: number) => void) => Promise<any>;

          if (documentType === 'PAN') {
            uploader = uploadPanDocument;
          } else if (documentType === 'AADHAAR_FRONT') {
            uploader = uploadAadhaarFront;
          } else if (documentType === 'AADHAAR_BACK') {
            uploader = uploadAadhaarBack;
          } else {
            uploader = uploadAadhaarDocument; // Legacy fallback
          }

          const res = await uploader(userId, file, (p) => setProgress(p));
          setProgress(100);
          const url = res.documentUrl;
          if (!url) {
            throw new Error('Upload succeeded but URL was not returned');
          }
          const responseSubmissionId = res.submissionId ?? submissionId;
          if (responseSubmissionId && onSubmissionCreated) {
            onSubmissionCreated(responseSubmissionId);
          }
          setIsUploaded(true);
          setUploadedUrl(url);
          onUploadSuccess(url);
        } catch (err: any) {
          const message = err?.response?.data?.message || err?.message || 'Upload failed. Please try again';
          setError(message);
          onUploadError(message);
          throw new Error(message);
        } finally {
          setUploading(false);
        }
      },
      [documentType, onUploadError, onSubmissionCreated, onUploadSuccess, submissionId, userId],
    );

    const triggerUpload = useCallback(async () => {
      if (!uploadedFile) {
        setError('Please select a file before uploading');
        onUploadError('Please select a file before uploading');
        return;
      }
      await handleUpload(uploadedFile);
    }, [handleUpload, onUploadError, uploadedFile]);

    useImperativeHandle(ref, () => ({ triggerUpload }), [triggerUpload]);

    const handleRemove = useCallback(async () => {
      if (uploading) return;

      try {
        if (isUploaded && uploadedUrl) {
          if (documentType === 'PAN') {
            await deletePanDocument(userId, submissionId ?? undefined);
          } else if (documentType === 'AADHAAR_FRONT') {
            await deleteAadhaarFront(userId, submissionId ?? undefined);
          } else if (documentType === 'AADHAAR_BACK') {
            await deleteAadhaarBack(userId, submissionId ?? undefined);
          }
        }
      } catch (err: any) {
        const message = err?.response?.data?.message || err?.message || 'Failed to remove document';
        setError(message);
        onUploadError(message);
      } finally {
        clearSelection();
      }
    }, [clearSelection, documentType, isUploaded, onUploadError, submissionId, uploadedUrl, uploading, userId]);

    const onDrop = useCallback(
      (acceptedFiles: File[], rejectedFiles: FileRejection[]) => {
        if (rejectedFiles.length > 0) {
          const reason = rejectedFiles[0].errors[0]?.message ?? 'Invalid file. Please upload JPEG, PNG, or PDF under 5MB';
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
        if (file.type.startsWith('image/')) {
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
        const reason = rejections[0]?.errors[0]?.message ?? 'Invalid file. Please upload JPEG, PNG, or PDF under 5MB';
        setError(reason);
        onUploadError(reason);
      },
    });

    return (
      <div className="w-full border border-dashed border-gray-300 rounded-lg p-4 bg-white shadow-sm">
        <div
          {...getRootProps()}
          className={`cursor-pointer rounded-md border-2 border-dashed p-6 text-center transition ${
            isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400'
          }`}
        >
          <input {...getInputProps()} />
          <p className="text-sm text-gray-700 font-semibold mb-1">{documentType} Document</p>
          <p className="text-xs text-gray-500">Drag & drop or click to upload</p>
          <p className="text-xs text-gray-400 mt-2">JPEG, PNG, PDF • Max 5MB</p>
        </div>

        {uploadedFile && (
          <div className="mt-4 flex items-start gap-3">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-gray-800">{uploadedFile.name}</p>
                {isUploaded ? (
                  <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">Uploaded</span>
                ) : (
                  <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700">Selected</span>
                )}
              </div>
              <p className="text-xs text-gray-500">{(uploadedFile.size / 1024 / 1024).toFixed(2)} MB</p>
              {preview && (
                <img src={preview} alt="preview" className="mt-2 h-32 w-auto rounded" />
              )}
              {!preview && uploadedFile.type === 'application/pdf' && (
                <div className="mt-2 inline-flex items-center rounded bg-gray-100 px-2 py-1 text-xs text-gray-700">PDF file</div>
              )}
            </div>
            <div className="flex flex-col items-end gap-2">
              <button
                type="button"
                onClick={() => void handleRemove()}
                className="text-xs text-red-600 hover:underline"
              >
                Remove
              </button>
              {!isUploaded && uploadedFile && !uploading && (
                <button
                  type="button"
                  onClick={() => triggerUpload().catch(() => {})}
                  className="text-xs text-blue-600 hover:underline"
                >
                  Upload now
                </button>
              )}
            </div>
          </div>
        )}

        {uploading && (
          <div className="mt-3">
            <div className="h-2 w-full rounded bg-gray-200">
              <div
                className="h-2 rounded bg-blue-500 transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="mt-1 text-xs text-gray-500">Uploading... {progress}%</p>
          </div>
        )}

        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </div>
    );
  },
);

DocumentUpload.displayName = 'DocumentUpload';
