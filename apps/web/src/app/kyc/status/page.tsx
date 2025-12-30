'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { getKycStatus } from '@/lib/api-client';
import KycStatusIndicator from '@/components/KycStatusIndicator';

function StatusPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const userId = searchParams.get('userId');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    const load = async () => {
      if (!userId) return;
      setLoading(true);
      setError(null);
      try {
        const res = await getKycStatus(userId);
        setData(res);
      } catch (err: any) {
        setError(err?.response?.data?.message || err?.message || 'Failed to load status');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [userId]);

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
