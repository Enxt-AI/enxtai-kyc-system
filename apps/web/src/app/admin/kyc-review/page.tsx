'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { PendingReviewSubmission } from '@enxtai/shared-types';
import PendingReviewTable from '@/components/admin/PendingReviewTable';
import ReviewModal from '@/components/admin/ReviewModal';
import { getPendingReviews } from '@/lib/api-client';

export default function AdminKycReviewPage() {
  const [pending, setPending] = useState<PendingReviewSubmission[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [adminUserId, setAdminUserId] = useState<string>('');
  const [adminIdentityError, setAdminIdentityError] = useState<string | null>(null);

  const uuidPattern = useMemo(
    () => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    [],
  );

  useEffect(() => {
    const resolveAdminId = () => {
      const sessionId = typeof window !== 'undefined' ? window.sessionStorage.getItem('adminUserId') ?? '' : '';
      const envId = process.env.NEXT_PUBLIC_ADMIN_USER_ID ?? '';
      const resolvedId = sessionId || envId;

      if (!resolvedId || !uuidPattern.test(resolvedId)) {
        setAdminUserId('');
        setAdminIdentityError('Admin identity missing or invalid. Please sign in again.');
        return;
      }

      setAdminUserId(resolvedId);
      setAdminIdentityError(null);
    };

    resolveAdminId();
  }, [uuidPattern]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getPendingReviews();
      setPending(res as PendingReviewSubmission[]);
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to load pending reviews');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-0">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Admin KYC Review</h1>
          <p className="mt-1 text-sm text-slate-600">Review pending submissions and approve or reject them.</p>
        </div>
      </div>

      {loading && <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">Loading pending reviews...</div>}
      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>}

      {!loading && !error && (
        <PendingReviewTable
          items={pending}
          onSelect={(id) => {
            if (!adminUserId) {
              setError('Admin identity missing or invalid.');
              return;
            }
            setSelected(id);
          }}
        />
      )}

      {adminIdentityError && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          {adminIdentityError}
        </div>
      )}

      {selected && adminUserId && (
        <ReviewModal
          submissionId={selected}
          adminUserId={adminUserId}
          onClose={() => setSelected(null)}
          onActionComplete={load}
        />
      )}
    </div>
  );
}
