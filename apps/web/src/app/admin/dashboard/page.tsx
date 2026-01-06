'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getAllClients } from '@/lib/api-client';
import type { AdminClientListItem } from '@enxtai/shared-types';

/**
 * Admin Dashboard Page
 *
 * Cross-tenant overview for platform administrators (Super Admin).
 *
 * @remarks
 * **Purpose**:
 * - Displays all clients with their KYC statistics at a glance
 * - Provides quick access to client management
 * - Shows overall platform health metrics
 *
 * **RBAC Protection**:
 * - SuperAdminGuard (via layout) ensures only SUPER_ADMIN can access
 * - Middleware validates session token before reaching this page
 * - Backend APIs validate SUPER_ADMIN role on all requests
 *
 * **Data Fetching Strategy**:
 * - Fetches all clients from `/api/admin/clients`
 * - Backend returns aggregated KYC counts per client
 * - Success rate calculated client-side: `(verified / total * 100)%`
 *
 * **Features**:
 * - Real-time client statistics table
 * - Status badges (color-coded by client status)
 * - Success rate indicators
 * - Quick navigation to client management
 * - Loading states and error handling
 *
 * **Cross-Tenant Visibility**:
 * SUPER_ADMIN users can view data from all clients (tenants) in a single view.
 * This enables platform monitoring and identifying clients with low success rates.
 */
export default function AdminDashboardPage() {
  const [clients, setClients] = useState<AdminClientListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadClients();
  }, []);

  const loadClients = async () => {
    try {
      setLoading(true);
      setError(null);
      const clients = await getAllClients();
      setClients(clients);
    } catch (err: any) {
      console.error('Failed to load clients:', err);
      setError(err.response?.data?.message || 'Failed to load client statistics');
    } finally {
      setLoading(false);
    }
  };

  const calculateSuccessRate = (verifiedKycs: number, totalKycs: number): string => {
    if (totalKycs === 0) return '0.0%';
    return ((verifiedKycs / totalKycs) * 100).toFixed(1) + '%';
  };

  const getStatusBadge = (status: string) => {
    const styles = {
      ACTIVE: 'bg-green-100 text-green-800 border-green-200',
      SUSPENDED: 'bg-red-100 text-red-800 border-red-200',
      TRIAL: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    };
    return (
      <span
        className={`px-2 py-1 text-xs font-semibold rounded-full border ${
          styles[status as keyof typeof styles] || 'bg-gray-100 text-gray-800 border-gray-200'
        }`}
      >
        {status}
      </span>
    );
  };

  return (
    <div className="max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
          <p className="mt-2 text-gray-600">Platform overview and client statistics</p>
        </div>
        <Link
          href="/admin/clients"
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium"
        >
          Manage Clients
        </Link>
      </div>

      {/* Error State */}
      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-start">
            <div className="text-red-600 text-xl mr-3">⚠️</div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-red-800">Error Loading Client Data</h3>
              <p className="text-sm text-red-700 mt-1">{error}</p>
              <button
                onClick={loadClients}
                className="mt-3 text-sm font-medium text-red-800 hover:text-red-900 underline"
              >
                Retry
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Loading State */}
      {loading && !clients.length && (
        <div className="bg-white rounded-lg shadow-md p-8 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading client statistics...</p>
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && clients.length === 0 && (
        <div className="bg-white rounded-lg shadow-md p-8 text-center">
          <div className="text-6xl mb-4">🏢</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">No Clients Yet</h2>
          <p className="text-gray-600 mb-4">Get started by creating your first client organization</p>
          <Link
            href="/admin/clients"
            className="inline-block px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium"
          >
            Create Client
          </Link>
        </div>
      )}

      {/* Clients Table */}
      {!loading && clients.length > 0 && (
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Client Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Total KYCs
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Verified
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Rejected
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Success Rate
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Created
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {clients.map((client) => (
                  <tr key={client.id} className="hover:bg-gray-50 transition">
                    <td className="px-6 py-4">
                      <div className="font-medium text-gray-900">{client.name}</div>
                      <div className="text-xs text-gray-500 font-mono">{client.id.slice(0, 8)}...</div>
                    </td>
                    <td className="px-6 py-4">{getStatusBadge(client.status)}</td>
                    <td className="px-6 py-4 text-center">
                      <span className="text-2xl font-bold text-gray-900">{client.totalKycs || 0}</span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="text-lg font-semibold text-green-600">{client.verifiedKycs || 0}</span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="text-lg font-semibold text-red-600">{client.rejectedKycs || 0}</span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="inline-flex items-center px-3 py-1 rounded-full bg-blue-100 border border-blue-200">
                        <span className="text-sm font-bold text-blue-800">
                          {calculateSuccessRate(client.verifiedKycs || 0, client.totalKycs || 0)}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center text-sm text-gray-600">
                      {new Date(client.createdAt).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Link
                        href={`/admin/clients/${client.id}`}
                        className="text-blue-600 hover:text-blue-800 font-medium text-sm"
                      >
                        View Details →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Summary Footer */}
          <div className="bg-gray-50 px-6 py-4 border-t border-gray-200">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">
                Total Clients: <span className="font-semibold text-gray-900">{clients.length}</span>
              </span>
              <span className="text-gray-600">
                Total KYC Submissions:{' '}
                <span className="font-semibold text-gray-900">
                  {clients.reduce((sum, client) => sum + (client.totalKycs || 0), 0)}
                </span>
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
