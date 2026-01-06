'use client';

import { useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';
import { getClientStats } from '@/lib/api-client';
import type { ClientStats } from '@enxtai/shared-types';
import Link from 'next/link';

/**
 * Dashboard Content - Client Component
 * 
 * Main dashboard for client portal with KYC statistics and quick actions.
 * 
 * @remarks
 * **Features**:
 * - Real-time statistics cards (total, verified, pending, rejected)
 * - Rejection rate indicator with color-coded alert levels
 * - Quick action buttons for common tasks
 * - Loading states and error handling
 * 
 * **Data Fetching**:
 * - Loads stats on mount using getClientStats()
 * - Automatic retry on error (manual refresh button)
 * - Session-based authentication via NextAuth
 * 
 * **Visual Design**:
 * - Statistics cards with icons and trend colors
 * - Rejection rate badge: Green (<10%), Yellow (10-20%), Red (>20%)
 * - Responsive grid layout (1 column mobile, 4 columns desktop)
 */
export default function DashboardContent() {
  const { data: session } = useSession();
  const [stats, setStats] = useState<ClientStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getClientStats();
      setStats(data);
    } catch (err: any) {
      console.error('Failed to load stats:', err);
      setError(err.response?.data?.message || 'Failed to load dashboard statistics');
    } finally {
      setLoading(false);
    }
  };

  if (!session) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-600">Loading session...</div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-2 text-gray-600">
          Welcome back, <span className="font-medium">{session?.user?.email}</span>
        </p>
      </div>

      {/* Error State */}
      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-start">
            <div className="text-red-600 text-xl mr-3">⚠️</div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-red-800">Error Loading Statistics</h3>
              <p className="text-sm text-red-700 mt-1">{error}</p>
              <button
                onClick={loadStats}
                className="mt-3 text-sm font-medium text-red-800 hover:text-red-900 underline"
              >
                Retry
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Loading State */}
      {loading && !stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-white rounded-lg shadow-md p-6 animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-24 mb-4"></div>
              <div className="h-8 bg-gray-200 rounded w-16"></div>
            </div>
          ))}
        </div>
      )}

      {/* Statistics Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {/* Total Submissions */}
          <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-blue-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Submissions</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">{stats.totalSubmissions}</p>
              </div>
              <div className="text-4xl">📊</div>
            </div>
          </div>

          {/* Verified */}
          <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-green-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Verified</p>
                <p className="text-3xl font-bold text-green-600 mt-2">{stats.verifiedCount}</p>
              </div>
              <div className="text-4xl">✅</div>
            </div>
            {stats.totalSubmissions > 0 && (
              <p className="text-xs text-gray-500 mt-2">
                {((stats.verifiedCount / stats.totalSubmissions) * 100).toFixed(1)}% of total
              </p>
            )}
          </div>

          {/* Pending Review */}
          <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-yellow-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Pending Review</p>
                <p className="text-3xl font-bold text-yellow-600 mt-2">{stats.pendingReviewCount}</p>
              </div>
              <div className="text-4xl">⏳</div>
            </div>
          </div>

          {/* Rejected */}
          <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-red-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Rejected</p>
                <p className="text-3xl font-bold text-red-600 mt-2">{stats.rejectedCount}</p>
              </div>
              <div className="text-4xl">❌</div>
            </div>
          </div>
        </div>
      )}

      {/* Rejection Rate Alert */}
      {stats && stats.totalSubmissions > 0 && (
        <div className={`mb-8 rounded-lg p-4 ${
          stats.rejectionRate > 20 
            ? 'bg-red-50 border border-red-200' 
            : stats.rejectionRate > 10 
            ? 'bg-yellow-50 border border-yellow-200' 
            : 'bg-green-50 border border-green-200'
        }`}>
          <div className="flex items-center">
            <div className={`text-2xl mr-3 ${
              stats.rejectionRate > 20 ? 'text-red-600' : stats.rejectionRate > 10 ? 'text-yellow-600' : 'text-green-600'
            }`}>
              {stats.rejectionRate > 20 ? '🔴' : stats.rejectionRate > 10 ? '🟡' : '🟢'}
            </div>
            <div>
              <h3 className={`text-sm font-semibold ${
                stats.rejectionRate > 20 ? 'text-red-800' : stats.rejectionRate > 10 ? 'text-yellow-800' : 'text-green-800'
              }`}>
                Rejection Rate: {stats.rejectionRate}%
              </h3>
              <p className={`text-sm mt-1 ${
                stats.rejectionRate > 20 ? 'text-red-700' : stats.rejectionRate > 10 ? 'text-yellow-700' : 'text-green-700'
              }`}>
                {stats.rejectionRate > 20 
                  ? 'High rejection rate detected. Review submission guidelines or quality checks.' 
                  : stats.rejectionRate > 10 
                  ? 'Moderate rejection rate. Monitor submission quality.' 
                  : 'Excellent! Your rejection rate is below 10%.'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link
            href="/client/submissions"
            className="flex items-center p-4 border border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors"
          >
            <div className="text-3xl mr-4">📋</div>
            <div>
              <h3 className="font-medium text-gray-900">View Submissions</h3>
              <p className="text-sm text-gray-600">Browse all KYC submissions</p>
            </div>
          </Link>

          <Link
            href="/client/settings"
            className="flex items-center p-4 border border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors"
          >
            <div className="text-3xl mr-4">⚙️</div>
            <div>
              <h3 className="font-medium text-gray-900">Settings</h3>
              <p className="text-sm text-gray-600">Manage API keys & webhooks</p>
            </div>
          </Link>

          <button
            onClick={loadStats}
            disabled={loading}
            className="flex items-center p-4 border border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="text-3xl mr-4">🔄</div>
            <div className="text-left">
              <h3 className="font-medium text-gray-900">Refresh Stats</h3>
              <p className="text-sm text-gray-600">Reload dashboard data</p>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
