'use client';

import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { Suspense, useMemo } from 'react';
import FaceVerificationStatus from '@/components/FaceVerificationStatus';

function VerifyPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const submissionId = useMemo(() => searchParams.get('submissionId'), [searchParams]);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-0">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Face Verification</h1>
          <p className="mt-1 text-sm text-slate-600">
            We will match your live selfie with your PAN or Aadhaar photo and run a liveness check.
          </p>
        </div>
        <div className="flex gap-3">
          <Link
            href="/kyc/upload"
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300"
          >
            Back to Uploads
          </Link>
          <button
            onClick={() => router.push('/kyc/photo')}
            className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-black"
          >
            Live Photo
          </button>
        </div>
      </div>

      {!submissionId ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          No submission ID provided. Append <span className="font-semibold">?submissionId=&lt;id&gt;</span> to the URL after finishing uploads.
        </div>
      ) : (
        <>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
            <p className="font-semibold text-slate-900">Before you start:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Ensure your PAN and Aadhaar photos are clear and fully visible.</li>
              <li>Use a well-lit environment for the live photo.</li>
              <li>Keep still during verification; this takes a few seconds.</li>
            </ul>
          </div>

          <FaceVerificationStatus submissionId={submissionId} />
        </>
      )}
    </div>
  );
}

export default function VerifyPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-slate-600">Loading verification...</div>}>
      <VerifyPageContent />
    </Suspense>
  );
}
