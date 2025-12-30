"use client";

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Webcam from 'react-webcam';
import type { UploadDocumentResponse } from '@enxtai/shared-types';
import { uploadLivePhoto } from '@/lib/api-client';
import pico from 'picojs';

interface Props {
  userId: string;
  onUploadSuccess: (url: string) => void;
  onUploadError: (error: string) => void;
}

const MAX_SIZE_BYTES = 5 * 1024 * 1024;
const MIN_WIDTH = 800;
const MIN_HEIGHT = 600;

export function WebcamCapture({ userId, onUploadSuccess, onUploadError }: Props) {
  const webcamRef = useRef<Webcam>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const facefinderRef = useRef<any>(null);
  const memoryRef = useRef<any>(null);

  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [faceDetected, setFaceDetected] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [successUrl, setSuccessUrl] = useState<string | null>(null);
  const [cascadeLoaded, setCascadeLoaded] = useState(false);
  const [timeoutReached, setTimeoutReached] = useState(false);
  const [faceCheckElapsed, setFaceCheckElapsed] = useState(0);

  // Load cascade for pico face detection
  useEffect(() => {
    let cancelled = false;
    memoryRef.current = pico.instantiate_detection_memory?.(5) ?? null;
    canvasRef.current = document.createElement('canvas');

    async function loadCascade() {
      try {
        const response = await fetch(
          'https://raw.githubusercontent.com/nenadmarkus/pico/master/picojs/facefinder',
        );
        const buffer = await response.arrayBuffer();
        const bytes = new Int8Array(buffer);
        const unpacked = pico.unpack_cascade?.(bytes);
        if (!cancelled) {
          facefinderRef.current = unpacked;
          setCascadeLoaded(true);
          setFaceDetected(false);
        }
      } catch (e) {
        if (!cancelled) {
          console.warn('Failed to load face detection cascade', e);
          setTimeout(() => {
            if (!cancelled) setCascadeLoaded(false);
          }, 2000);
        }
      }
    }

    void loadCascade();

    const interval = setInterval(() => {
      detectFace();
      setFaceCheckElapsed((prev) => prev + 500);
      if (faceCheckElapsed + 500 >= 5000) {
        setTimeoutReached(true);
      }
    }, 500);

    return () => {
      cancelled = true;
      clearInterval(interval);
      const video = webcamRef.current?.video as HTMLVideoElement | undefined;
      const stream = video?.srcObject as MediaStream | null | undefined;
      stream?.getTracks().forEach((t) => t.stop());
      if (canvasRef.current) {
        canvasRef.current.width = 0;
        canvasRef.current.height = 0;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const detectFace = useCallback(() => {
    const video = webcamRef.current?.video as HTMLVideoElement | undefined;
    if (!cascadeLoaded) {
      return;
    }
    const facefinder = facefinderRef.current;
    const memory = memoryRef.current;
    const canvas = canvasRef.current;
    if (!video || !facefinder || !memory || !canvas || video.videoWidth === 0) {
      return;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const rgba = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const gray = pico.to_grayscale?.(rgba, canvas.height, canvas.width);
    if (!gray) return;

    const image = {
      pixels: gray,
      nrows: canvas.height,
      ncols: canvas.width,
      ldim: canvas.width,
    };

    const params = {
      shiftfactor: 0.1,
      minsize: 100,
      maxsize: 1000,
      scalefactor: 1.1,
    };

    let dets = pico.run_cascade?.(image, facefinder, params) ?? [];
    dets = memory(dets);
    dets = pico.cluster_detections?.(dets, 0.2) ?? [];

    const hasFace = dets.some((d: any) => d[3] > 50);
    setFaceDetected(hasFace);
  }, [cascadeLoaded]);

  const onUserMedia = useCallback(() => {
    setCameraReady(true);
    setPermissionDenied(false);
  }, []);

  const onUserMediaError = useCallback((err: string | DOMException) => {
    const name = typeof err === 'string' ? err : err.name;
    if (name === 'NotAllowedError') {
      setPermissionDenied(true);
      setError('Camera permission denied. Please enable camera access and retry.');
    } else if (name === 'NotFoundError') {
      setError('No camera detected. Please connect a camera and refresh.');
    } else {
      setError('Unable to access camera.');
    }
  }, []);

  const validateCapturedImage = useCallback(async (dataUrl: string) => {
    const response = await fetch(dataUrl);
    const blob = await response.blob();
    if (blob.size > MAX_SIZE_BYTES) {
      throw new Error('Image size exceeds 5MB. Please try again.');
    }

    const img = new Image();
    const loadPromise = new Promise<void>((resolve, reject) => {
      img.onload = () => {
        const width = img.width;
        const height = img.height;
        if (width < MIN_WIDTH || height < MIN_HEIGHT) {
          reject(new Error('Image quality too low. Please ensure at least 800x600 resolution.'));
        } else {
          resolve();
        }
      };
      img.onerror = () => reject(new Error('Failed to read captured image.'));
    });
    img.src = dataUrl;
    await loadPromise;
    return blob;
  }, []);

  const handleCapture = useCallback(async () => {
    const allowWithoutDetection = !cascadeLoaded || timeoutReached;
    if (!faceDetected && !allowWithoutDetection) {
      setError('Waiting for face... Position your face in the frame.');
      return;
    }
    const screenshot = webcamRef.current?.getScreenshot();
    if (!screenshot) {
      setError('Unable to capture photo. Please try again.');
      return;
    }
    try {
      await validateCapturedImage(screenshot);
      setCapturedImage(screenshot);
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? 'Image validation failed');
    }
  }, [faceDetected, validateCapturedImage]);

  const handleUpload = useCallback(async () => {
    if (!capturedImage) return;
    setUploading(true);
    setProgress(0);
    setError(null);
    try {
      const blob = await validateCapturedImage(capturedImage);
      const file = new File([blob], 'live-photo.jpg', { type: 'image/jpeg' });
      const res: UploadDocumentResponse = await uploadLivePhoto(userId, file, (p) => setProgress(p));
      setProgress(100);
      setSuccessUrl(res.documentUrl);
      onUploadSuccess(res.documentUrl);
    } catch (e: any) {
      const msg = e?.response?.data?.message || e?.message || 'Upload failed. Please try again';
      setError(msg);
      onUploadError(msg);
    } finally {
      setUploading(false);
    }
  }, [capturedImage, onUploadError, onUploadSuccess, userId, validateCapturedImage]);

  const handleRetake = useCallback(() => {
    setCapturedImage(null);
    setError(null);
    setProgress(0);
    setSuccessUrl(null);
    setFaceCheckElapsed(0);
    setTimeoutReached(false);
  }, []);

  const canCapture = cameraReady && !permissionDenied && (faceDetected || !cascadeLoaded || timeoutReached);
  const captureLabel = faceDetected
    ? 'Capture Photo'
    : timeoutReached
      ? 'Capture Anyway (low confidence)'
      : 'Waiting for face...';

  return (
    <div className="w-full max-w-3xl mx-auto space-y-4">
      <div
        className={`relative overflow-hidden rounded-lg border ${
          faceDetected ? 'border-green-500' : 'border-gray-300'
        } ${capturedImage ? 'bg-gray-900' : 'bg-black'} min-h-[320px]`}
      >
        {!capturedImage ? (
          <Webcam
            ref={webcamRef}
            audio={false}
            mirrored
            onUserMedia={onUserMedia}
            onUserMediaError={onUserMediaError}
            screenshotFormat="image/jpeg"
            videoConstraints={{ facingMode: 'user' }}
            className="w-full h-full"
          />
        ) : (
          <img src={capturedImage} alt="Captured" className="w-full h-full object-contain bg-black" />
        )}
        {!cameraReady && !permissionDenied && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-white text-sm">
            Initializing camera...
          </div>
        )}
        {permissionDenied && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-white text-sm px-4 text-center">
            Camera permission denied. Please enable camera access in your browser settings and refresh.
          </div>
        )}
        {!capturedImage && cameraReady && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-1 text-xs font-medium text-white bg-black/60">
            {faceDetected ? 'Face detected. Ready to capture.' : 'Waiting for face...'}
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        {!capturedImage ? (
          <button
            type="button"
            onClick={handleCapture}
            disabled={!canCapture}
            className={`rounded px-4 py-2 text-sm font-semibold text-white shadow ${
              !canCapture
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {captureLabel}
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={handleRetake}
              className="rounded px-4 py-2 text-sm font-semibold text-gray-800 bg-gray-100 hover:bg-gray-200 shadow"
            >
              Retake
            </button>
            <button
              type="button"
              onClick={handleUpload}
              disabled={uploading}
              className={`rounded px-4 py-2 text-sm font-semibold text-white shadow ${
                uploading ? 'bg-gray-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'
              }`}
            >
              {uploading ? 'Uploading...' : 'Upload'}
            </button>
          </>
        )}
      </div>

      {uploading && (
        <div className="w-full">
          <div className="h-2 w-full rounded bg-gray-200">
            <div className="h-2 rounded bg-blue-500 transition-all" style={{ width: `${progress}%` }} />
          </div>
          <p className="mt-1 text-xs text-gray-600">Uploading... {progress}%</p>
        </div>
      )}

      {successUrl && (
        <div className="rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
          Live photo uploaded successfully.
        </div>
      )}

      {(!cascadeLoaded || timeoutReached) && !capturedImage && (
        <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Using fallback mode - ensure your face is clear and well-lit.
        </div>
      )}

      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}
    </div>
  );
}
