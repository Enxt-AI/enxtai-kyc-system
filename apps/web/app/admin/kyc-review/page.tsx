'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import type { PendingReviewSubmission } from '@enxtai/shared-types';
import PendingReviewTable from '@/components/admin/PendingReviewTable';
import ReviewModal from '@/components/admin/ReviewModal';
import { getPendingReviews } from '@/lib/api-client';

/**
 * Admin KYC Review Page
 *
 * Platform administrator interface for reviewing and approving/rejecting KYC submissions.
 *
 * @remarks
 * **Purpose**:
 * - View all pending KYC submissions across all clients (cross-tenant)
 * - Review submission details, documents, and OCR data
 * - Approve or reject submissions with optional comments
 * - Track review actions by admin user ID
 *
 * **RBAC Protection**:
 * - SuperAdminGuard (via layout) ensures only SUPER_ADMIN can access
 * - Uses NextAuth session to get admin user ID (no sessionStorage hack)
 * - Admin ID guaranteed valid due to middleware + guard protection
 *
 * **Session Usage**:
 * - `session.user.id` used as `adminUserId` for audit trail
 * - Session managed by NextAuth (JWT tokens)
 * - No manual validation needed (guards handle authentication)
 *
 * **Features**:
 * - Real-time submission list with auto-refresh after actions
 * - Modal-based review workflow
 * - Error handling for API failures
 * - Loading states during data fetch
 *
 * **Cross-Tenant Access**:
 * SUPER_ADMIN users can review submissions from all clients.
 * Backend API validates SUPER_ADMIN role before returning cross-tenant data.
 */
export default function AdminKycReviewPage() {
  const { data: session } = useSession();
  const [pending, setPending] = useState<PendingReviewSubmission[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

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
    <div className="flex flex-col gap-6 p-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900">Admin KYC Review</h1>
          <p className="mt-1 text-sm text-slate-600">Review pending submissions and approve or reject them.</p>
        </div>
      </div>

      {loading && <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">Loading pending reviews...</div>}
      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>}

      {!loading && !error && (
        <PendingReviewTable
          items={pending}
          onSelect={(id) => setSelected(id)}
        />
      )}

      {selected && session?.user && (
        <ReviewModal
          submissionId={selected}
          adminUserId={session.user.id}
          onClose={() => setSelected(null)}
          onActionComplete={load}
        />
      )}
    </div>
  );
}
