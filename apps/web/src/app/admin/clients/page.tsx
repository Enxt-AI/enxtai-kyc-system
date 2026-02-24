'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { AdminClientListItem } from '@enxtai/shared-types';
import { getAllClients } from '@/lib/api-client';

/**
 * Admin Clients List Page
 *
 * Displays all client organizations with basic stats and actions.
 *
 * @remarks
 * **Features**:
 * - Table view with client name, status, API key (masked), total KYCs
 * - Status badges (ACTIVE = green, SUSPENDED = red, TRIAL = yellow)
 * - Actions: View/Edit, Regenerate Key
 * - Create New Client button
 *
 * **Data Loading**:
 * - Fetches clients on mount via getAllClients() API call
 * - Shows loading state while fetching
 * - Displays error message if fetch fails
 *
 * **Table Columns**:
 * - Name: Organization name (clickable link to detail page)
 * - Status: Badge with color coding
 * - API Key: Masked (first 10 chars + '...')
 * - Total KYCs: Count of submissions
 * - Created: Date in YYYY-MM-DD format
 * - Actions: View/Edit button
 */
export default function AdminClientsPage() {
  const [clients, setClients] = useState<AdminClientListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadClients();
  }, []);

  const loadClients = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getAllClients();
      setClients(data);
    } catch (err: any) {
      setError(err?.message || 'Failed to load clients');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900">Client Management</h1>
          <p className="mt-1 text-sm text-slate-600">
            Manage client organizations and their KYC submissions
          </p>
        </div>
        <Link
          href="/admin/clients/new"
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Create New Client
        </Link>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
          Loading clients...
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* Clients Table */}
      {!loading && !error && (
        <div className="overflow-hidden rounded-lg border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                  Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                  API Key
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                  Total KYCs
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                  Created
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {clients.map((client) => (
                <tr key={client.id} className="hover:bg-slate-50">
                  <td className="px-6 py-4 text-sm font-medium text-slate-900">
                    <Link href={`/admin/clients/${client.id}`} className="hover:text-blue-600">
                      {client.name}
                    </Link>
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <span
                      className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${
                        client.status === 'ACTIVE'
                          ? 'bg-green-100 text-green-800'
                          : client.status === 'SUSPENDED'
                          ? 'bg-red-100 text-red-800'
                          : 'bg-yellow-100 text-yellow-800'
                      }`}
                    >
                      {client.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-500 font-mono">
                    {client.apiKey}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-500">
                    {client.totalKycs}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-500">
                    {new Date(client.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 text-right text-sm">
                    <Link
                      href={`/admin/clients/${client.id}`}
                      className="text-blue-600 hover:text-blue-800"
                    >
                      View/Edit
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Empty State */}
          {clients.length === 0 && (
            <div className="p-8 text-center text-slate-500">
              No clients found. Create your first client to get started.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
