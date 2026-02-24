'use client';

import { useState } from 'react';
import type { AxiosError } from 'axios';
import { verifyFace } from '@/lib/api-client';
import type { FaceVerificationResponse } from '@enxtai/shared-types';

interface Props {
  submissionId: string;
  onComplete?: (success: boolean) => void;
}

const steps = [
  'Extracting face from documents',
  'Comparing with live photo',
  'Checking liveness',
  'Finalizing verification',
];

export default function FaceVerificationStatus({ submissionId, onComplete }: Props) {
  const [loading, setLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [result, setResult] = useState<FaceVerificationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleVerify = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    setCurrentStep(0);

    try {
      steps.forEach((_, idx) => setTimeout(() => setCurrentStep(idx + 1), 250 * (idx + 1)));
      const res = await verifyFace(submissionId);
      setResult(res);
      onComplete?.(res.verificationResults.internalStatus === 'FACE_VERIFIED');
      setCurrentStep(steps.length);
    } catch (err: any) {
      const axiosErr = err as AxiosError<any>;
      const message =
        axiosErr?.response?.data?.message || axiosErr?.response?.data?.detail || axiosErr?.message || 'Verification failed';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Face Verification</h2>
          <p className="text-sm text-slate-600">We will compare your live photo with your documents and check liveness.</p>
        </div>
        <button
          onClick={handleVerify}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {loading && <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />}
          {loading ? 'Verifying...' : 'Start Verification'}
        </button>
      </div>

      <div className="mt-6 space-y-3">
        {steps.map((label, idx) => {
          const active = currentStep > idx;
          return (
            <div key={label} className="flex items-center gap-3">
              <div
                className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                  active ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'
                }`}
              >
                {active ? '✓' : idx + 1}
              </div>
              <span className={`text-sm ${active ? 'text-slate-900' : 'text-slate-500'}`}>{label}</span>
            </div>
          );
        })}
      </div>

      {result && (
        <div className="mt-6 grid gap-4 rounded-lg border border-slate-100 bg-slate-50 p-4 sm:grid-cols-2">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Face Match Score</p>
            <p className="text-lg font-semibold text-slate-900">{(result.verificationResults.faceMatchScore * 100).toFixed(1)}%</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Liveness Score</p>
            <p className="text-lg font-semibold text-slate-900">{(result.verificationResults.livenessScore * 100).toFixed(1)}%</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Status</p>
            <span
              className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
                result.verificationResults.internalStatus === 'FACE_VERIFIED'
                  ? 'bg-green-100 text-green-800'
                  : result.verificationResults.internalStatus === 'PENDING_REVIEW'
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-red-100 text-red-800'
              }`}
            >
              {result.verificationResults.internalStatus.replace('_', ' ')}
            </span>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Submission</p>
            <p className="text-sm font-medium text-slate-900">{result.submissionId}</p>
          </div>
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}
    </div>
  );
}
