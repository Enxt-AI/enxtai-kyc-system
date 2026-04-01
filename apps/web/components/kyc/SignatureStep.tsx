"use client";

import React, { useEffect, useRef, useState } from 'react';
import {
  uploadSignature,
} from '@/lib/api-client';
import { PenTool, CheckCircle2, Image as ImageIcon, Undo, UploadCloud, Trash2 } from 'lucide-react';

interface SignatureStepProps {
  userId: string;
  onNext: () => void;
}

export function SignatureStep({ userId, onNext }: SignatureStepProps) {
  const [uploaded, setUploaded] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'draw' | 'upload'>('draw');
  const [progress, setProgress] = useState(0);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [uploadMethod, setUploadMethod] = useState<'draw' | 'upload' | null>(null);
  const [hasDrawnContent, setHasDrawnContent] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);

  const getCanvasCoords = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const initializeCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  };

  useEffect(() => {
    if (tab === 'draw') {
      initializeCanvas();
    }
  }, [tab]);

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
    const pixelData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    for (let i = 0; i < pixelData.length; i += 4) {
      if (pixelData[i] !== 255 || pixelData[i + 1] !== 255 || pixelData[i + 2] !== 255 || pixelData[i + 3] !== 255) {
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
        setError(err?.response?.data?.message || 'Signature upload failed');
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
      setError(err?.response?.data?.message || 'Signature upload failed');
    } finally {
      setUploading(false);
    }
  };

  const onFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!['image/png', 'image/jpeg'].includes(file.type)) {
      setError('Please select a PNG or JPEG image');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError('File size must be less than 5MB');
      return;
    }

    setSelectedFile(file);
    setError(null);
    const url = URL.createObjectURL(file);
    setFilePreview(url);
  };

  const removeSelectedFile = () => {
    if (filePreview) URL.revokeObjectURL(filePreview);
    setSelectedFile(null);
    setFilePreview(null);
    setError(null);
  };

  const uploadSelectedFile = async () => {
    if (!selectedFile) return;
    await uploadFile(selectedFile);
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 sm:p-10 relative z-20 overflow-y-auto no-scrollbar w-full">
      <div className="flex flex-col h-full w-full animate-in fade-in slide-in-from-right-4 duration-500">
        <h2 className="text-[22px] font-bold text-black mb-2">Signature</h2>
        <p className="text-gray-500 text-sm mb-6 leading-relaxed">
          Please provide your digital signature to finalize your KYC application.
        </p>

        {uploaded && (
          <div className="mb-6 rounded-2xl border transition-all duration-500 border-emerald-200 bg-emerald-50 w-full">
            <div className="p-4 flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl shadow-sm transition-colors duration-500 bg-emerald-500 text-white">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-black">Status</h3>
                <p className="text-xs font-medium mt-0.5 text-emerald-700">Signature saved successfully</p>
              </div>
            </div>
          </div>
        )}

        <div className="flex gap-2 rounded-2xl bg-gray-100 p-1 w-full mb-6 relative">
          <button
            className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-bold rounded-xl transition-all duration-300 ${
              tab === 'draw' ? 'bg-white shadow-sm text-black' : 'text-gray-500'
            } ${uploadMethod === 'upload' ? 'opacity-40 cursor-not-allowed' : ''}`}
            onClick={() => setTab('draw')}
            disabled={uploadMethod === 'upload'}
            type="button"
          >
            <PenTool className="w-3 h-3" /> Draw
          </button>
          <button
            className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-bold rounded-xl transition-all duration-300 ${
              tab === 'upload' ? 'bg-white shadow-sm text-black' : 'text-gray-500'
            } ${uploadMethod === 'draw' ? 'opacity-40 cursor-not-allowed' : ''}`}
            onClick={() => setTab('upload')}
            disabled={uploadMethod === 'draw'}
            type="button"
          >
            <ImageIcon className="w-3 h-3" /> Upload
          </button>
        </div>

        {tab === 'draw' && (
          <div className={`space-y-4 w-full ${uploadMethod === 'draw' ? 'opacity-50 grayscale pointer-events-none' : ''}`}>
            <div className="relative rounded-[2rem] border-2 border-dashed border-gray-200 bg-[#FDFDFD] overflow-hidden group mb-4">
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-10">
                <span className="text-3xl font-black tracking-widest uppercase">Sign Here</span>
              </div>
              <canvas
                ref={canvasRef}
                width={800}
                height={400}
                className="w-full relative z-10 bg-transparent cursor-crosshair touch-none aspect-video"
                onPointerDown={startDraw}
                onPointerMove={moveDraw}
                onPointerUp={endDraw}
                onPointerLeave={endDraw}
              />
            </div>

            {!uploaded && (
              <div className="flex items-center justify-between gap-4">
                <button
                  type="button"
                  className="flex items-center justify-center gap-2 rounded-full border border-gray-300 px-4 py-2 text-xs font-bold text-gray-600 hover:bg-gray-50 transition-colors w-1/3"
                  onClick={clearCanvas}
                  disabled={uploading}
                >
                  <Undo className="w-3 h-3 mr-1" /> Clear
                </button>

                <button
                  type="button"
                  className="flex-1 rounded-full bg-black px-4 py-2 text-sm font-bold text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={uploadFromCanvas}
                  disabled={uploading || !hasDrawnContent}
                >
                  {uploading ? `Saving... ${progress}%` : "Save Signature"}
                </button>
              </div>
            )}
          </div>
        )}

        {tab === 'upload' && (
          <div className={`space-y-4 w-full ${uploadMethod === 'upload' ? 'opacity-50 grayscale pointer-events-none' : ''}`}>
            {!selectedFile ? (
              <label className="flex w-full flex-col items-center justify-center rounded-[2rem] border-2 border-dashed border-gray-200 bg-[#FDFDFD] hover:bg-gray-50 p-8 text-center transition-all cursor-pointer">
                <input type="file" accept="image/png,image/jpeg" className="hidden" onChange={onFileSelected} />
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-gray-100">
                  <UploadCloud className="h-6 w-6 text-gray-400" />
                </div>
                <span className="text-sm font-bold text-black mb-1">Click to upload</span>
                <span className="text-[10px] font-medium text-gray-500">PNG or JPEG, up to 5MB</span>
              </label>
            ) : (
              <div className="rounded-[1.5rem] border border-gray-200 bg-[#FDFDFD] p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white border border-gray-200 shadow-sm">
                      <ImageIcon className="h-5 w-5 text-black" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-black truncate max-w-[120px]">{selectedFile.name}</p>
                      <p className="text-[10px] font-medium text-gray-500">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</p>
                    </div>
                  </div>

                  {!uploaded && (
                    <button type="button" onClick={removeSelectedFile} disabled={uploading} className="p-2 text-gray-400 hover:text-red-500 rounded-full transition-colors disabled:opacity-50">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {filePreview && (
                  <div className="rounded-xl border border-gray-200 bg-white overflow-hidden p-2 flex flex-col items-center">
                    <img src={filePreview} alt="Signature preview" className="max-h-24 w-auto mix-blend-multiply" />
                  </div>
                )}

                {!uploaded && (
                  <button
                    type="button"
                    onClick={uploadSelectedFile}
                    disabled={uploading}
                    className="w-full rounded-full bg-black py-3 text-sm font-bold text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {uploading ? `Saving... ${progress}%` : "Upload File"}
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="mt-4 text-center text-xs font-semibold text-red-500">
            {error}
          </div>
        )}

        <div className="mt-auto pt-8 mb-4 sm:mb-6 flex flex-col items-center w-full">
          <button
            type="button"
            disabled={!uploaded}
            onClick={() => onNext()}
            className="w-full sm:w-[300px] rounded-[2rem] bg-black py-4 text-sm font-bold text-white shadow-[0_8px_20px_rgba(0,0,0,0.15)] transition-transform active:scale-95 disabled:bg-gray-300 disabled:shadow-none mb-6"
          >
            Submit
          </button>
        </div>

      </div>
    </div>
  );
}
