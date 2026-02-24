'use client';

import { useMemo } from 'react';
import clsx from 'clsx';

interface Props {
  status: string;
  progress: number;
  faceMatchScore?: number | null;
  livenessScore?: number | null;
  rejectionReason?: string | null;
}

const statusColors: Record<string, string> = {
  PENDING: 'bg-slate-100 text-slate-700',
  DOCUMENTS_UPLOADED: 'bg-blue-100 text-blue-800',
  OCR_COMPLETED: 'bg-blue-100 text-blue-800',
  PENDING_REVIEW: 'bg-amber-100 text-amber-800',
  FACE_VERIFIED: 'bg-green-100 text-green-800',
  VERIFIED: 'bg-green-100 text-green-800',
  REJECTED: 'bg-red-100 text-red-800',
};

export default function KycStatusIndicator({ status, progress, faceMatchScore, livenessScore, rejectionReason }: Props) {
  const badgeClass = statusColors[status] ?? 'bg-slate-100 text-slate-700';
  const progressSafe = Math.min(100, Math.max(0, progress));

  const scoreItems = useMemo(() => (
    [
      {
        label: 'Face Match',
        value: faceMatchScore != null ? `${(faceMatchScore * 100).toFixed(1)}%` : '—',
      },
      {
        label: 'Liveness',
        value: livenessScore != null ? `${(livenessScore * 100).toFixed(1)}%` : '—',
      },
    ]
  ), [faceMatchScore, livenessScore]);

  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-600">Current Status</p>
          <span className={clsx('mt-1 inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold', badgeClass)}>
            {status.replace('_', ' ')}
          </span>
        </div>
        <div className="text-right">
          <p className="text-sm text-slate-600">Progress</p>
          <p className="text-xl font-semibold text-slate-900">{progressSafe}%</p>
        </div>
      </div>

      <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full bg-blue-600 transition-all"
          style={{ width: `${progressSafe}%` }}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {scoreItems.map((item) => (
          <div key={item.label} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">{item.label}</p>
            <p className="text-lg font-semibold text-slate-900">{item.value}</p>
          </div>
        ))}
      </div>

      {rejectionReason && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          Rejection Reason: {rejectionReason}
        </div>
      )}
    </div>
  );
}
