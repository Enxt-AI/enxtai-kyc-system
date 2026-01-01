"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Webcam from 'react-webcam';
import type { UploadDocumentResponse } from '@enxtai/shared-types';
import { uploadLivePhoto } from '@/lib/api-client';

// Dynamic imports for MediaPipe (ESM modules)
type FaceDetector = any;
type Detection = any;

interface Props {
  userId: string;
  onUploadSuccess: (url: string) => void;
  onUploadError: (error: string) => void;
}

const MAX_SIZE_BYTES = 5 * 1024 * 1024;
const MIN_WIDTH = 800;
const MIN_HEIGHT = 600;
const DOWNSCALE_FACTOR = 0.5;
const BRIGHTNESS_MIN = 60;
const BRIGHTNESS_MAX = 200;
const SHARPNESS_MIN = 20;
const CENTER_TOLERANCE = 0.25; // Relaxed from 0.18
const AREA_MIN = 0.08; // Relaxed from 0.1
const AREA_MAX = 0.75; // Relaxed from 0.7
const STABLE_MS = 500; // Faster from 1000ms
const MIN_FACE_SCORE = 0.7; // MediaPipe confidence threshold

export function WebcamCapture({ userId, onUploadSuccess, onUploadError }: Props) {
  const webcamRef = useRef<Webcam>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const detectorRef = useRef<FaceDetector | null>(null); // MediaPipe detector
  const detectionRafRef = useRef<number | null>(null);
  const lastDetectAtRef = useRef<number>(0);
  const stableSinceRef = useRef<number | null>(null);
  const readinessRef = useRef<number>(0);

  const [canvasDataUrl, setCanvasDataUrl] = useState<string | null>(null);

  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [faceDetected, setFaceDetected] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [successUrl, setSuccessUrl] = useState<string | null>(null);
  const [cascadeLoaded, setCascadeLoaded] = useState(false);
  const [cascadeProgress, setCascadeProgress] = useState(0);
  const [analysis, setAnalysis] = useState({
    hasFace: false,
    faceScore: 0,
    brightness: 0,
    sharpness: 0,
    centerOffset: { x: 0, y: 0 },
    sizeRatio: 0,
    areaRatio: 0,
    stable: false,
  });

  const readiness = useMemo(() => {
    const checks = [
      analysis.hasFace,
      analysis.areaRatio >= AREA_MIN && analysis.areaRatio <= AREA_MAX,
      Math.abs(analysis.centerOffset.x) <= CENTER_TOLERANCE && Math.abs(analysis.centerOffset.y) <= CENTER_TOLERANCE,
      analysis.brightness >= BRIGHTNESS_MIN && analysis.brightness <= BRIGHTNESS_MAX,
      analysis.sharpness >= SHARPNESS_MIN,
      analysis.stable,
    ];
    const passed = checks.filter(Boolean).length;
    return Math.round((passed / checks.length) * 100);
  }, [analysis]);

  const brightnessOk = analysis.brightness >= BRIGHTNESS_MIN && analysis.brightness <= BRIGHTNESS_MAX;
  const sharpnessOk = analysis.sharpness >= SHARPNESS_MIN;
  const centered = Math.abs(analysis.centerOffset.x) <= CENTER_TOLERANCE && Math.abs(analysis.centerOffset.y) <= CENTER_TOLERANCE;
  const sizeOk = analysis.areaRatio >= AREA_MIN && analysis.areaRatio <= AREA_MAX;

  const statusLabel = useMemo(() => {
    if (!cameraReady && !permissionDenied) return 'Initializing camera...';
    if (permissionDenied) return 'Enable camera access to continue.';
    if (!cascadeLoaded) return `Loading face detector... ${cascadeProgress}%`;
    if (!analysis.hasFace) return 'Center your face in the circle.';
    if (!brightnessOk) return 'Increase lighting or avoid backlight.';
    if (!sharpnessOk) return 'Hold still to reduce blur.';
    if (!centered) return 'Center your face in the guide.';
    if (!sizeOk) return 'Move closer or farther to fit the guide.';
    if (!analysis.stable) return 'Hold still for a moment...';
    return 'Ready to capture';
  }, [analysis, brightnessOk, cascadeLoaded, cascadeProgress, cameraReady, centered, permissionDenied, sharpnessOk, sizeOk]);

  const readyToCapture =
    cameraReady &&
    cascadeLoaded &&
    analysis.hasFace &&
    brightnessOk &&
    sharpnessOk &&
    centered &&
    sizeOk &&
    analysis.stable &&
    !uploading;

  useEffect(() => {
    let cancelled = false;
    canvasRef.current = document.createElement('canvas');

    async function initMediaPipe() {
      try {
        setCascadeProgress(10);
        
        // Dynamically import MediaPipe (ESM module)
        const { FaceDetector, FilesetResolver } = await import('@mediapipe/tasks-vision');
        setCascadeProgress(30);

        // Load MediaPipe vision tasks WASM runtime
        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.8/wasm'
        );
        setCascadeProgress(60);

        if (cancelled) return;

        // Create face detector with short-range model (optimized for webcam)
        detectorRef.current = await FaceDetector.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.8/wasm/blaze_face_short_range.tflite',
            delegate: 'GPU' // Use GPU if available
          },
          runningMode: 'VIDEO',
          minDetectionConfidence: MIN_FACE_SCORE
        }) as FaceDetector;

        if (cancelled) return;

        setCascadeProgress(100);
        setCascadeLoaded(true);
        console.log('✅ MediaPipe FaceDetector loaded successfully');
      } catch (e) {
        if (cancelled) return;
        console.error('❌ Failed to load MediaPipe FaceDetector:', e);
        setError('Face detection unavailable. Please refresh the page.');
        setCascadeLoaded(false);
      }
    }

    void initMediaPipe();

    return () => {
      cancelled = true;
      if (detectionRafRef.current) cancelAnimationFrame(detectionRafRef.current);
      
      const video = webcamRef.current?.video as HTMLVideoElement | undefined;
      const stream = video?.srcObject as MediaStream | null | undefined;
      stream?.getTracks().forEach((t) => t.stop());
      
      if (canvasRef.current) {
        canvasRef.current.width = 0;
        canvasRef.current.height = 0;
      }
      
      // Close MediaPipe detector
      if (detectorRef.current) {
        detectorRef.current.close();
        detectorRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (readyToCapture && !capturedImage && error) {
      setError(null);
    }
  }, [readyToCapture, capturedImage, error]);

  const varianceOfLaplacian = useCallback((gray: Uint8Array, width: number, height: number) => {
    let sum = 0;
    let sumSq = 0;
    let count = 0;
    const laplacianKernel = [0, 1, 0, 1, -4, 1, 0, 1, 0];
    
    // Sample every 8th pixel (stride=8) for lower CPU load on main thread
    const stride = 8;
    for (let y = 1; y < height - 1; y += stride) {
      for (let x = 1; x < width - 1; x += stride) {
        const idx = y * width + x;
        const neighbors = [
          gray[idx - width - 1], gray[idx - width], gray[idx - width + 1],
          gray[idx - 1], gray[idx], gray[idx + 1],
          gray[idx + width - 1], gray[idx + width], gray[idx + width + 1],
        ];
        let lap = 0;
        for (let k = 0; k < 9; k += 1) {
          lap += laplacianKernel[k] * neighbors[k];
        }
        sum += lap;
        sumSq += lap * lap;
        count += 1;
      }
    }
    const mean = sum / count;
    const variance = sumSq / count - mean * mean;
    return variance;
  }, []);

  const processDetectionResults = useCallback((dets: any[], brightness: number, sharpness: number, width: number, height: number) => {
    // Find highest-scoring detection
    let best = dets.reduce((top: any, curr: any) => (curr[3] > (top?.[3] ?? -Infinity) ? curr : top), null);

    console.log('Detection:', { detsLength: dets.length, bestScore: best?.[3], cascadeLoaded });

    // Strict validation: require single face with high confidence
    const hasFaceDetected = Boolean(best && dets.length === 1 && best[3] >= MIN_FACE_SCORE * 100);
    const hasSingleFace = dets.length === 1;
    const meetsScore = Boolean(best && best[3] >= MIN_FACE_SCORE * 100);
    
    const sizeRatio = best ? best[2] / Math.min(width, height) : 0;
    const areaRatio = best ? Math.pow(best[2] / Math.min(width, height), 2) : 0;
    const centerOffset = best
      ? {
          x: best[1] / width - 0.5,
          y: best[0] / height - 0.5,
        }
      : { x: 0, y: 0 };

    console.log('Validation:', { 
      hasFaceDetected, 
      hasSingleFace, 
      meetsScore, 
      bestScore: best?.[3], 
      areaRatio, 
      centerOffset, 
      brightness, 
      sharpness 
    });

    const brightnessOk = brightness >= BRIGHTNESS_MIN && brightness <= BRIGHTNESS_MAX;
    const sharpnessOk = sharpness >= SHARPNESS_MIN;
    const centeredOk = Math.abs(centerOffset.x) <= CENTER_TOLERANCE && Math.abs(centerOffset.y) <= CENTER_TOLERANCE;
    const sizeOk = areaRatio >= AREA_MIN && areaRatio <= AREA_MAX;

    // All checks must pass for stability window
    const meetsStableChecks =
      hasSingleFace &&
      meetsScore &&
      sizeOk &&
      centeredOk &&
      brightnessOk &&
      sharpnessOk;

    const now = performance.now();
    if (meetsStableChecks) {
      if (!stableSinceRef.current) stableSinceRef.current = now;
    } else {
      stableSinceRef.current = null;
    }

    const stable = Boolean(stableSinceRef.current && now - stableSinceRef.current >= STABLE_MS);

    console.log('Readiness checks:', {
      '1️⃣ hasFace': hasFaceDetected ? '✅' : '❌',
      '2️⃣ areaRatio': sizeOk ? '✅' : `❌ (${areaRatio.toFixed(2)})`,
      '3️⃣ centered': centeredOk ? '✅' : `❌ (x:${centerOffset.x.toFixed(2)}, y:${centerOffset.y.toFixed(2)})`,
      '4️⃣ brightness': brightnessOk ? '✅' : `❌ (${brightness.toFixed(0)})`,
      '5️⃣ sharpness': sharpnessOk ? '✅' : `❌ (${sharpness.toFixed(0)})`,
      '6️⃣ stable': stable ? '✅' : '❌',
    });

    setFaceDetected(hasFaceDetected);
    setAnalysis({
      hasFace: hasFaceDetected,
      faceScore: best?.[3] ?? 0,
      brightness,
      sharpness,
      centerOffset,
      sizeRatio,
      areaRatio,
      stable,
    });
  }, []);

  const detectFace = useCallback(async () => {
    if (capturedImage) return;
    
    const video = webcamRef.current?.video as HTMLVideoElement | undefined;
    const detector = detectorRef.current;
    const canvas = canvasRef.current;

    if (!cascadeLoaded || !detector || !video || !canvas || video.videoWidth === 0) {
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    try {
      // Downscale for performance
      const width = Math.max(1, Math.round(video.videoWidth * DOWNSCALE_FACTOR));
      const height = Math.max(1, Math.round(video.videoHeight * DOWNSCALE_FACTOR));
      canvas.width = width;
      canvas.height = height;
      
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(DOWNSCALE_FACTOR, DOWNSCALE_FACTOR);
      ctx.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
      
      const rgba = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

      // Calculate brightness (sample every 8th pixel)
      let brightnessSum = 0;
      let sampleCount = 0;
      for (let i = 0; i < rgba.length; i += 32) {
        brightnessSum += (rgba[i] + rgba[i + 1] + rgba[i + 2]) / 3;
        sampleCount++;
      }
      const brightness = brightnessSum / sampleCount;

      // Calculate sharpness (Laplacian variance)
      const grayData = new Uint8Array(canvas.width * canvas.height);
      for (let i = 0, j = 0; i < rgba.length; i += 4, j++) {
        grayData[j] = rgba[i] * 0.299 + rgba[i + 1] * 0.587 + rgba[i + 2] * 0.114;
      }
      const sharpness = varianceOfLaplacian(grayData, canvas.width, canvas.height);

      // MediaPipe face detection
      const startMs = performance.now();
      const detections = await detector.detectForVideo(video, startMs);

      // Map MediaPipe detections to picojs format for processDetectionResults
      const dets: any[] = detections.detections.map((det: Detection) => {
        const bbox = det.boundingBox!;
        const score = det.categories[0].score;
        
        // picojs format: [row, col, size, score]
        // MediaPipe bbox: {originX, originY, width, height} in pixels
        const centerX = bbox.originX + bbox.width / 2;
        const centerY = bbox.originY + bbox.height / 2;
        const size = Math.max(bbox.width, bbox.height);
        
        return [
          centerY,           // row (y-center in pixels)
          centerX,           // col (x-center in pixels)
          size,              // size (max dimension)
          score * 100        // score (0-100 scale to match picojs)
        ];
      });

      processDetectionResults(dets, brightness, sharpness, video.videoWidth, video.videoHeight);
    } catch (error) {
      console.error('Face detection error:', error);
      return;
    }
  }, [capturedImage, cascadeLoaded, varianceOfLaplacian, processDetectionResults]);

  useEffect(() => {
    const tick = () => {
      if (!cameraReady || !cascadeLoaded) {
        detectionRafRef.current = requestAnimationFrame(tick);
        return;
      }
      
      const now = performance.now();
      // Throttle to 500ms for faster response
      if (now - lastDetectAtRef.current >= 500) {
        lastDetectAtRef.current = now;
        void detectFace(); // async call
      }
      detectionRafRef.current = requestAnimationFrame(tick);
    };

    detectionRafRef.current = requestAnimationFrame(tick);

    return () => {
      if (detectionRafRef.current) cancelAnimationFrame(detectionRafRef.current);
    };
  }, [detectFace, cameraReady, cascadeLoaded]);

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
    console.log('Capture clicked, readyToCapture:', readyToCapture);
    if (!readyToCapture) {
      setError('Please align and hold still until the guide shows ready.');
      return;
    }
    try {
      const video = webcamRef.current?.video as HTMLVideoElement | undefined;
      let screenshot: string | null | undefined = null;

      // Prefer drawing directly from the video and upscale to meet the 800x600 guardrail
      if (video && video.videoWidth && video.videoHeight) {
        const scale = Math.max(MIN_WIDTH / video.videoWidth, MIN_HEIGHT / video.videoHeight, 1);
        const targetWidth = Math.round(video.videoWidth * scale);
        const targetHeight = Math.round(video.videoHeight * scale);
        const offscreen = document.createElement('canvas');
        offscreen.width = targetWidth;
        offscreen.height = targetHeight;
        const ctx = offscreen.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, targetWidth, targetHeight);
          screenshot = offscreen.toDataURL('image/jpeg', 0.95);
        }
      }

      if (!screenshot) {
        screenshot = webcamRef.current?.getScreenshot();
      }

      console.log('Screenshot obtained:', screenshot ? 'yes' : 'no', 'source: video/canvas or webcam');
      if (!screenshot) {
        setError('Unable to capture photo. Please try again.');
        return;
      }
      await validateCapturedImage(screenshot);
      setCapturedImage(screenshot);
      setError(null);
      console.log('Capture successful');
    } catch (e: any) {
      console.error('Capture failed:', e);
      setError(e?.message ?? 'Image validation failed');
    }
  }, [readyToCapture, validateCapturedImage]);

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
      const url = res.documentUrl ?? res.frontUrl ?? res.backUrl;
      if (!url) {
        throw new Error('Upload succeeded but URL was not returned');
      }
      setSuccessUrl(url);
      onUploadSuccess(url);
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
    stableSinceRef.current = null;
  }, []);
  const captureLabel = readyToCapture ? 'Capture Photo' : statusLabel;

  const ringColor = readyToCapture 
    ? '#22c55e' // Green: all checks pass
    : analysis.hasFace 
      ? '#fbbf24' // Yellow: face detected but not ready
      : '#ef4444'; // Red: no face detected

  useEffect(() => {
    readinessRef.current = readiness;
  }, [readiness]);

  return (
    <div className="w-full max-w-3xl mx-auto space-y-5 flex flex-col items-center">
      {/* Circular frame container with dotted ring outside */}
      <div className="relative w-full max-w-md aspect-square">
        {/* Dotted indicator ring drawn outside the circular frame */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          viewBox="0 0 100 100"
          preserveAspectRatio="xMidYMid meet"
          style={{ zIndex: 20 }}
        >
          {/* Dashed ring positioned outside the video circle */}
          <circle
            cx="50"
            cy="50"
            r="48"
            fill="none"
            stroke={ringColor}
            strokeWidth="1.5"
            strokeDasharray="4,4"
            style={{ transition: 'stroke 200ms ease' }}
          />
        </svg>

        {/* Circular video frame - radius matches inner edge of dotted ring */}
        <div className="absolute inset-[4%] rounded-full overflow-hidden bg-black">
          <Webcam
            ref={webcamRef}
            audio={false}
            mirrored
            onUserMedia={onUserMedia}
            onUserMediaError={onUserMediaError}
            screenshotFormat="image/jpeg"
            videoConstraints={{
              facingMode: 'user',
              width: { ideal: 1280, min: 640 },
              height: { ideal: 960, min: 480 },
              frameRate: { ideal: 15, max: 24 },
            }}
            className="absolute inset-0 h-full w-full object-cover [transform:scaleX(-1)]"
          />

          {/* Loading states */}
          {!cameraReady && !permissionDenied && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-white text-sm">
              Initializing camera...
            </div>
          )}
          {permissionDenied && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/70 px-4 text-center text-white text-sm">
              Camera permission denied. Please enable camera access in your browser settings and refresh.
            </div>
          )}
        </div>
      </div>

      {/* Status chips below the circular frame */}
      <div className="flex flex-wrap justify-center gap-2 text-xs text-gray-800">
        <span className={`rounded-full px-3 py-1 font-semibold ${readyToCapture ? 'bg-green-500/80 text-black' : 'bg-gray-200'}`}>
          {statusLabel}
        </span>
        <span className={`rounded-full px-3 py-1 ${brightnessOk ? 'bg-gray-200' : 'bg-amber-300 text-black'}`}>
          Lighting {brightnessOk ? 'OK' : 'Adjust lighting'}
        </span>
        <span className={`rounded-full px-3 py-1 ${sharpnessOk ? 'bg-gray-200' : 'bg-amber-300 text-black'}`}>
          Sharpness {sharpnessOk ? 'OK' : 'Hold still'}
        </span>
        <span className={`rounded-full px-3 py-1 ${centered && sizeOk ? 'bg-gray-200' : 'bg-amber-300 text-black'}`}>
          Framing {centered && sizeOk ? 'OK' : 'Center & resize'}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {!capturedImage ? (
          <button
            type="button"
            onClick={handleCapture}
            disabled={!readyToCapture}
            className={`rounded-full px-6 py-2.5 text-sm font-semibold text-white shadow transition ${
              !readyToCapture ? 'bg-gray-500 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'
            }`}
          >
            {captureLabel}
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={handleRetake}
              className="rounded-full px-5 py-2 text-sm font-semibold text-gray-900 bg-white shadow hover:bg-gray-100"
            >
              Retake
            </button>
            <button
              type="button"
              onClick={handleUpload}
              disabled={uploading}
              className={`rounded-full px-6 py-2 text-sm font-semibold text-white shadow ${
                uploading ? 'bg-gray-500 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              {uploading ? 'Uploading...' : 'Upload'}
            </button>
          </>
        )}

        <div className="flex items-center gap-2 text-xs text-gray-600">
          <span className="inline-flex h-3 w-3 rounded-full bg-green-500" />
          <span>Detector readiness: {readiness}%</span>
        </div>
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

      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}
    </div>
  );
}
