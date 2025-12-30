"use client";

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useDropzone, FileRejection } from 'react-dropzone';
import { uploadAadhaarBack, uploadAadhaarDocument, uploadAadhaarFront, uploadPanDocument } from '@/lib/api-client';

const MAX_SIZE = 5 * 1024 * 1024;

export type DocumentUploadType = 'PAN' | 'AADHAAR' | 'AADHAAR_FRONT' | 'AADHAAR_BACK';

interface Props {
  documentType: DocumentUploadType;
  userId: string;
  submissionId?: string | null;
  onUploadSuccess: (url: string) => void;
  onUploadError: (error: string) => void;
  onSubmissionCreated?: (id: string) => void;
}

export function DocumentUpload({ documentType, userId, submissionId, onUploadSuccess, onUploadError, onSubmissionCreated }: Props) {
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

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
  }, [preview]);

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
        onUploadSuccess(url);
      } catch (err: any) {
        const message = err?.response?.data?.message || err?.message || 'Upload failed. Please try again';
        setError(message);
        onUploadError(message);
      } finally {
        setUploading(false);
      }
    },
    [documentType, onUploadError, onSubmissionCreated, onUploadSuccess, submissionId, userId],
  );

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
      if (file.type.startsWith('image/')) {
        const url = URL.createObjectURL(file);
        setPreview(url);
      } else {
        setPreview(null);
      }
      void handleUpload(file);
    },
    [handleUpload, onUploadError],
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
            <p className="text-sm font-medium text-gray-800">{uploadedFile.name}</p>
            <p className="text-xs text-gray-500">{(uploadedFile.size / 1024 / 1024).toFixed(2)} MB</p>
            {preview && (
              <img src={preview} alt="preview" className="mt-2 h-32 w-auto rounded" />
            )}
            {!preview && uploadedFile.type === 'application/pdf' && (
              <div className="mt-2 inline-flex items-center rounded bg-gray-100 px-2 py-1 text-xs text-gray-700">PDF file</div>
            )}
          </div>
          <button
            type="button"
            onClick={clearSelection}
            className="text-xs text-red-600 hover:underline"
          >
            Remove
          </button>
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
}
