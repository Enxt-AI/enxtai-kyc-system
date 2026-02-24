'use client';

import { useEffect, useState, useRef } from 'react';
import clsx from 'clsx';
import { checkDigiLockerStatus } from '@/lib/api-client';

interface Props {
  submissionId: string;
  onStatusChange?: (status: DigiLockerStatusData) => void;
}

interface DigiLockerStatusData {
  authorized: boolean;
  documentsFetched: boolean;
  documentSource: 'MANUAL_UPLOAD' | 'DIGILOCKER';
  availableDocuments: string[];
  fetching?: boolean;
}

export default function DigiLockerStatus({ submissionId, onStatusChange }: Props) {
  const [status, setStatus] = useState<DigiLockerStatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Use ref to avoid re-renders when onStatusChange changes
  const onStatusChangeRef = useRef(onStatusChange);
  onStatusChangeRef.current = onStatusChange;

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        setLoading(true);
        const data = await checkDigiLockerStatus(submissionId);
        setStatus(data);
        onStatusChangeRef.current?.(data);
      } catch (err: any) {
        setError(err?.response?.data?.message || 'Failed to check DigiLocker status');
      } finally {
        setLoading(false);
      }
    };

    if (submissionId) {
      fetchStatus();
    }
  }, [submissionId]); // Removed onStatusChange from dependencies

  if (loading) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
        <div className="flex items-center gap-3">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600" />
          <p className="text-sm text-slate-600">Checking DigiLocker status...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4">
        <p className="text-sm text-red-800">{error}</p>
      </div>
    );
  }

  if (!status) return null;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-slate-900">DigiLocker Status</p>
          <div className="mt-2 flex items-center gap-2">
            <span
              className={clsx(
                'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold',
                status.authorized
                  ? 'bg-green-100 text-green-800'
                  : 'bg-slate-100 text-slate-700'
              )}
            >
              {status.authorized ? 'Authorized' : 'Not Authorized'}
            </span>
            {status.documentsFetched && (
              <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-800">
                Documents Fetched
              </span>
            )}
          </div>
        </div>
        {status.authorized && status.availableDocuments.length > 0 && (
          <div className="text-right">
            <p className="text-xs text-slate-500">Available Documents</p>
            <p className="text-sm font-medium text-slate-900">
              {status.availableDocuments.join(', ')}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}