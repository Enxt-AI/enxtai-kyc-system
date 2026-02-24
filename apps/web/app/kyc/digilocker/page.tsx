'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

function DigiLockerCallbackContent() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');
  const [message, setMessage] = useState('Processing DigiLocker authorization...');

  useEffect(() => {
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');

    if (error) {
      setStatus('error');
      setMessage(errorDescription || error || 'Authorization failed');

      // Notify opener window of error
      if (window.opener) {
        window.opener.postMessage({
          type: 'digilocker_auth_error',
          error: errorDescription || error,
        }, window.location.origin);
      }
      return;
    }

    if (!code || !state) {
      setStatus('error');
      setMessage('Missing authorization code or state parameter');
      return;
    }

    // Backend will handle token exchange via callback endpoint
    // The callback endpoint is called by DigiLocker directly
    setStatus('success');
    setMessage('Authorization successful! You can close this window.');

    // Notify opener window of success
    if (window.opener) {
      window.opener.postMessage({
        type: 'digilocker_auth_success',
        userId: state,
      }, window.location.origin);

      // Auto-close after 2 seconds
      setTimeout(() => {
        window.close();
      }, 2000);
    }
  }, [searchParams]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-8">
      <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-lg">
        <div className="text-center">
          {status === 'processing' && (
            <>
              <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" />
              <h1 className="mt-4 text-lg font-semibold text-slate-900">Processing...</h1>
              <p className="mt-2 text-sm text-slate-600">{message}</p>
            </>
          )}

          {status === 'success' && (
            <>
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
                <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h1 className="mt-4 text-lg font-semibold text-green-900">Success!</h1>
              <p className="mt-2 text-sm text-slate-600">{message}</p>
              <p className="mt-4 text-xs text-slate-500">This window will close automatically...</p>
            </>
          )}

          {status === 'error' && (
            <>
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
                <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <h1 className="mt-4 text-lg font-semibold text-red-900">Authorization Failed</h1>
              <p className="mt-2 text-sm text-slate-600">{message}</p>
              <div className="mt-6 flex justify-center gap-3">
                <button
                  onClick={() => window.close()}
                  className="rounded bg-slate-600 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
                >
                  Close Window
                </button>
                <Link
                  href="/kyc/upload"
                  className="rounded border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Back to Upload
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
}

export default function DigiLockerCallbackPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" />
      </div>
    }>
      <DigiLockerCallbackContent />
    </Suspense>
  );
}