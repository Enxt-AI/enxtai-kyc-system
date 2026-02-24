'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { getKycStatus, checkDigiLockerStatus } from '@/lib/api-client';
import KycStatusIndicator from '@/components/KycStatusIndicator';

function StatusPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const userId = searchParams.get('userId');
  const submissionIdParam = searchParams.get('submissionId');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);
  const [documentSource, setDocumentSource] = useState<'MANUAL_UPLOAD' | 'DIGILOCKER' | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!userId) return;
      setLoading(true);
      setError(null);
      try {
        const submissionId = submissionIdParam || localStorage.getItem('kyc_submission_id');
        const [statusRes, digiLockerStatus] = await Promise.all([
          getKycStatus(userId),
          submissionId ? checkDigiLockerStatus(submissionId).catch(() => null) : Promise.resolve(null),
        ]);
        setData(statusRes);
        if (digiLockerStatus) {
          setDocumentSource(digiLockerStatus.documentSource);
        }
      } catch (err: any) {
        setError(err?.response?.data?.message || err?.message || 'Failed to load status');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [userId, submissionIdParam]);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-0">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">KYC Status</h1>
          <p className="mt-1 text-sm text-slate-600">Track your submission progress and verification scores.</p>
        </div>
        <div className="flex gap-3">
          <Link
            href="/kyc/upload"
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300"
          >
            Upload Docs
          </Link>
          <button
            onClick={() => router.push('/kyc/photo')}
            className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-black"
          >
            Live Photo
          </button>
        </div>
      </div>

      {!userId && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Please provide a userId via query param <span className="font-semibold">?userId=&lt;id&gt;</span> to view status.
        </div>
      )}

      {loading && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">Loading status...</div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>
      )}

      {data && (
        <KycStatusIndicator
          status={data.statusLabel}
          progress={data.progress}
          faceMatchScore={data.submission.faceMatchScore}
          livenessScore={data.submission.livenessScore}
          rejectionReason={data.submission.rejectionReason}
        />
      )}

      {data && documentSource && (
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-600">Document Source</p>
          <div className="mt-2 flex items-center gap-2">
            <span
              className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
                documentSource === 'DIGILOCKER'
                  ? 'bg-blue-100 text-blue-800'
                  : 'bg-slate-100 text-slate-700'
              }`}
            >
              {documentSource === 'DIGILOCKER' ? '📱 DigiLocker' : '📤 Manual Upload'}
            </span>
            {documentSource === 'DIGILOCKER' && (
              <p className="text-xs text-slate-500">
                Documents fetched automatically from DigiLocker
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function StatusPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-slate-600">Loading status...</div>}>
      <StatusPageContent />
    </Suspense>
  );
}
