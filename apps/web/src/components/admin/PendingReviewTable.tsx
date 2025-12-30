'use client';

import { useMemo } from 'react';
import type { PendingReviewSubmission } from '@enxtai/shared-types';

interface Props {
  items: PendingReviewSubmission[];
  onSelect: (submissionId: string) => void;
}

export default function PendingReviewTable({ items, onSelect }: Props) {
  const rows = useMemo(() => items ?? [], [items]);

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-slate-700">User</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-700">Submission Date</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-700">PAN</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-700">Aadhaar</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-700">Scores</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-700">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white">
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-500">No pending reviews</td>
              </tr>
            )}
            {rows.map((item) => (
              <tr key={item.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <div className="font-semibold text-slate-900">{item.user.email}</div>
                  <div className="text-xs text-slate-600">{item.user.phone}</div>
                </td>
                <td className="px-4 py-3 text-slate-700">{new Date(item.submissionDate).toLocaleString()}</td>
                <td className="px-4 py-3 text-slate-700">{item.panNumber ?? '—'}</td>
                <td className="px-4 py-3 text-slate-700">{item.aadhaarNumber ?? '—'}</td>
                <td className="px-4 py-3 text-slate-700">
                  <div>Face: {item.faceMatchScore != null ? (item.faceMatchScore * 100).toFixed(1) + '%' : '—'}</div>
                  <div>Live: {item.livenessScore != null ? (item.livenessScore * 100).toFixed(1) + '%' : '—'}</div>
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => onSelect(item.id)}
                    className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700"
                  >
                    Review
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
