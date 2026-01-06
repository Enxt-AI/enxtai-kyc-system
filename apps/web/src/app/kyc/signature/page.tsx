"use client";

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createKYCSubmission, getKYCSubmission, uploadSignature } from '@/lib/api-client';

export default function KycSignaturePage() {
  // Retrieve userId from localStorage (set during document upload)
  const [userId, setUserId] = useState<string>('11111111-1111-1111-1111-111111111111');
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [uploaded, setUploaded] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'draw' | 'upload'>('draw');
  const [progress, setProgress] = useState(0);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);

  // Load userId from localStorage on client side only
  useEffect(() => {
    const storedUserId = localStorage.getItem('kyc_user_id') ?? process.env.NEXT_PUBLIC_TEST_USER_ID ?? '11111111-1111-1111-1111-111111111111';
    setUserId(storedUserId);
  }, []);
  const [uploadMethod, setUploadMethod] = useState<'draw' | 'upload' | null>(null);
  const [hasDrawnContent, setHasDrawnContent] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);
  const router = useRouter();

  const getCanvasCoords = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    // Account for CSS scaling vs. intrinsic canvas size
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  useEffect(() => {
    async function init() {
      try {
        const existing = await getKYCSubmission(userId);
        if (existing?.id) {
          setSubmissionId(existing.id);
          localStorage.setItem('kyc_submission_id', existing.id);
        } else {
          const res = await createKYCSubmission(userId);
          setSubmissionId(res.id);
          localStorage.setItem('kyc_submission_id', res.id);
        }
      } catch (err: any) {
        const message = err?.response?.data?.message || 'Unable to start submission';
        setError(message);
      }
    }
    void init();
  }, [userId]);

  const initializeCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    // Fill with white background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // Set drawing style
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  };

  useEffect(() => {
    initializeCanvas();
  }, []);

  const startDraw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const point = getCanvasCoords(e);
    if (!point) return;
    lastPoint.current = point;
    drawing.current = true;
  };

  const moveDraw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const current = getCanvasCoords(e);
    if (!current) return;
    if (lastPoint.current) {
      ctx.beginPath();
      ctx.moveTo(lastPoint.current.x, lastPoint.current.y);
      ctx.lineTo(current.x, current.y);
      ctx.stroke();
      setHasDrawnContent(true);
    }
    lastPoint.current = current;
  };

  const endDraw = () => {
    drawing.current = false;
    lastPoint.current = null;
  };

  const isCanvasEmpty = () => {
    const canvas = canvasRef.current;
    if (!canvas) return true;
    const ctx = canvas.getContext('2d');
    if (!ctx) return true;
    
    // Get pixel data
    const pixelData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    
    // Check if all pixels are white (255, 255, 255, 255)
    for (let i = 0; i < pixelData.length; i += 4) {
      const r = pixelData[i];
      const g = pixelData[i + 1];
      const b = pixelData[i + 2];
      const a = pixelData[i + 3];
      
      // If any pixel is not white, canvas has content
      if (r !== 255 || g !== 255 || b !== 255 || a !== 255) {
        return false;
      }
    }
    
    return true;
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setHasDrawnContent(false);
  };

  const uploadFromCanvas = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    // Validate canvas is not empty
    if (isCanvasEmpty()) {
      setError('Please draw your signature before uploading');
      return;
    }
    
    setUploading(true);
    setError(null);
    setProgress(0);
    canvas.toBlob(async (blob) => {
      if (!blob) {
        setUploading(false);
        setError('Unable to generate signature image');
        return;
      }
      const file = new File([blob], 'signature.png', { type: 'image/png' });
      try {
        await uploadSignature(userId, file, setProgress);
        setUploaded(true);
        setUploadMethod('draw');
      } catch (err: any) {
        const message = err?.response?.data?.message || 'Signature upload failed';
        setError(message);
      } finally {
        setUploading(false);
      }
    }, 'image/png');
  };

  const uploadFile = async (file: File) => {
    setUploading(true);
    setError(null);
    setProgress(0);
    try {
      await uploadSignature(userId, file, setProgress);
      setUploaded(true);
      setUploadMethod('upload');
    } catch (err: any) {
      const message = err?.response?.data?.message || 'Signature upload failed';
      setError(message);
    } finally {
      setUploading(false);
    }
  };

  const onFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Validate file type
    if (!['image/png', 'image/jpeg'].includes(file.type)) {
      setError('Please select a PNG or JPEG image');
      return;
    }
    
    // Validate file size (5MB)
    if (file.size > 5 * 1024 * 1024) {
      setError('File size must be less than 5MB');
      return;
    }
    
    setSelectedFile(file);
    setError(null);
    
    // Create preview
    const url = URL.createObjectURL(file);
    setFilePreview(url);
  };

  const removeSelectedFile = () => {
    if (filePreview) {
      URL.revokeObjectURL(filePreview);
    }
    setSelectedFile(null);
    setFilePreview(null);
    setError(null);
  };

  const uploadSelectedFile = async () => {
    if (!selectedFile) return;
    await uploadFile(selectedFile);
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-gray-50 via-white to-gray-50 p-6 sm:p-10">
      <div className="mx-auto max-w-5xl space-y-8">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-gray-500">Submission ID: {submissionId ?? '...'}</p>
            <h1 className="text-3xl font-semibold text-gray-900">Digital Signature</h1>
            <p className="text-sm text-gray-700 mt-1">
              Draw your signature or upload a scanned signature image (PNG/JPEG, max 5MB).
            </p>
          </div>
          <Link href="/kyc/photo" className="text-blue-600 hover:underline text-sm font-semibold">
            Back to Live Photo
          </Link>
        </header>

        <div className="rounded-xl border border-gray-200 bg-white p-4 sm:p-6 shadow-sm space-y-6">
          <div className="flex gap-2 rounded-full bg-gray-100 p-1 w-fit">
            <button
              className={`px-4 py-2 text-sm font-semibold rounded-full transition ${
                tab === 'draw' ? 'bg-white shadow text-gray-900' : 'text-gray-600'
              } ${uploadMethod === 'upload' ? 'opacity-50 cursor-not-allowed' : ''}`}
              onClick={() => setTab('draw')}
              disabled={uploadMethod === 'upload'}
              type="button"
            >
              Draw Signature
            </button>
            <button
              className={`px-4 py-2 text-sm font-semibold rounded-full transition ${
                tab === 'upload' ? 'bg-white shadow text-gray-900' : 'text-gray-600'
              } ${uploadMethod === 'draw' ? 'opacity-50 cursor-not-allowed' : ''}`}
              onClick={() => setTab('upload')}
              disabled={uploadMethod === 'draw'}
              type="button"
            >
              Upload Image
            </button>
          </div>

          {tab === 'draw' && (
            <div className="space-y-4">
              <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4">
                <canvas
                  ref={canvasRef}
                  width={600}
                  height={300}
                  className="w-full rounded bg-white shadow-inner cursor-crosshair"
                  onPointerDown={startDraw}
                  onPointerMove={moveDraw}
                  onPointerUp={endDraw}
                  onPointerLeave={endDraw}
                />
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  className="rounded-full bg-blue-600 px-5 py-2 text-sm font-semibold text-white shadow hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={uploadFromCanvas}
                  disabled={uploading || !hasDrawnContent}
                >
                  {uploading ? `Uploading... ${progress}%` : 'Upload Signature'}
                </button>
                <button
                  type="button"
                  className="rounded-full bg-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-300"
                  onClick={clearCanvas}
                  disabled={uploading}
                >
                  Clear
                </button>
              </div>
            </div>
          )}

          {tab === 'upload' && (
            <div className="space-y-4">
              {!selectedFile && (
                <label className="flex w-full flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 p-6 text-center text-gray-600 hover:border-blue-400 hover:text-blue-600 cursor-pointer">
                  <input type="file" accept="image/png,image/jpeg" className="hidden" onChange={onFileSelected} />
                  <span className="text-sm font-semibold">Click to upload signature image</span>
                  <span className="text-xs text-gray-500">PNG or JPEG, max 5MB</span>
                </label>
              )}
              
              {selectedFile && (
                <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-gray-800">{selectedFile.name}</p>
                        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700">Selected</span>
                      </div>
                      <p className="text-xs text-gray-500">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</p>
                    </div>
                    <button
                      type="button"
                      onClick={removeSelectedFile}
                      disabled={uploading}
                      className="text-xs text-red-600 hover:underline disabled:opacity-50"
                    >
                      Remove
                    </button>
                  </div>
                  
                  {filePreview && (
                    <img src={filePreview} alt="Signature preview" className="max-h-48 w-auto rounded border" />
                  )}
                  
                  <button
                    type="button"
                    onClick={uploadSelectedFile}
                    disabled={uploading}
                    className="w-full rounded-full bg-blue-600 px-5 py-2 text-sm font-semibold text-white shadow hover:bg-blue-700 disabled:opacity-50"
                  >
                    {uploading ? `Uploading... ${progress}%` : 'Upload Signature'}
                  </button>
                </div>
              )}
            </div>
          )}

          {uploaded && (
            <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-green-800 text-sm">
              ✓ Signature uploaded successfully via {uploadMethod === 'draw' ? 'drawing' : 'image upload'}. You can proceed.
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800 text-sm">
              {error}
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => router.push('/kyc/verify')}
              disabled={!uploaded}
              className={`rounded-full px-5 py-2 text-sm font-semibold text-white shadow transition ${
                uploaded ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-400 cursor-not-allowed'
              }`}
            >
              Continue
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
