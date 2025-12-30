'use client';

import { useEffect, useState } from 'react';
import type { SubmissionWithPresignedUrls } from '@enxtai/shared-types';
import { approveKycSubmission, rejectKycSubmission, getSubmissionDetails } from '@/lib/api-client';

interface Props {
  submissionId: string | null;
  adminUserId: string;
  onClose: () => void;
  onActionComplete: () => void;
}

export default function ReviewModal({ submissionId, adminUserId, onClose, onActionComplete }: Props) {
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<SubmissionWithPresignedUrls | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  useEffect(() => {
    const load = async () => {
      if (!submissionId) return;
      setLoading(true);
      setError(null);
      try {
        const res = await getSubmissionDetails(submissionId);
        setData(res as SubmissionWithPresignedUrls);
      } catch (err: any) {
        setError(err?.response?.data?.message || err?.message || 'Failed to load submission');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [submissionId]);

  if (!submissionId) return null;

  const handleApprove = async () => {
    if (!submissionId) return;
    setActionLoading(true);
    setError(null);
    try {
      await approveKycSubmission(submissionId, adminUserId);
      onActionComplete();
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Approval failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!submissionId || !rejectReason.trim()) {
      setError('Please provide a rejection reason.');
      return;
    }
    setActionLoading(true);
    setError(null);
    try {
      await rejectKycSubmission(submissionId, adminUserId, rejectReason.trim());
      onActionComplete();
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Rejection failed');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-5xl rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Review Submission</h3>
            <p className="text-sm text-slate-600">Submission ID: {submissionId}</p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-800">✕</button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-6 py-4">
          {loading && <div className="text-sm text-slate-600">Loading...</div>}
          {error && <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}

          {data && (
            <div className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Document</p>
                  <div className="grid gap-3">
                    {data.presignedUrls.panDocument && (
                      <img src={data.presignedUrls.panDocument} alt="PAN" className="w-full rounded-lg border border-slate-200" />
                    )}
                    {data.presignedUrls.aadhaarDocument && (
                      <img src={data.presignedUrls.aadhaarDocument} alt="Aadhaar" className="w-full rounded-lg border border-slate-200" />
                    )}
                  </div>
                </div>
                <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Live Photo</p>
                  {data.presignedUrls.livePhoto ? (
                    <img src={data.presignedUrls.livePhoto} alt="Live" className="w-full rounded-lg border border-slate-200" />
                  ) : (
                    <div className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">No live photo</div>
                  )}
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-lg border border-slate-200 bg-white p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Applicant</p>
                  <div className="mt-2 space-y-1 text-sm text-slate-800">
                    <div><span className="font-semibold">Name:</span> {data.fullName ?? '—'}</div>
                    <div><span className="font-semibold">PAN:</span> {data.panNumber ?? '—'}</div>
                    <div><span className="font-semibold">Aadhaar:</span> {data.aadhaarNumber ?? '—'}</div>
                    <div><span className="font-semibold">DOB:</span> {data.dateOfBirth ? new Date(data.dateOfBirth).toLocaleDateString() : '—'}</div>
                    <div><span className="font-semibold">Address:</span> {data.address?.formatted ?? '—'}</div>
                  </div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Verification</p>
                  <div className="mt-2 space-y-1 text-sm text-slate-800">
                    <div><span className="font-semibold">Face Match:</span> {data.faceMatchScore != null ? (data.faceMatchScore * 100).toFixed(1) + '%' : '—'}</div>
                    <div><span className="font-semibold">Liveness:</span> {data.livenessScore != null ? (data.livenessScore * 100).toFixed(1) + '%' : '—'}</div>
                    <div><span className="font-semibold">Status:</span> {data.internalStatus}</div>
                    {data.rejectionReason && <div className="text-red-700">Reason: {data.rejectionReason}</div>}
                  </div>
                </div>
              </div>

              <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
                <p className="text-xs uppercase tracking-wide text-slate-500">Actions</p>
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={handleApprove}
                    disabled={actionLoading}
                    className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-green-300"
                  >
                    Approve
                  </button>
                  <button
                    onClick={handleReject}
                    disabled={actionLoading}
                    className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-red-300"
                  >
                    Reject
                  </button>
                  <textarea
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="Reason for rejection"
                    className="w-full rounded-lg border border-slate-200 p-3 text-sm text-slate-900 focus:border-blue-500 focus:outline-none"
                    rows={3}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
